import "server-only";
import { type LiveServerMessage, Modality, type Session } from "@google/genai";
import type { WebSocket } from "ws";
import { z } from "zod";
import { REHEARSAL_LIMITS } from "@/lib/deal-room/rehearsal";
import type { Rehearsal, RehearsalTurn } from "@/lib/schema";
import { genaiLive } from "@/server/ai/client";
import { LIVE_MODEL, LIVE_VOICES } from "@/server/ai/models";
import { adminAuth, db } from "@/server/firebase/admin";
import { RehearsalError, buyerInstruction } from "@/server/pipelines/rehearsal";
import { roleAllows } from "@/server/workspace/roles";

/**
 * One voice rehearsal on the relay (ADR-0017 D2). The browser's first message
 * carries a Firebase ID token and the rehearsal's IDs; the relay checks them
 * against Firestore, opens Gemini Live with the buyer's brief built in code,
 * and pipes audio both ways. Both sides' transcripts are written to the
 * rehearsal, which is the only state that outlives the connection
 * (invariant 8). The token is verified and dropped: never stored or logged.
 */

const Hello = z.object({
  type: z.literal("hello"),
  idToken: z.string().min(20).max(8000),
  workspaceId: z.string().min(1).max(128),
  opportunityId: z.string().min(1).max(128),
  rehearsalId: z.string().min(1).max(128),
});

const HELLO_TIMEOUT_MS = 10_000;
/** About 0.5 s of 16 kHz 16-bit audio; anything bigger isn't a mic frame. */
export const MAX_FRAME_BYTES = 64 * 1024;

class Refused extends Error {}

const log = (rehearsalId: string, message: string) => console.log(`[live] ${rehearsalId.slice(0, 8)} ${message}`);

function send(socket: WebSocket, message: object) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function refuse(socket: WebSocket, message: string) {
  send(socket, { type: "error", message });
  socket.close(1008, "refused");
}

/** Who may connect: a signed-in member of that workspace, allowed to start runs, who started this rehearsal moments ago. */
async function admit(hello: z.infer<typeof Hello>) {
  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(hello.idToken)).uid;
  } catch {
    throw new Refused("Your sign-in has expired. Reload the page and try again.");
  }
  const ws = hello.workspaceId;
  const [user, member, workspace, flags] = await Promise.all([
    db().doc(`users/${uid}`).get(),
    db().doc(`workspaces/${ws}/members/${uid}`).get(),
    db().doc(`workspaces/${ws}`).get(),
    db().doc("system/flags").get(),
  ]);
  // Invariant 7: the workspace must be the caller's own, with a role that may start runs (ADR-0008).
  if (user.get("workspaceId") !== ws || !roleAllows(member.get("role"), "editor") || !workspace.exists) throw new Refused("You don't have access to this rehearsal.");
  if (flags.exists && flags.get("agentsEnabled") === false) throw new Refused("The agents are paused for now. Try again later.");

  const ref = db().doc(`workspaces/${ws}/opportunities/${hello.opportunityId}/rehearsals/${hello.rehearsalId}`);
  const startedAt = new Date().toISOString();
  // Claim it in a transaction, so one rehearsal opens one Live session.
  const rehearsal = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Rehearsal | undefined;
    if (!data || data.createdByUid !== uid || data.mode !== "voice") throw new Refused("You don't have access to this rehearsal.");
    if (data.status !== "ready") throw new Refused("This rehearsal has already started or ended. Start a new one.");
    if (Date.now() - Date.parse(data.startedAt) > REHEARSAL_LIMITS.connectWithinMs) throw new Refused("This rehearsal waited too long to connect. Start a new one.");
    tx.update(ref, { status: "live", startedAt });
    return { ...data, startedAt };
  });
  return { ref, rehearsal, seller: String(workspace.get("name") ?? "the seller") };
}

export function handleConnection(socket: WebSocket) {
  let started = false;
  const helloTimer = setTimeout(() => refuse(socket, "The rehearsal didn't start in time. Try again."), HELLO_TIMEOUT_MS);

  socket.once("message", (data, isBinary) => {
    clearTimeout(helloTimer);
    if (isBinary) return refuse(socket, "The rehearsal didn't start properly. Try again.");
    let hello: z.infer<typeof Hello>;
    try {
      hello = Hello.parse(JSON.parse(String(data)));
    } catch {
      return refuse(socket, "The rehearsal didn't start properly. Try again.");
    }
    started = true;
    void run(socket, hello).catch((err) => {
      if (err instanceof Refused || err instanceof RehearsalError) return refuse(socket, err.message);
      console.error(`[live] ${hello.rehearsalId.slice(0, 8)} failed: ${(err as Error).name}`);
      refuse(socket, "The voice rehearsal couldn't continue. Try again, or rehearse by typing.");
    });
  });
  socket.on("close", () => {
    if (!started) clearTimeout(helloTimer);
  });
}

async function run(socket: WebSocket, hello: z.infer<typeof Hello>) {
  const { ref, rehearsal, seller } = await admit(hello);
  const id = hello.rehearsalId;
  const t0 = Date.parse(rehearsal.startedAt);
  const turns: RehearsalTurn[] = [];
  const buffer: Record<RehearsalTurn["who"], { text: string; at: number }> = { buyer: { text: "", at: 0 }, seller: { text: "", at: 0 } };
  let ended = false;
  let session: Session | null = null;
  let saveTimer: NodeJS.Timeout | null = null;

  const save = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (!ended) void ref.update({ turns: JSON.parse(JSON.stringify(turns)) }).catch(() => {});
    }, 400);
  };
  const flush = (who: RehearsalTurn["who"]) => {
    const text = buffer[who].text.replace(/\s+/g, " ").trim();
    buffer[who].text = "";
    if (!text) return;
    turns.push({ who, text: text.slice(0, REHEARSAL_LIMITS.turnChars * 2), at: buffer[who].at });
    save();
  };
  const hear = (who: RehearsalTurn["who"], text: string | undefined) => {
    if (!text) return;
    // The other side starting to speak closes their turn.
    flush(who === "buyer" ? "seller" : "buyer");
    if (!buffer[who].text) buffer[who].at = Math.max(0, Math.round((Date.now() - t0) / 1000));
    buffer[who].text += text;
  };

  const end = async (reason: NonNullable<Rehearsal["endReason"]>) => {
    if (ended) return;
    flush("seller");
    flush("buyer");
    ended = true;
    clearTimeout(cap);
    if (saveTimer) clearTimeout(saveTimer);
    try {
      session?.close();
    } catch {
      // already closed
    }
    await ref.update({ status: "ended", endedAt: new Date().toISOString(), endReason: reason, turns: JSON.parse(JSON.stringify(turns)) }).catch(() => {});
    log(id, `ended: ${reason}, ${turns.length} turns`);
    send(socket, { type: "ended", reason });
    socket.close(1000, "ended");
  };
  // FR-REH-3: the 10-minute cap is enforced here, whatever the browser does.
  const cap = setTimeout(() => void end("time"), REHEARSAL_LIMITS.seconds * 1000);

  const { system } = await buyerInstruction(hello.workspaceId, hello.opportunityId, rehearsal, { seller, presenter: rehearsal.createdBy });
  try {
    session = await genaiLive().live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: system,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE_VOICES[rehearsal.voice ?? "female"] } } },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { slidingWindow: {} },
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          const content = message.serverContent;
          if (content) {
            for (const part of content.modelTurn?.parts ?? []) {
              if (part.inlineData?.data && socket.readyState === socket.OPEN) socket.send(Buffer.from(part.inlineData.data, "base64"));
            }
            hear("seller", content.inputTranscription?.text);
            hear("buyer", content.outputTranscription?.text);
            if (content.interrupted) send(socket, { type: "interrupted" });
            if (content.turnComplete) flush("buyer");
          }
          // Gemini will close the connection soon; a rehearsal fits in one, so end it cleanly.
          if (message.goAway) void end("time");
        },
        onerror: () => log(id, "live error"),
        onclose: () => void end("dropped"),
      },
    });
  } catch (err) {
    clearTimeout(cap);
    ended = true;
    await ref.update({ status: "failed", error: "Gemini's voice service didn't answer. Try again, or rehearse by typing." }).catch(() => {});
    throw err;
  }
  log(id, "live");

  socket.on("message", (data, isBinary) => {
    if (ended || !session) return;
    if (!isBinary) {
      try {
        if (JSON.parse(String(data))?.type === "end") void end("person");
      } catch {
        // ignore
      }
      return;
    }
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (bytes.length === 0 || bytes.length > MAX_FRAME_BYTES) return;
    session.sendRealtimeInput({ audio: { data: bytes.toString("base64"), mimeType: "audio/pcm;rate=16000" } });
  });
  socket.on("close", () => void end("dropped"));

  // The buyer opens the meeting (rehearsal-buyer.md).
  session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "(The seller has joined the meeting. Greet them briefly and ask your first, hardest question.)" }] }], turnComplete: true });
  send(socket, { type: "ready" });
}

"use client";

/**
 * The browser's side of a voice rehearsal (PRD FR-REH-3, ADR-0017 D2). It
 * talks only to FlowHub's relay, never to a model (invariant 9): it sends the
 * microphone as 16 kHz 16-bit PCM and plays the buyer's 24 kHz PCM back.
 * Transcripts don't come through here; the deal room reads them from
 * Firestore. The Firebase ID token goes in the first message only.
 *
 * Protocol:
 * - browser → relay: `{type:"hello", idToken, workspaceId, opportunityId, rehearsalId}`, then binary mic frames, and `{type:"end"}`.
 * - relay → browser: `{type:"ready"}`, binary audio, `{type:"interrupted"}`, `{type:"ended", reason}`, `{type:"error", message}`.
 */

export type VoiceState = "connecting" | "live" | "ended" | "error";
export type VoiceEvents = {
  onState: (state: VoiceState, message?: string) => void;
  /** 0 to 1, for the orb: the louder of the mic and the buyer. */
  onLevel?: (level: number) => void;
};

const MIC_RATE = 16_000;
const OUT_RATE = 24_000;
/** About 100 ms of audio per frame sent. */
const FRAME_SAMPLES = 1_600;

// Copies each block of mic samples to the main thread. Loaded from a Blob URL, so no extra file is served.
const WORKLET = `
class Mic extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("fh-mic", Mic);
`;

function toPcm16(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

/** Says why the browser refused the microphone, so the person knows what to change. */
function micMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (!window.isSecureContext) return "The microphone only works on an https:// address. Open FlowHub from its https link, or rehearse by typing.";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The microphone is blocked for FlowHub. Click the icon left of the address bar, set Microphone to Allow, reload, and start a new rehearsal. If it's already allowed, check that Windows lets apps use the microphone (Settings › Privacy & security › Microphone).";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found. Plug one in or pick one in the browser's settings, then start a new rehearsal. Or rehearse by typing.";
  if (name === "NotReadableError" || name === "AbortError") return "Another app is using the microphone (a call, perhaps). Close it, then start a new rehearsal. Or rehearse by typing.";
  return `FlowHub couldn't use your microphone${name ? ` (${name})` : ""}. Rehearse by typing instead.`;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += (samples[i] ?? 0) ** 2;
  return Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 4);
}

export class VoiceRehearsal {
  private socket: WebSocket | null = null;
  private micContext: AudioContext | null = null;
  private outContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private pending: Float32Array[] = [];
  private pendingLength = 0;
  private playhead = 0;
  private playing = new Set<AudioBufferSourceNode>();
  private state: VoiceState = "connecting";

  constructor(private readonly events: VoiceEvents) {}

  private setState(state: VoiceState, message?: string) {
    if (this.state === "ended" || this.state === "error") return;
    this.state = state;
    this.events.onState(state, message);
    if (state === "ended" || state === "error") this.teardown();
  }

  /** Asks for the microphone, then connects. Call from a click, so the browser lets audio play. */
  async start(url: string, hello: { idToken: string; workspaceId: string; opportunityId: string; rehearsalId: string }) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      this.setState("error", micMessage(err));
      return;
    }
    this.micContext = new AudioContext({ sampleRate: MIC_RATE });
    this.outContext = new AudioContext({ sampleRate: OUT_RATE });
    const workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await this.micContext.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    const socket = new WebSocket(`${url.replace(/\/$/, "")}/rehearse`);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "hello", ...hello }));
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) return this.play(event.data);
      let message: { type?: string; message?: string; reason?: string };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === "ready") {
        this.listen();
        this.setState("live");
      } else if (message.type === "interrupted") this.flush();
      else if (message.type === "ended") this.setState("ended", message.reason);
      else if (message.type === "error") this.setState("error", message.message ?? "The rehearsal stopped.");
    };
    socket.onerror = () => this.setState("error", "The connection to FlowHub's voice service failed. Rehearse by typing instead.");
    socket.onclose = () => this.setState("ended");
  }

  private listen() {
    if (!this.micContext || !this.stream) return;
    const source = this.micContext.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.micContext, "fh-mic");
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      this.pending.push(event.data);
      this.pendingLength += event.data.length;
      if (this.pendingLength < FRAME_SAMPLES) return;
      const frame = new Float32Array(this.pendingLength);
      let offset = 0;
      for (const chunk of this.pending) {
        frame.set(chunk, offset);
        offset += chunk.length;
      }
      this.pending = [];
      this.pendingLength = 0;
      this.events.onLevel?.(rms(frame));
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(toPcm16(frame));
    };
    source.connect(node);
  }

  private play(data: ArrayBuffer) {
    const context = this.outContext;
    if (!context) return;
    const pcm = new Int16Array(data);
    const samples = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) samples[i] = (pcm[i] ?? 0) / 0x8000;
    this.events.onLevel?.(rms(samples));
    const buffer = context.createBuffer(1, samples.length, OUT_RATE);
    buffer.copyToChannel(samples, 0);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    this.playhead = Math.max(this.playhead, context.currentTime + 0.05);
    node.start(this.playhead);
    this.playhead += buffer.duration;
    this.playing.add(node);
    node.onended = () => this.playing.delete(node);
  }

  /** The person talked over the buyer: stop what's queued. */
  private flush() {
    for (const node of this.playing) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    this.playing.clear();
    this.playhead = 0;
  }

  /** The person ends the call. The relay marks the rehearsal ended in Firestore. */
  end() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "end" }));
    this.setState("ended", "person");
  }

  private teardown() {
    this.flush();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.micContext?.close().catch(() => {});
    void this.outContext?.close().catch(() => {});
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      // Give the end message a moment to leave before closing.
      const socket = this.socket;
      setTimeout(() => socket.close(1000), 300);
    }
    this.socket = null;
    this.events.onLevel?.(0);
  }
}

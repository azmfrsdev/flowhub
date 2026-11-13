import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarInvite, Workspace } from "@/lib/schema";

/** A small in-memory Firestore: documents by path, collections by prefix, transactions applied at once. */
const { docs, dispatchJob } = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), dispatchJob: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/jobs/dispatch", () => ({ dispatchJob }));
vi.mock("@/server/firebase/admin", () => {
  let auto = 0;
  const snap = (path: string) => {
    const data = docs.get(path);
    return { exists: Boolean(data), id: path.split("/").at(-1), data: () => data, get: (field: string) => field.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], data) };
  };
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    id: path.split("/").at(-1),
    get: async () => snap(path),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string): Record<string, unknown> => ({
    path,
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++auto}`}`),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({ docs: [...docs.keys()].filter((key) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1 && docs.get(key)?.[field] === value).map(snap) }),
    }),
    isCollection: true,
  });
  const read = async (ref: { path: string; isCollection?: boolean }) =>
    ref.isCollection ? { docs: [...docs.keys()].filter((key) => key.startsWith(`${ref.path}/`) && key.split("/").length === ref.path.split("/").length + 1).map(snap) } : snap(ref.path);
  return {
    db: () => ({
      doc: docRef,
      collection: collectionRef,
      runTransaction: async <T,>(work: (tx: unknown) => Promise<T>) =>
        work({
          get: read,
          set: (ref: { path: string }, data: Record<string, unknown>) => docs.set(ref.path, JSON.parse(JSON.stringify(data))),
          update: (ref: { path: string }, patch: Record<string, unknown>) => docs.set(ref.path, { ...docs.get(ref.path), ...patch }),
        }),
    }),
  };
});

import { NotesError, meetingsWantingNotes, notesWaiting, receiveNotes } from "./notes";

const INVITE = "0123456789abcdefghijklmnop";
const workspace = { id: "ws_1", name: "Olvessa Cloud" } as Workspace;
const invite: CalendarInvite = {
  id: INVITE,
  opportunityId: "opp_1",
  writeRunId: "run_w",
  status: "sent",
  title: "Olvessa Cloud × Pelita Waris Logistics: proposal walkthrough",
  details: "Introductions\nThe proposal",
  start: "2026-12-04T02:00:00.000Z",
  end: "2026-12-04T03:00:00.000Z",
  timeZone: "Asia/Kuala_Lumpur",
  guests: ["hafiz@pelita.example"],
  organiser: "sales@olvessa.example",
  agendaEdited: false,
  label: "Fri 4 Dec 2026, 10:00",
  tries: 1,
  claimedAt: null,
  sentAt: "2026-12-01T02:00:00.000Z",
  eventUrl: null,
  meetUrl: null,
  error: null,
  notesAt: null,
  createdAt: "2026-12-01T01:00:00.000Z",
  createdBy: "Nadia",
};
const text = "Met Hafiz and their finance lead. They liked the landing zone plan and want a demo next Tuesday. Asked about payment terms over 3 months.";
const input = { inviteId: INVITE, docTitle: "Pelita Waris Logistics notes", docUrl: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrS/edit", text, foundIn: "folder" as const };
const notesPath = `workspaces/ws_1/opportunities/opp_1/driveNotes/${INVITE}`;

beforeEach(() => {
  docs.clear();
  dispatchJob.mockReset();
  docs.set(`workspaces/ws_1/invites/${INVITE}`, { ...invite });
  docs.set("workspaces/ws_1/opportunities/opp_1", { id: "opp_1", prospect: { name: "Pelita Waris Logistics" } });
});

describe("receiveNotes (FR-NOTES-3 to FR-NOTES-5)", () => {
  it("stores the notes, marks the invite and starts the Planner", async () => {
    expect(await receiveNotes(workspace, input)).toEqual({ status: "planning", opportunityId: "opp_1" });
    expect(docs.get(notesPath)).toMatchObject({ status: "planning", docTitle: "Pelita Waris Logistics notes", heldOn: "2026-12-04", foundIn: "folder", text });
    expect(docs.get(`workspaces/ws_1/invites/${INVITE}`)?.notesAt).toEqual(expect.any(String));
    expect(dispatchJob).toHaveBeenCalledExactlyOnceWith({ kind: "drive-notes", workspaceId: "ws_1", opportunityId: "opp_1", notesId: INVITE });
    const audit = [...docs.entries()].find(([key]) => key.startsWith("workspaces/ws_1/auditEvents/"))?.[1];
    expect(audit).toMatchObject({ action: "create", entity: "meeting-notes", by: "flowhub-drive" });
  });

  it("takes a meeting's notes once: a second send plans nothing", async () => {
    await receiveNotes(workspace, input);
    expect(await receiveNotes(workspace, { ...input, text: `${text} A second version.` })).toEqual({ status: "duplicate", opportunityId: "opp_1" });
    expect(dispatchJob).toHaveBeenCalledOnce();
    expect(docs.get(notesPath)?.text).toBe(text);
  });

  it("never replaces a person's pasted notes: they wait with Use these", async () => {
    docs.set("workspaces/ws_1/opportunities/opp_1/meetings/m1", { createdAt: "2026-12-04T04:00:00.000Z", example: null, source: null });
    expect((await receiveNotes(workspace, input)).status).toBe("waiting");
    expect(docs.get(notesPath)?.status).toBe("waiting");
    expect(docs.get("workspaces/ws_1/opportunities/opp_1/meetings/m1")).toEqual({ createdAt: "2026-12-04T04:00:00.000Z", example: null, source: null });
    expect(dispatchJob).not.toHaveBeenCalled();
  });

  it("reads only the key's workspace (invariant 7): another workspace's meeting is not found", async () => {
    docs.delete(`workspaces/ws_1/invites/${INVITE}`);
    docs.set(`workspaces/ws_2/invites/${INVITE}`, { ...invite });
    docs.set("workspaces/ws_2/opportunities/opp_1", { id: "opp_1" });
    await expect(receiveNotes(workspace, input)).rejects.toMatchObject({ status: 404 });
    expect([...docs.keys()].some((key) => key.includes("driveNotes"))).toBe(false);
  });

  it("refuses notes for an invite that wasn't sent", async () => {
    docs.set(`workspaces/ws_1/invites/${INVITE}`, { ...invite, status: "queued" });
    await expect(receiveNotes(workspace, input)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a link that isn't a Google Doc, and notes too short to plan from, before touching Firestore", async () => {
    await expect(receiveNotes(workspace, { ...input, docUrl: "https://evil.example/document/d/1AbCdEfGhIjKlMnOp/edit" })).rejects.toBeInstanceOf(NotesError);
    await expect(receiveNotes(workspace, { ...input, text: "  hi  " })).rejects.toMatchObject({ status: 422 });
    expect(docs.get(`workspaces/ws_1/invites/${INVITE}`)?.notesAt).toBeNull();
  });

  it("keeps nothing for a deal in the recycle bin, and stops the script looking", async () => {
    docs.set("workspaces/ws_1/opportunities/opp_1", { id: "opp_1", deletedAt: "2026-12-02T00:00:00.000Z" });
    expect(await receiveNotes(workspace, input)).toEqual({ status: "removed" });
    expect(docs.has(notesPath)).toBe(false);
    expect(docs.get(`workspaces/ws_1/invites/${INVITE}`)?.notesAt).toEqual(expect.any(String));
  });
});

describe("meetingsWantingNotes (FR-NOTES-1)", () => {
  it("lists a sent meeting that is over, with the prospect to search by, and nothing else", async () => {
    const after = Date.parse(invite.end) + 60_000;
    expect(await notesWaiting("ws_1", after)).toBe(1);
    const meetings = await meetingsWantingNotes("ws_1", after);
    expect(meetings).toEqual([{ id: INVITE, title: invite.title, prospect: "Pelita Waris Logistics", start: invite.start, end: invite.end }]);
  });

  it("lists nothing before the meeting ends, or once notes came", async () => {
    expect(await notesWaiting("ws_1", Date.parse(invite.start))).toBe(0);
    docs.set(`workspaces/ws_1/invites/${INVITE}`, { ...invite, notesAt: invite.end });
    expect(await notesWaiting("ws_1", Date.parse(invite.end) + 60_000)).toBe(0);
  });
});

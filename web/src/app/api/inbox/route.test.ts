import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashInboxKey, newInboxKey } from "@/server/inbox/keys";

const { docs, update, triageEmail, receiveNotes } = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), update: vi.fn(), triageEmail: vi.fn(), receiveNotes: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/pipelines/inbox", () => ({ InboxError: class InboxError extends Error {}, triageEmail }));
vi.mock("@/server/inbox/notes", () => ({
  NotesError: class NotesError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
  notesWaiting: async () => 1,
  meetingsWantingNotes: async () => [{ id: "0123456789abcdefghijklmnop", title: "Olvessa Cloud × Pelita Waris: proposal", prospect: "Pelita Waris", start: "2026-12-04T02:00:00.000Z", end: "2026-12-04T03:00:00.000Z" }],
  receiveNotes,
}));
vi.mock("@/server/inbox/invites", () => ({ invitesWaiting: async () => 0, claimInvites: async () => [], recordInviteResult: async () => false }));
vi.mock("@/server/firebase/admin", () => ({
  db: () => ({
    doc: (path: string) => {
      const ref = {
        id: path.split("/").at(-1),
        get: async () => {
          const data = docs.get(path);
          return { exists: Boolean(data), id: path.split("/").at(-1), data: () => data, get: (field: string) => data?.[field] };
        },
        update,
        collection: (name: string) => ({ doc: (id: string) => ({ get: async () => ({ exists: false, data: () => undefined, get: () => undefined }), id, path: `${path}/${name}/${id}` }) }),
      };
      return ref;
    },
  }),
}));

import { POST } from "./route";

const key = newInboxKey();
const hash = hashInboxKey(key)!;
const workspace = { name: "Olvessa Cloud", country: "MY", currency: "MYR", createdAt: "2026-10-13T00:00:00+08:00", createdBy: "u1", inbox: { keyHash: hash, keyHint: key.slice(-4), autoIntake: true } };
const call = (body: unknown, auth?: string) => POST(new Request("http://localhost/api/inbox", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) }));

beforeEach(() => {
  docs.clear();
  update.mockReset();
  triageEmail.mockReset();
  receiveNotes.mockReset();
  docs.set(`inboxKeys/${hash}`, { workspaceId: "ws_1" });
  docs.set("workspaces/ws_1", workspace);
});

describe("POST /api/inbox: the workspace key (ADR-0020 D2)", () => {
  it("refuses a request with no key", async () => {
    expect((await call({ action: "ping" })).status).toBe(401);
  });

  it("refuses a malformed key", async () => {
    expect((await call({ action: "ping" }, "Bearer fhk_nope")).status).toBe(401);
  });

  it("refuses a well-formed key FlowHub doesn't know", async () => {
    expect((await call({ action: "ping" }, `Bearer ${newInboxKey()}`)).status).toBe(401);
  });

  it("refuses a replaced key, even if its lookup document was left behind", async () => {
    docs.set("workspaces/ws_1", { ...workspace, inbox: { ...workspace.inbox, keyHash: "0".repeat(64) } });
    expect((await call({ action: "ping" }, `Bearer ${key}`)).status).toBe(401);
  });

  it("accepts the workspace's key and records the check", async () => {
    const response = await call({ action: "ping", mailbox: "Sales@Olvessa.example" }, `Bearer ${key}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, workspace: "Olvessa Cloud", invites: 0, notes: 1 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ "inbox.mailbox": "sales@olvessa.example" }));
  });

  it("refuses a body of the wrong shape, without reading an email", async () => {
    const response = await call({ action: "triage", email: { messageId: "../x" } }, `Bearer ${key}`);
    expect(response.status).toBe(400);
    expect(triageEmail).not.toHaveBeenCalled();
  });

  it("refuses an invite result with an ID that isn't FlowHub's", async () => {
    const response = await call({ action: "invite-result", id: "../../opportunities/x", ok: true }, `Bearer ${key}`);
    expect(response.status).toBe(400);
  });

  it("answers status for an email it hasn't read", async () => {
    const response = await call({ action: "status", messageId: "18c2f0a9b7d1e001" }, `Bearer ${key}`);
    expect(await response.json()).toEqual({ found: false });
  });
});

describe("POST /api/inbox: meeting notes from Drive (FR-NOTES-1, FR-NOTES-3)", () => {
  const notes = { action: "notes", id: "0123456789abcdefghijklmnop", docTitle: "Pelita Waris notes", docUrl: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit", text: "Met Hafiz. They want a demo next Tuesday and asked about payment terms.", foundIn: "folder" };

  it("refuses notes with no key, or a key FlowHub doesn't know, before storing anything", async () => {
    expect((await call(notes)).status).toBe(401);
    expect((await call(notes, `Bearer ${newInboxKey()}`)).status).toBe(401);
    expect(receiveNotes).not.toHaveBeenCalled();
  });

  it("refuses notes for an ID that isn't one of FlowHub's invites", async () => {
    expect((await call({ ...notes, id: "../opportunities/x" }, `Bearer ${key}`)).status).toBe(400);
    expect(receiveNotes).not.toHaveBeenCalled();
  });

  it("refuses notes longer than the script sends", async () => {
    expect((await call({ ...notes, text: "a".repeat(30000) }, `Bearer ${key}`)).status).toBe(400);
  });

  it("passes the key's workspace, never one from the body", async () => {
    receiveNotes.mockResolvedValue({ status: "planning", opportunityId: "opp_1" });
    const response = await call({ ...notes, workspaceId: "ws_2" }, `Bearer ${key}`);
    expect(await response.json()).toEqual({ status: "planning", url: "http://localhost/opportunities/opp_1" });
    expect(receiveNotes.mock.calls[0][0]).toMatchObject({ id: "ws_1" });
  });

  it("answers a second send as a duplicate", async () => {
    receiveNotes.mockResolvedValue({ status: "duplicate", opportunityId: "opp_1" });
    expect(await (await call(notes, `Bearer ${key}`)).json()).toMatchObject({ status: "duplicate" });
  });

  it("lists the meetings that want notes, with the folder, and no agenda or guests", async () => {
    const body = await (await call({ action: "notes-wanted" }, `Bearer ${key}`)).json();
    expect(body.folder).toBe("FlowHub notes");
    expect(Object.keys(body.meetings[0]).sort()).toEqual(["end", "id", "prospect", "start", "title"]);
  });
});

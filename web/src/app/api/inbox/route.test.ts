import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashInboxKey, newInboxKey } from "@/server/inbox/keys";

const { docs, update, triageEmail, triageForm, receiveNotes } = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), update: vi.fn(), triageEmail: vi.fn(), triageForm: vi.fn(), receiveNotes: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/pipelines/inbox", () => ({ InboxError: class InboxError extends Error {}, triageEmail, triageForm }));
vi.mock("@/server/graph/load", async () => {
  const { olvessa } = await import("@/lib/sample/olvessa");
  return { getGraphFor: async () => olvessa };
});
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
  triageForm.mockReset();
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

describe("POST /api/inbox: the website form (PRD 7.30, ADR-0022)", () => {
  const form = {
    responseId: "2_ABaOnudEXAMPLE0123456789",
    submittedAt: "2026-12-04T10:15:00+08:00",
    name: "Farah Hashim",
    email: "farah@kedaicontoh.com.my",
    company: "Kedai Contoh Retail",
    website: "https://kedaicontoh.com.my",
    services: ["Google Cloud migration", "Data and analytics on BigQuery"],
    timeline: "In 1 to 3 months",
    message: "We run 40 stores and want daily dashboards. Could you send a proposal?",
    consent: true,
  };
  const item = { id: `wf_${form.responseId}`, source: "form", verdict: "lead", status: "intake_started", score: 90, summary: "A retailer wants dashboards.", company: { name: "Kedai Contoh Retail" }, matches: [{ offeringId: "off_gcm", label: "Google Cloud migration" }, { offeringId: "off_bq", label: "Data and analytics on BigQuery" }], opportunityId: null, dealName: null };

  it("refuses an answer with no key, or a key FlowHub doesn't know, before reading it", async () => {
    expect((await call({ action: "form", form })).status).toBe(401);
    expect((await call({ action: "form", form }, `Bearer ${newInboxKey()}`)).status).toBe(401);
    expect(triageForm).not.toHaveBeenCalled();
  });

  it("passes the key's workspace, never one from the answer", async () => {
    triageForm.mockResolvedValue({ kind: "item", item, fresh: true });
    const response = await call({ action: "form", form: { ...form, workspaceId: "ws_other" } }, `Bearer ${key}`);
    expect(response.status).toBe(200);
    expect(triageForm.mock.calls[0][0]).toMatchObject({ id: "ws_1", name: "Olvessa Cloud" });
    expect(triageForm.mock.calls[0][1]).not.toHaveProperty("workspaceId");
  });

  it("answers with the verdict, the offerings and a link, never the message or a price", async () => {
    triageForm.mockResolvedValue({ kind: "item", item: { ...item, body: "We run 40 stores, RM 9,000" }, fresh: true });
    const body = await (await call({ action: "form", form }, `Bearer ${key}`)).json();
    expect(body.item).toMatchObject({ verdict: "lead", offerings: ["Google Cloud migration", "Data and analytics on BigQuery"], url: "http://localhost/inbox/wf_2_ABaOnudEXAMPLE0123456789" });
    expect(JSON.stringify(body)).not.toContain("40 stores");
    expect(JSON.stringify(body)).not.toMatch(/RM\s?\d/);
  });

  it("refuses junk before anything is read: no consent tick, no email, a bad email, or a bad response ID", async () => {
    for (const bad of [{ ...form, consent: false }, { ...form, email: undefined }, { ...form, email: "nobody" }, { ...form, responseId: "../../etc" }, { ...form, services: Array(25).fill("x") }]) {
      expect((await call({ action: "form", form: bad }, `Bearer ${key}`)).status).toBe(400);
    }
    expect(triageForm).not.toHaveBeenCalled();
  });

  it("lists the live offerings' names for createLeadForm, and nothing else of the catalogue (invariant 2)", async () => {
    const response = await call({ action: "form-setup" }, `Bearer ${key}`);
    const body = await response.json();
    expect(body).toEqual({ title: "Talk to Olvessa", seller: "Olvessa Cloud", services: ["Google Cloud migration", "Migration assessment", "Managed cloud operations", "Data and analytics on BigQuery", "Workspace rollout", "AI agent build"] });
    expect(JSON.stringify(body)).not.toMatch(/RM|\d{3}/);
  });

  it("stores the form's and the website's https addresses from a ping, and refuses anything else", async () => {
    await call({ action: "ping", formUrl: "https://docs.google.com/forms/d/e/abc/viewform", siteUrl: "https://olvessa-cloud.web.app" }, `Bearer ${key}`);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ "inbox.formUrl": "https://docs.google.com/forms/d/e/abc/viewform", "inbox.siteUrl": "https://olvessa-cloud.web.app" }));
    expect((await call({ action: "ping", siteUrl: "javascript:alert(1)" }, `Bearer ${key}`)).status).toBe(400);
    expect((await call({ action: "ping", siteUrl: "http://olvessa.example" }, `Bearer ${key}`)).status).toBe(400);
  });

  it("leaves the form's addresses alone when a ping doesn't mention them", async () => {
    await call({ action: "ping", mailbox: "sales@olvessa.example" }, `Bearer ${key}`);
    expect(update.mock.calls[0][0]).not.toHaveProperty("inbox.formUrl");
  });
});

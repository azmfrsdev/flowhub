import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashInboxKey, newInboxKey } from "@/server/inbox/keys";

const { docs, update, triageEmail } = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), update: vi.fn(), triageEmail: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/pipelines/inbox", () => ({ InboxError: class InboxError extends Error {}, triageEmail }));
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
    expect(await response.json()).toMatchObject({ ok: true, workspace: "Olvessa Cloud" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ "inbox.mailbox": "sales@olvessa.example" }));
  });

  it("refuses a body of the wrong shape, without reading an email", async () => {
    const response = await call({ action: "triage", email: { messageId: "../x" } }, `Bearer ${key}`);
    expect(response.status).toBe(400);
    expect(triageEmail).not.toHaveBeenCalled();
  });

  it("answers status for an email it hasn't read", async () => {
    const response = await call({ action: "status", messageId: "18c2f0a9b7d1e001" }, `Bearer ${key}`);
    expect(await response.json()).toEqual({ found: false });
  });
});

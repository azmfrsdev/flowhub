import { describe, expect, it } from "vitest";
import { INVITE_ID } from "@/lib/schema";
import { claimDecision, inviteSender, newInviteId, resultPatch } from "./invites";

const now = Date.parse("2026-11-12T10:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

describe("newInviteId (FR-CAL-7)", () => {
  it("is a valid Calendar event ID, so a second try finds the same event", () => {
    for (let i = 0; i < 50; i++) expect(newInviteId()).toMatch(INVITE_ID);
    expect(newInviteId(() => new Uint8Array(26).fill(255))).toBe("v".repeat(26));
  });
});

describe("inviteSender (FR-CAL-6)", () => {
  const inbox = { keyHash: "h", mailbox: "flowhub.my@gmail.com", lastSeenAt: ago(2) };

  it("is the sales inbox while the script checks in", () => {
    expect(inviteSender(inbox, now)).toBe("flowhub.my@gmail.com");
  });

  it("is nobody when the script is stopped, never connected or the key was removed", () => {
    expect(inviteSender({ ...inbox, lastSeenAt: ago(30) }, now)).toBeNull();
    expect(inviteSender({ ...inbox, lastSeenAt: null }, now)).toBeNull();
    expect(inviteSender({ ...inbox, keyHash: null }, now)).toBeNull();
    expect(inviteSender(null, now)).toBeNull();
  });
});

describe("claimDecision (FR-CAL-7)", () => {
  it("hands over a queued invite", () => {
    expect(claimDecision({ status: "queued", tries: 0, claimedAt: null }, now)).toBe("claim");
  });

  it("leaves one the script is sending, until it has gone quiet for ten minutes", () => {
    expect(claimDecision({ status: "sending", tries: 1, claimedAt: ago(2) }, now)).toBe("skip");
    expect(claimDecision({ status: "sending", tries: 1, claimedAt: ago(11) }, now)).toBe("claim");
  });

  it("gives up after three tries, and never touches a sent or failed invite", () => {
    expect(claimDecision({ status: "sending", tries: 3, claimedAt: ago(11) }, now)).toBe("fail");
    expect(claimDecision({ status: "sent", tries: 1, claimedAt: ago(60) }, now)).toBe("skip");
    expect(claimDecision({ status: "failed", tries: 3, claimedAt: ago(60) }, now)).toBe("skip");
  });
});

describe("resultPatch (FR-CAL-8)", () => {
  const at = "2026-11-12T10:01:00.000Z";

  it("records a sent invite with Google's own links only", () => {
    expect(resultPatch({ status: "sending", tries: 1 }, { ok: true, eventUrl: "https://calendar.google.com/calendar/event?eid=abc", meetUrl: "https://meet.google.com/abc-defg-hij" }, at)).toEqual({
      status: "sent",
      sentAt: at,
      eventUrl: "https://calendar.google.com/calendar/event?eid=abc",
      meetUrl: "https://meet.google.com/abc-defg-hij",
      error: null,
    });
    expect(resultPatch({ status: "sending", tries: 1 }, { ok: true, eventUrl: "https://evil.example/calendar.google.com", meetUrl: "javascript:alert(1)" }, at)).toMatchObject({ eventUrl: null, meetUrl: null });
  });

  it("queues a failed try again, and fails it on the third", () => {
    expect(resultPatch({ status: "sending", tries: 1 }, { ok: false, error: "Calendar is busy" }, at)).toEqual({ status: "queued", error: "Calendar is busy", claimedAt: null });
    expect(resultPatch({ status: "sending", tries: 3 }, { ok: false, error: "" }, at)).toEqual({ status: "failed", error: "The Gmail script couldn't send it." });
  });

  it("ignores a report on an invite it didn't hand out", () => {
    expect(resultPatch({ status: "sent", tries: 1 }, { ok: false, error: "x" }, at)).toBeNull();
    expect(resultPatch({ status: "queued", tries: 0 }, { ok: true }, at)).toBeNull();
  });
});

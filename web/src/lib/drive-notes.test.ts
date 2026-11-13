import { describe, expect, it } from "vitest";
import { graphOutline } from "@/lib/deal-room/fit";
import { meetingCatalogue } from "@/lib/deal-room/meeting";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { olvessa, olvessaDocuments } from "@/lib/sample/olvessa";
import { NOTES_MAX_CHARS, NOTES_WINDOW_MS } from "@/lib/schema";
import { arrivalStatus, cleanNotes, docsUrl, heldOnDay, notesRequest, waitingForNotes, wantsNotes } from "./drive-notes";

const end = "2026-12-04T03:00:00.000Z";
const now = Date.parse(end);
const HOUR = 60 * 60 * 1000;
const invite = { status: "sent" as const, end, notesAt: null };

describe("wantsNotes (FR-NOTES-1)", () => {
  it("asks for a sent meeting's notes once it is over, for three days", () => {
    expect(wantsNotes(invite, now - 1)).toBe(false);
    expect(wantsNotes(invite, now)).toBe(true);
    expect(wantsNotes(invite, now + NOTES_WINDOW_MS - 1)).toBe(true);
    expect(wantsNotes(invite, now + NOTES_WINDOW_MS)).toBe(false);
  });

  it("stops once notes came, and never asks for an invite that wasn't sent", () => {
    expect(wantsNotes({ ...invite, notesAt: end }, now + HOUR)).toBe(false);
    for (const status of ["queued", "sending", "failed"] as const) expect(wantsNotes({ ...invite, status }, now + HOUR)).toBe(false);
  });
});

describe("waitingForNotes (FR-NOTES-6)", () => {
  it("shows from the moment the invite is sent until the window closes", () => {
    expect(waitingForNotes(invite, now - 5 * 24 * HOUR)).toBe(true);
    expect(waitingForNotes(invite, now + HOUR)).toBe(true);
    expect(waitingForNotes(invite, now + NOTES_WINDOW_MS)).toBe(false);
    expect(waitingForNotes({ ...invite, notesAt: end }, now + HOUR)).toBe(false);
    expect(waitingForNotes({ ...invite, status: "queued" }, now + HOUR)).toBe(false);
  });
});

describe("docsUrl", () => {
  it("keeps a Google Docs document link", () => {
    expect(docsUrl("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp_qrs-tu/edit")).toBe("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp_qrs-tu/edit");
    expect(docsUrl("https://docs.google.com/document/u/0/d/1AbCdEfGhIjKlMnOp/edit")).not.toBeNull();
  });

  it("refuses anything else", () => {
    for (const url of [
      "http://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit",
      "https://docs.google.com.evil.example/document/d/1AbCdEfGhIjKlMnOp/edit",
      "https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp",
      "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit",
      "javascript:alert(1)",
      "not a url",
    ])
      expect(docsUrl(url)).toBeNull();
  });
});

describe("cleanNotes", () => {
  it("removes control characters and long blank runs", () => {
    expect(cleanNotes("﻿  Notes\r\n\r\n\r\n\r\n- demo next week\u0007  \n").text).toBe("﻿  Notes\n\n- demo next week".trim());
  });

  it("cuts at 20,000 characters and says so", () => {
    const long = cleanNotes("a".repeat(NOTES_MAX_CHARS + 10));
    expect(long.text).toHaveLength(NOTES_MAX_CHARS);
    expect(long.truncated).toBe(true);
    expect(cleanNotes("short").truncated).toBe(false);
  });
});

describe("arrivalStatus (FR-NOTES-5): a person's pasted notes are never replaced", () => {
  const start = "2026-12-04T02:00:00.000Z";
  const pasted = { createdAt: "2026-12-04T05:00:00.000Z", example: null, source: null };

  it("plans when nobody pasted notes for this meeting", () => {
    expect(arrivalStatus([], start)).toBe("planning");
  });

  it("waits when a person pasted notes after the meeting started", () => {
    expect(arrivalStatus([pasted], start)).toBe("waiting");
  });

  it("still plans after an earlier meeting's notes, example notes, or notes from Drive", () => {
    expect(arrivalStatus([{ ...pasted, createdAt: "2026-11-20T05:00:00.000Z" }], start)).toBe("planning");
    expect(arrivalStatus([{ ...pasted, example: "tidy" as const }], start)).toBe("planning");
    expect(arrivalStatus([{ ...pasted, source: { kind: "drive" as const, inviteId: "a".repeat(26), docTitle: "Notes", docUrl: "https://docs.google.com/document/d/x/edit", receivedAt: pasted.createdAt } }], start)).toBe("planning");
  });
});

describe("heldOnDay", () => {
  it("is the meeting's day in the workspace's time zone", () => {
    expect(heldOnDay("2026-12-03T17:30:00.000Z", "Asia/Kuala_Lumpur")).toBe("2026-12-04");
  });
});

describe("what the script and the Planner get never carries cost (invariant 2)", () => {
  const graph: WorkspaceGraph = { ...olvessa, documents: olvessaDocuments };
  const costValues = [
    ...graph.feeSchedules.flatMap((schedule) => schedule.lines.flatMap((line) => (line.cost ? [line.cost] : []))),
    ...graph.partners.flatMap((partner) => (partner.buyPrice ? [partner.buyPrice] : [])),
  ];

  it("the script gets only what finds the Doc: no agenda, no guests, no prices", () => {
    const request = notesRequest({ id: "a".repeat(26), title: "Olvessa Cloud × Pelita Waris: proposal", start: end, end, details: "Agenda RM 48,000", guests: ["x@y.example"] } as never, "Pelita Waris");
    expect(Object.keys(request).sort()).toEqual(["end", "id", "prospect", "start", "title"]);
    expect(JSON.stringify(request)).not.toMatch(/RM|guests|details/);
  });

  it("the Planner's catalogue for Drive notes has no cost value or buy price", () => {
    expect(costValues.length).toBeGreaterThan(3);
    const contacts = new Map(graph.partners.flatMap((partner) => (partner.contacts[0] ? [[partner.id, { name: partner.contacts[0].name }] as const] : [])));
    const json = JSON.stringify([...meetingCatalogue(graphOutline(graph), new Set(graph.offerings.map((offering) => offering.id)), contacts).values()]);
    for (const cost of costValues) expect(json).not.toContain(cost);
    expect(json).not.toMatch(/buyPrice|"cost"/);
  });
});

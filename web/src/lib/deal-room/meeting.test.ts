import { describe, expect, it } from "vitest";
import { type CatalogueEntry, type MeetingDraft, allowedAmounts, checkEmailBody, checkMeetingDraft, quoteFound } from "./meeting";
import { exampleNotes } from "./meeting-examples";

const notes = `Meeting with Kedai Rakyat, 17 Oct
- Finance wants a 10% discount if they sign this quarter,
  and 60-day payment terms.
- IT lead wants a live demo of the sales dashboard on 25 Oct.
- Asked if we can supply the store tablets. Not us.`;

const catalogue = new Map<string, CatalogueEntry>([
  ["o1", { kind: "offering", id: "off_bq", name: "Data and analytics on BigQuery", line: "" }],
  ["pa1", { kind: "partner", id: "par_jn", name: "Jentayu Networks", line: "", contact: { name: "Aiman Rosli", email: "aiman@jentayu.example" } }],
  ["r1", { kind: "rule", id: "con_min", name: "RM 20,000 minimum per engagement.", line: "" }],
]);

const step = (over: Partial<MeetingDraft["steps"][number]>): MeetingDraft["steps"][number] => ({
  kind: "internal",
  title: "Do something",
  detail: "",
  due: "",
  owner: "",
  points: ["p1"],
  refs: [],
  emailSubject: "",
  emailBody: "",
  ...over,
});

describe("quoteFound (FR-MEET-2)", () => {
  it("matches the notes whatever the case, punctuation or line breaks", () => {
    expect(quoteFound(notes, "finance wants a 10% discount if they sign this quarter, and 60-day payment terms")).toBe(true);
    expect(quoteFound(notes, "IT lead wants a live demo of the sales dashboard")).toBe(true);
  });
  it("rejects a paraphrase and a quote too short to mean anything", () => {
    expect(quoteFound(notes, "Finance asked for a discount")).toBe(false);
    expect(quoteFound(notes, "IT")).toBe(false);
  });
});

describe("checkEmailBody (FR-MEET-4)", () => {
  const allowed = allowedAmounts(["RM 48,000 one-time"]);
  it("keeps the greeting on its own line and the paragraphs", () => {
    const { body, removed } = checkEmailBody("Hi Aiman,\nThanks for your time.\n\nBest regards,\nNadia", allowed);
    expect(body).toBe("Hi Aiman,\nThanks for your time.\n\nBest regards,\nNadia");
    expect(removed).toBe(0);
  });
  it("removes only a sentence with an amount that isn't in the notes or the pricing", () => {
    const { body, removed } = checkEmailBody("The project is RM 48,000. We can do it for RM 40,000. Talk soon.", allowed);
    expect(body).toBe("The project is RM 48,000. Talk soon.");
    expect(removed).toBe(1);
  });
});

describe("checkMeetingDraft (FR-MEET-2, FR-MEET-3)", () => {
  const draft: MeetingDraft = {
    summary: "It went well.",
    points: [
      { ref: "p1", kind: "budget", text: "Discount and terms", quote: "Finance wants a 10% discount if they sign this quarter" },
      { ref: "p2", kind: "ask", text: "Tablets", quote: "Asked if we can supply the store tablets" },
      { ref: "p3", kind: "ask", text: "Invented", quote: "They want us to run their payroll" },
    ],
    steps: [
      step({ kind: "approval", title: "Approve the discount", points: ["p1"] }),
      step({ kind: "supplier", title: "Ask Jentayu", points: ["p2"], refs: ["pa1", "x9"], emailSubject: "Tablets", emailBody: "Hi Aiman,\nCan you quote tablets?\nNadia" }),
      step({ kind: "supplier", title: "Find a supplier", points: ["p2"] }),
      step({ kind: "approval", title: "Approve something vague", points: ["p2"] }),
      step({ kind: "internal", title: "From an invented point", points: ["p3"] }),
    ],
  };
  const checked = checkMeetingDraft(draft, { notes, catalogue, allowed: allowedAmounts([notes]) });

  it("drops a point whose quote isn't in the notes, and a step with nothing behind it", () => {
    expect(checked.points.map((point) => point.text)).toEqual(["Discount and terms", "Tablets"]);
    expect(checked.dropped.points).toBe(1);
    expect(checked.steps.map((item) => item.title)).not.toContain("From an invented point");
    expect(checked.dropped.steps).toBe(1);
  });
  it("keeps an approval for a commercial ask, and turns a vague one into an internal step", () => {
    expect(checked.steps.find((item) => item.title === "Approve the discount")?.kind).toBe("approval");
    expect(checked.steps.find((item) => item.title === "Approve something vague")?.kind).toBe("internal");
  });
  it("addresses a supplier email to the partner's contact from the hub, and drops unknown references", () => {
    const ask = checked.steps.find((item) => item.title === "Ask Jentayu");
    expect(ask?.refs).toEqual([{ kind: "partner", id: "par_jn", name: "Jentayu Networks" }]);
    expect(ask?.email).toMatchObject({ to: "aiman@jentayu.example", toName: "Aiman Rosli", subject: "Tablets" });
    expect(ask?.noPartner).toBeUndefined();
  });
  it("says so when no partner in the hub covers a supplier step", () => {
    expect(checked.steps.find((item) => item.title === "Find a supplier")?.noPartner).toBe(true);
  });
});

describe("exampleNotes (FR-MEET-1, ADR-0016 D5)", () => {
  const examples = exampleNotes({
    prospect: "Kedai Rakyat",
    presenter: "Nadia",
    offerings: ["Data and analytics on BigQuery"],
    demo: { offering: "Data and analytics on BigQuery", feature: "Store-level sales dashboard" },
    outside: { need: "Hardware supply or installation.", partner: "Jentayu Networks" },
    extra: "AI agent build",
    today: new Date("2026-10-17T03:00:00Z"),
  });
  it("gives every style the signals each kind of step needs", () => {
    for (const text of Object.values(examples)) {
      expect(text).toContain("Kedai Rakyat");
      expect(text).toContain("Store-level sales dashboard");
      expect(text).toContain("hardware supply or installation");
      expect(text).toContain("Jentayu Networks");
      expect(text).toMatch(/10%/);
      expect(text.toLowerCase()).toContain("tender");
      expect(text.toLowerCase()).toContain("november");
    }
  });
  it("never starts a sentence in lower case when there is no contact name", () => {
    expect(examples.tidy).not.toMatch(/\. their lead/);
    expect(examples.tidy).toContain("Their lead will send");
  });
});

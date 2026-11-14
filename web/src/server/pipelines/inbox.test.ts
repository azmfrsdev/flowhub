import { beforeEach, describe, expect, it, vi } from "vitest";
import { moneyTokens } from "@/lib/pricing/money";
import { olvessa } from "@/lib/sample/olvessa";
import type { InboxReading } from "@/lib/schema";
import { costTokens } from "@/server/proposals/validate";
import { formBody, formQuotable, formTitle, isThin, mapServices } from "@/lib/inbox/form";
import { InboxForm } from "@/lib/schema";
import { assessEmail } from "./inbox";

const { generateJson } = vi.hoisted(() => ({ generateJson: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/generate", () => ({ generateJson, withModelScope: (_: unknown, fn: () => unknown) => fn() }));
vi.mock("@/server/firebase/admin", () => ({ db: vi.fn() }));
vi.mock("@/server/inbox/deal", () => ({ ACTORS: {}, inboxActor: vi.fn(), openDealFromItem: vi.fn() }));
vi.mock("@/server/graph/load", () => ({ getGraphFor: vi.fn() }));

const email = {
  messageId: "18c2f0a9b7d1e001",
  threadId: "18c2f0a9b7d1e001",
  from: "Hafiz Rahman <hafiz.rahman@pelitawaris.com.my>",
  subject: "Moving our servers to Google Cloud: proposal and a call?",
  body: "We run about 140 virtual machines in our own data centre, and the lease on it ends in June 2027. We'd like to move to Google Cloud and need help with the landing zone and the migration itself. Could you send us a proposal? The budget for this is approved.\n\nHafiz Rahman\nHead of IT, Pelita Waris Logistics",
  receivedAt: "2026-11-12T10:42:00+08:00",
};

const reading: InboxReading = {
  verdict: "lead",
  summary: "Pelita Waris Logistics wants to move about 140 VMs to Google Cloud before a lease ends.",
  company: "Pelita Waris Logistics",
  reasons: [
    { kind: "need", text: "A migration-sized estate", quote: "We run about 140 virtual machines in our own data centre" },
    { kind: "deadline", text: "Lease ends June 2027", quote: "the lease on it ends in June 2027" },
    { kind: "request", text: "Asks for a proposal", quote: "Could you send us a proposal?" },
    { kind: "budget", text: "Budget approved", quote: "The budget for this is approved" },
    { kind: "budget", text: "A made-up figure", quote: "a budget of RM 1.2 million" },
  ],
  matches: ["off_gcm/f_lz", "off_gcm/f_wm", "off_gcm_ops", "off_nope"],
};

const input = () => ({
  seller: "Olvessa Cloud",
  offerings: olvessa.offerings,
  rules: olvessa.constraints.filter((rule) => rule.offeringIds.length === 0),
  partners: olvessa.partners,
  deals: [],
  threadDeals: new Map<string, string>(),
  email,
});

beforeEach(() => {
  generateJson.mockReset();
  generateJson.mockResolvedValue(reading);
});

describe("assessEmail (PRD 7.27)", () => {
  it("keeps only checked reasons and live offerings, and scores in code", async () => {
    const result = await assessEmail(input());
    expect(result.reasons).toHaveLength(4);
    expect(result.dropped).toBe(1);
    expect(result.matches.map((match) => match.featureId ?? match.offeringId)).toEqual(expect.arrayContaining(["f_lz", "f_wm"]));
    expect(result.matches.some((match) => match.offeringId === "off_nope")).toBe(false);
    expect(result.company).toMatchObject({ name: "Pelita Waris Logistics", domain: "pelitawaris.com.my", country: "MY" });
    expect(result.score).toBe(result.breakdown.reduce((sum, row) => sum + row.points, 0));
    expect(result.verdict).toBe(result.score >= 70 ? "lead" : "maybe");
  });

  it("makes one Flash call with structured output", async () => {
    await assessEmail(input());
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(generateJson.mock.calls[0][0]).toMatchObject({ tier: "flash" });
  });

  it("never gives Gemini a cost, a buy price or a price (invariant 2)", async () => {
    await assessEmail(input());
    const { system, prompt } = generateJson.mock.calls[0][0] as { system: string; prompt: string };
    const sent = new Set([...moneyTokens(system), ...moneyTokens(prompt)]);
    for (const token of costTokens(olvessa)) expect(sent.has(token)).toBe(false);
    expect(system).not.toMatch(/RM\s?\d/);
  });

  it("puts no cost in its output (invariant 2)", async () => {
    const result = await assessEmail(input());
    const out = new Set(moneyTokens(JSON.stringify(result)));
    for (const token of costTokens(olvessa)) expect(out.has(token)).toBe(false);
  });

  it("makes a clear lead from free mail when the email names its company", async () => {
    const result = await assessEmail({ ...input(), email: { ...email, from: "Hafiz Rahman <hafiz.pelitawaris@gmail.com>" } });
    expect(result.company).toMatchObject({ name: "Pelita Waris Logistics", freeMail: true, nameFromEmail: true });
    expect(result.verdict).toBe("lead");
  });

  it("keeps a free-mail email a maybe when it names no company", async () => {
    generateJson.mockResolvedValue({ ...reading, company: undefined });
    const result = await assessEmail({ ...input(), email: { ...email, from: "Hafiz <hafiz.pelitawaris@gmail.com>" } });
    expect(result.company.name).toBeNull();
    expect(result.verdict).toBe("maybe");
  });

  it("sends an email from a company already open as a deal to that deal", async () => {
    const result = await assessEmail({ ...input(), deals: [{ id: "opp_pw", name: "Pelita Waris Logistics", website: "pelitawaris.com.my" }] });
    expect(result.verdict).toBe("existing_deal");
    expect(result.knownDeal?.id).toBe("opp_pw");
  });

  it("files a partner's invoice as not a lead with a score of 0", async () => {
    generateJson.mockResolvedValue({ ...reading, verdict: "lead" });
    const result = await assessEmail({ ...input(), email: { ...email, from: "Aiman Rosli <aiman@jentayu.example>" } });
    expect(result.partner).toBe("Jentayu Networks");
    expect(result.verdict).toBe("not_a_lead");
    expect(result.score).toBe(0);
  });
});

/* ---------- Website form answers (PRD 7.30, ADR-0022) ---------- */

const formAnswer = (over: Record<string, unknown> = {}) =>
  InboxForm.parse({
    responseId: "2_ABaOnudEXAMPLE0123456789",
    submittedAt: "2026-12-04T10:15:00+08:00",
    name: "Farah Hashim",
    email: "farah@gmail.com",
    company: "Kedai Contoh Retail",
    website: "https://kedaicontoh.com.my",
    services: ["Google Cloud migration", "Data and analytics on BigQuery", "Free iPads"],
    timeline: "In 1 to 3 months",
    message: "We run 40 stores and our weekly sales report takes three days. Could you send us a proposal for daily dashboards before Chinese New Year? Budget is set aside.",
    consent: true,
    ...over,
  });

const formReading: InboxReading = {
  verdict: "lead",
  summary: "A 40-store retailer wants daily dashboards and a proposal.",
  company: "Kedai Contoh Retail",
  reasons: [
    { kind: "need", text: "Slow weekly reporting", quote: "our weekly sales report takes three days" },
    { kind: "request", text: "Asks for a proposal", quote: "Could you send us a proposal for daily dashboards" },
    { kind: "deadline", text: "Before Chinese New Year", quote: "before Chinese New Year" },
    { kind: "budget", text: "Budget set aside", quote: "Budget is set aside" },
  ],
  matches: ["off_bq/f_sd"],
};

function formInput(form: InboxForm) {
  const services = mapServices(form.services, olvessa.offerings);
  return {
    ...input(),
    email: { messageId: form.responseId, threadId: `wf_${form.responseId}`, from: `${form.name} <${form.email}>`, subject: formTitle("Olvessa Cloud"), body: formBody(form), receivedAt: form.submittedAt },
    form: { matches: services.matches, company: form.company || null, thin: isThin(form), quotable: formQuotable(form) },
  };
}

describe("assessEmail on a website form answer (PRD 7.30)", () => {
  it("counts the ticked services as matches by code, and drops a name that isn't an offering", async () => {
    generateJson.mockResolvedValue({ ...formReading, matches: [] });
    const result = await assessEmail(formInput(formAnswer()));
    expect(result.matches.map((match) => match.offeringId)).toEqual(["off_gcm", "off_bq"]);
    expect(result.breakdown[0]).toMatchObject({ points: 20 });
  });

  it("keeps the model's matches from the message only where no ticked box already covers that offering", async () => {
    generateJson.mockResolvedValue({ ...formReading, matches: ["off_bq/f_sd", "off_ai"] });
    const result = await assessEmail(formInput(formAnswer()));
    expect(result.matches.map((match) => match.offeringId)).toEqual(["off_gcm", "off_bq", "off_ai"]);
  });

  it("takes the typed company, checked word for word, even from free mail", async () => {
    generateJson.mockResolvedValue({ ...formReading, company: undefined });
    const result = await assessEmail(formInput(formAnswer()));
    expect(result.company).toMatchObject({ name: "Kedai Contoh Retail", freeMail: true, nameFromEmail: true });
    expect(result.verdict).toBe("lead");
  });

  it("tells Gemini it is a form answer, and never sends it a price or cost (invariant 2)", async () => {
    generateJson.mockResolvedValue(formReading);
    await assessEmail(formInput(formAnswer()));
    const { system, prompt } = generateJson.mock.calls[0][0] as { system: string; prompt: string };
    expect(prompt).toContain('website form "Talk to Olvessa"');
    expect(prompt).toContain("Services ticked: Google Cloud migration");
    const sent = new Set([...moneyTokens(system), ...moneyTokens(prompt)]);
    for (const token of costTokens(olvessa)) expect(sent.has(token)).toBe(false);
  });

  it("puts no cost in its output (invariant 2)", async () => {
    generateJson.mockResolvedValue(formReading);
    const result = await assessEmail(formInput(formAnswer()));
    const out = new Set(moneyTokens(JSON.stringify(result)));
    for (const token of costTokens(olvessa)) expect(out.has(token)).toBe(false);
  });

  it("never makes a clear lead from junk: every box ticked and no message", async () => {
    // Even if Gemini were fooled into "lead", a thin message can't start intake.
    generateJson.mockResolvedValue({ ...formReading, reasons: [], matches: [] });
    const junk = formAnswer({ message: "asdf", company: "", services: ["Google Cloud migration", "Migration assessment", "Managed cloud operations", "Data and analytics on BigQuery", "Workspace rollout", "AI agent build"] });
    const result = await assessEmail(formInput(junk));
    expect(result.verdict).not.toBe("lead");
  });

  it("files spam Gemini reads as not a lead, with a score of 0", async () => {
    generateJson.mockResolvedValue({ verdict: "not_a_lead", summary: "An SEO sales pitch, not a buyer.", reasons: [], matches: [] });
    const result = await assessEmail(formInput(formAnswer({ message: "We can get your website to page one of Google. Reply for our packages, only today!", services: [] })));
    expect(result.verdict).toBe("not_a_lead");
    expect(result.score).toBe(0);
  });

  it("drops a reason that quotes a field, such as the ticked boxes, rather than the person's own words", async () => {
    generateJson.mockResolvedValue({ ...formReading, reasons: [{ kind: "need", text: "Ticked boxes", quote: "Services ticked: Google Cloud migration" }, { kind: "deadline", text: "Soon", quote: "When they want to start: In 1 to 3 months" }] });
    const result = await assessEmail(formInput(formAnswer()));
    expect(result.reasons.map((reason) => reason.kind)).toEqual(["deadline"]);
    expect(result.dropped).toBe(1);
  });

  it("drops a quote that is in the model's answer but not in what the person typed", async () => {
    generateJson.mockResolvedValue({ ...formReading, reasons: [...formReading.reasons, { kind: "budget", text: "Invented", quote: "a budget of RM 500,000" }] });
    const result = await assessEmail(formInput(formAnswer()));
    expect(result.dropped).toBe(1);
  });
});

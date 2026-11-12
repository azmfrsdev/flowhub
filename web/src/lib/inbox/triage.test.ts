import { describe, expect, it } from "vitest";
import { olvessa } from "@/lib/sample/olvessa";
import type { Constraint } from "@/lib/schema";
import {
  checkMatches,
  checkReasons,
  companyOf,
  decideVerdict,
  emailText,
  findKnownDeal,
  findPartner,
  gmailLabel,
  inboxCatalogue,
  inboxRuleConflicts,
  locateQuote,
  parseSender,
  quoteFound,
  scoreEmail,
} from "./triage";

const BODY = `Hi Olvessa team,

We're a logistics company in Klang. We run about 140 virtual machines in our own data centre, and the lease on it ends in June 2027.

We’d like to move to Google Cloud and need help with the landing zone and the migration itself.

Could you send us a proposal, and could we have a call next week? The budget for this is approved for this financial year.

Regards,
Hafiz Rahman
Head of IT, Pelita Waris Logistics`;
const SUBJECT = "Moving our servers to Google Cloud: proposal and a call?";
const TEXT = emailText(SUBJECT, BODY);

describe("the word-for-word quote check (FR-INBOX-4)", () => {
  it("finds a quote copied from the email", () => {
    expect(quoteFound(TEXT, "the lease on it ends in June 2027")).toBe(true);
  });

  it("ignores case, line breaks, runs of spaces and quote styles, and a trailing full stop", () => {
    expect(quoteFound(TEXT, "WE'D LIKE to move   to Google Cloud")).toBe(true);
    expect(quoteFound(TEXT, "approved for this financial\nyear.")).toBe(true);
  });

  it("rejects a paraphrase, a changed number or a made-up sentence", () => {
    expect(quoteFound(TEXT, "the lease ends in June 2027")).toBe(false);
    expect(quoteFound(TEXT, "about 150 virtual machines")).toBe(false);
    expect(quoteFound(TEXT, "We have a budget of RM 500,000")).toBe(false);
  });

  it("rejects quotes too short to mean anything", () => {
    expect(quoteFound(TEXT, "we")).toBe(false);
  });

  it("returns the span in the original text, so the page highlights what passed", () => {
    const span = locateQuote(BODY, "we'd like to move to Google Cloud");
    expect(span).not.toBeNull();
    expect(BODY.slice(span!.start, span!.end)).toBe("We’d like to move to Google Cloud");
  });

  it("keeps reasons whose quote is there and counts the ones dropped", () => {
    const { kept, dropped } = checkReasons(TEXT, [
      { kind: "deadline", text: "Lease ends", quote: "the lease on it ends in June 2027" },
      { kind: "budget", text: "Budget of RM 2 million", quote: "budget of RM 2 million" },
      { kind: "request", text: "Asks for a proposal", quote: "Could you send us a proposal" },
    ]);
    expect(kept.map((reason) => reason.kind)).toEqual(["deadline", "request"]);
    expect(dropped).toBe(1);
  });
});

describe("company from the sender (FR-INBOX-5)", () => {
  it("reads the sender's name and address", () => {
    expect(parseSender('"Hafiz Rahman" <Hafiz.Rahman@PelitaWaris.com.my>')).toEqual({ name: "Hafiz Rahman", email: "hafiz.rahman@pelitawaris.com.my" });
    expect(parseSender("someone@acme.com.my")).toEqual({ name: "someone", email: "someone@acme.com.my" });
    expect(parseSender("not an address")).toBeNull();
  });

  it("takes the domain from the address, and the name only if the email writes it", () => {
    expect(companyOf("hafiz@pelitawaris.com.my", "Pelita Waris Logistics", TEXT)).toEqual({ name: "Pelita Waris Logistics", domain: "pelitawaris.com.my", freeMail: false, country: "MY", nameFromEmail: true });
    expect(companyOf("hafiz@pelitawaris.com.my", "Pelita Group Holdings", TEXT)).toMatchObject({ name: "Pelitawaris", nameFromEmail: false });
  });

  it("from free mail, knows the company only if the email writes its name", () => {
    expect(companyOf("hafiz.pelita@gmail.com", "Pelita Waris Logistics", TEXT)).toEqual({ name: "Pelita Waris Logistics", domain: null, freeMail: true, nameFromEmail: true });
    expect(companyOf("hafiz.pelita@gmail.com", "Pelita Group Holdings", TEXT)).toEqual({ name: null, domain: null, freeMail: true, nameFromEmail: false });
    expect(companyOf("x@yahoo.com.my", undefined, TEXT)).toMatchObject({ name: null, freeMail: true });
  });
});

describe("offerings count only if live (FR-INBOX-5)", () => {
  const offerings = [
    { id: "off_a", name: "Cloud migration", summary: "Moves servers", status: "active", features: [{ id: "f_lz", name: "Landing zone", description: "", status: "active" }, { id: "f_new", name: "Planned thing", description: "", status: "planned" }] },
    { id: "off_old", name: "Old service", summary: "", status: "retired", features: [] },
    { id: "off_gone", name: "Deleted", summary: "", status: "active", deletedAt: "2026-11-01T00:00:00+08:00", features: [] },
    { id: "off_secret", name: "Restricted", summary: "", status: "active", restricted: true, features: [] },
  ];
  const catalogue = inboxCatalogue(offerings);

  it("lists live offerings and active features only", () => {
    expect(catalogue.map((entry) => entry.ref)).toEqual(["off_a", "off_a/f_lz"]);
  });

  it("drops unknown, retired, deleted and planned references, and an offering named with its own feature", () => {
    expect(checkMatches(["off_a", "off_a/f_lz", "off_old", "off_gone", "off_a/f_new", "off_nope", "off_secret"], catalogue)).toEqual([{ offeringId: "off_a", featureId: "f_lz", label: "Landing zone" }]);
  });

  it("never puts a price or a cost in the catalogue (invariant 2)", () => {
    const lines = inboxCatalogue(olvessa.offerings).map((entry) => entry.line).join("\n");
    expect(lines).not.toMatch(/RM\s?\d/);
  });
});

describe("dedupe against open deals (FR-INBOX-6)", () => {
  const deals = [
    { id: "opp_kopi", name: "Kopi Sentosa", website: "https://www.kopisentosa.com.my", contactEmail: "lim@kopisentosa.com.my" },
    { id: "opp_free", name: "Small firm", website: null, contactEmail: "owner@gmail.com" },
    { id: "opp_old", name: "Gone", website: "gone.example", deletedAt: "2026-11-01T00:00:00+08:00" },
  ];

  it("matches the same domain as a deal's website or contact", () => {
    expect(findKnownDeal({ senderEmail: "ops@kopisentosa.com.my", threadId: "t1", deals, threadDeals: new Map() })?.id).toBe("opp_kopi");
  });

  it("matches a free-mail sender only on the exact contact address", () => {
    expect(findKnownDeal({ senderEmail: "owner@gmail.com", threadId: "t1", deals, threadDeals: new Map() })?.id).toBe("opp_free");
    expect(findKnownDeal({ senderEmail: "someone.else@gmail.com", threadId: "t1", deals, threadDeals: new Map() })).toBeNull();
  });

  it("matches a reply in a thread already linked to a deal", () => {
    expect(findKnownDeal({ senderEmail: "new@other.example", threadId: "t9", deals, threadDeals: new Map([["t9", "opp_kopi"]]) })?.id).toBe("opp_kopi");
  });

  it("ignores deleted deals", () => {
    expect(findKnownDeal({ senderEmail: "x@gone.example", threadId: "t1", deals, threadDeals: new Map() })).toBeNull();
  });

  it("recognises a partner recorded in the hub by its contacts' domain", () => {
    expect(findPartner("billing@jentayu.example", olvessa.partners)).toBe("Jentayu Networks");
    expect(findPartner("someone@gmail.com", olvessa.partners)).toBeNull();
  });
});

describe("the score, calculated in code (FR-INBOX-7)", () => {
  it("adds up live offerings and the kinds of quoted reasons", () => {
    const { score, breakdown } = scoreEmail({ matches: 3, kinds: new Set(["need", "request", "deadline", "budget"]), company: { freeMail: false, name: "Pelitawaris" } });
    expect(score).toBe(90);
    expect(breakdown.reduce((sum, row) => sum + row.points, 0)).toBe(90);
  });

  it("caps offerings at four, and gives nothing for free mail with no company named", () => {
    expect(scoreEmail({ matches: 9, kinds: new Set(), company: { freeMail: true, name: null } }).score).toBe(40);
  });

  it("gives a little for free mail when the email names its company", () => {
    expect(scoreEmail({ matches: 3, kinds: new Set(["need", "request", "deadline", "budget"]), company: { freeMail: true, name: "Pelita Waris Logistics" } }).score).toBe(85);
  });

  it("is zero for an email with nothing checked", () => {
    expect(scoreEmail({ matches: 0, kinds: new Set(), company: { freeMail: true, name: null } }).score).toBe(0);
  });
});

describe("the verdict: code only lowers Gemini's (FR-INBOX-8)", () => {
  const clear = { model: "lead" as const, knownDeal: false, partner: false, score: 90, companyKnown: true, matches: 3, rulesBroken: 0 };

  it("keeps a clear lead", () => expect(decideVerdict(clear)).toBe("lead"));
  it("lowers a lead under 70 to a maybe", () => expect(decideVerdict({ ...clear, score: 69 })).toBe("maybe"));
  it("lowers a lead with no known company to a maybe", () => expect(decideVerdict({ ...clear, companyKnown: false })).toBe("maybe"));
  it("lowers a lead with no live offering to a maybe", () => expect(decideVerdict({ ...clear, matches: 0 })).toBe("maybe"));
  it("lowers a lead that breaks a selling rule to a maybe", () => expect(decideVerdict({ ...clear, rulesBroken: 1 })).toBe("maybe"));
  it("never raises a maybe, however high the score", () => expect(decideVerdict({ ...clear, model: "maybe" })).toBe("maybe"));
  it("files a partner's email as not a lead", () => expect(decideVerdict({ ...clear, partner: true })).toBe("not_a_lead"));
  it("sends a known company's email to its deal", () => expect(decideVerdict({ ...clear, knownDeal: true })).toBe("existing_deal"));
  it("treats Gemini's existing deal with no deal found as a maybe", () => expect(decideVerdict({ ...clear, model: "existing_deal" })).toBe("maybe"));
  it("keeps a newsletter from a known company as not a lead", () => expect(decideVerdict({ ...clear, model: "not_a_lead", knownDeal: true })).toBe("not_a_lead"));
  it("never files an email a person said is a lead", () => expect(decideVerdict({ ...clear, model: "not_a_lead", score: 20, override: true })).toBe("maybe"));
});

describe("selling rules and labels", () => {
  const rule = { id: "c1", kind: "industry", statement: "No gambling", values: ["casino"], offeringIds: [] } as unknown as Constraint;
  const region = { id: "c2", kind: "region", statement: "Malaysia and Singapore only", values: ["MY", "SG"], offeringIds: [] } as unknown as Constraint;

  it("applies company-wide selling rules to the email and the sender's country", () => {
    expect(inboxRuleConflicts([rule], { text: "We run three casino resorts", company: { name: "X", domain: "x.example", freeMail: false, nameFromEmail: false } })).toHaveLength(1);
    expect(inboxRuleConflicts([region], { text: "Hello", company: { name: "X", domain: "x.co.th", freeMail: false, country: "TH", nameFromEmail: false } })).toHaveLength(1);
    expect(inboxRuleConflicts([region], { text: "Hello", company: { name: "X", domain: "x.com.my", freeMail: false, country: "MY", nameFromEmail: false } })).toHaveLength(0);
  });

  it("names the Gmail label after the verdict, or the deal", () => {
    expect(gmailLabel({ verdict: "lead", dealName: null, status: "intake_started" })).toBe("FlowHub · Lead");
    expect(gmailLabel({ verdict: "existing_deal", dealName: "Kopi Sentosa", status: "added_to_deal" })).toBe("FlowHub · Kopi Sentosa");
    expect(gmailLabel({ verdict: "maybe", dealName: null, status: "dismissed" })).toBe("FlowHub · Not a lead");
  });
});

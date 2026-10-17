import { describe, expect, it } from "vitest";
import type { Claim, Constraint, WebSource } from "@/lib/schema";
import { olvessa } from "@/lib/sample/olvessa";
import { ageInMonths, assembleStories, buildBeats, companyKey, type DraftStory, regionsOf, sameCompany, scoreLead } from "./scout";

const today = new Date("2026-10-17T04:00:00Z");
const rules = olvessa.constraints.filter((rule) => rule.offeringIds.length === 0);
const offerings = olvessa.offerings.filter((offering) => !offering.parentId);

const source = (id: string, domain: string): WebSource => ({ id, groundingUri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${id}`, title: domain, domain, retrievedAt: today.toISOString(), queries: [] });
const sources = new Map([source("src_1", "thestar.com.my"), source("src_2", "theedgemalaysia.com"), source("src_3", "bernama.com")].map((item) => [item.groundingUri, item]));
const claims: Claim[] = [
  { id: "clients_1", section: "news", text: "In September 2026, Aeon Co. (M) Bhd said it will open 12 new stores in Johor by 2027.", sourceIds: ["src_1", "src_2"] },
  { id: "clients_2", section: "news", text: "Aeon plans to move its stock systems onto one cloud platform in October 2026.", sourceIds: ["src_2"] },
  { id: "local_1", section: "news", text: "In March 2026, Lotus's Malaysia appointed a new chief digital officer.", sourceIds: ["src_3"] },
];
const draft = (overrides: Partial<DraftStory>): DraftStory => ({ company: "Aeon Co. (M) Bhd", country: "MY", headline: "Aeon opens 12 stores in Johor", trigger: "expansion", basedOn: ["clients_1", "clients_2"], offeringIds: [offerings[0].id, offerings[1].id], why: "More stores, more data to bring together.", ...overrides });
const assemble = (drafts: DraftStory[], knownCompanies: string[] = [], extraRules: Constraint[] = []) =>
  assembleStories({ drafts, claims, sources, offeringIds: new Set(offerings.map((offering) => offering.id)), knownCompanies, rules: [...rules, ...extraRules], today });

describe("news scout beats (FR-NEWS-1)", () => {
  const hub = { country: "MY", offerings: offerings.map(({ id, name, summary }) => ({ id, name, summary })), rules, pastClients: ["Pantai Rasa Foods", "Teluk Logistik"] };

  it("builds four beats from the hub", () => {
    const beats = buildBeats(hub);
    expect(beats.map((beat) => beat.key)).toEqual(["clients", "services", "local", "tenders"]);
    expect(beats[0].focus).toContain("Pantai Rasa Foods");
    expect(beats[1].focus).toContain(offerings[0].name);
  });

  it("searches the regions in the selling rules, or the company's own country", () => {
    const region = rules.find((rule) => rule.kind === "region");
    expect(regionsOf(hub)).toEqual(region ? region.values.map((code) => ({ MY: "Malaysia", SG: "Singapore" })[code] ?? code) : ["Malaysia"]);
    expect(regionsOf({ country: "SG", rules: [] })).toEqual(["Singapore"]);
  });

  it("never puts a private result's client or a cost into a beat", () => {
    const privateClients = olvessa.proof.filter((proof) => !proof.isPublic && proof.clientName).map((proof) => proof.clientName!);
    const json = JSON.stringify(buildBeats(hub));
    for (const name of privateClients) expect(json).not.toContain(name);
    for (const partner of olvessa.partners) if (partner.buyPrice) expect(json).not.toContain(partner.buyPrice);
  });
});

describe("company matching", () => {
  it("reduces legal suffixes and punctuation", () => {
    expect(companyKey("MR D.I.Y. Group (M) Berhad")).toBe("mr diy");
    expect(sameCompany("MR D.I.Y. Group (M) Berhad", "MR DIY")).toBe(true);
    expect(sameCompany("Aeon Co. (M) Bhd", "AEON")).toBe(true);
    expect(sameCompany("Teluk Logistik", "Teluk Intan Logistics")).toBe(false);
    expect(sameCompany("Ai", "Aeon")).toBe(false);
  });
});

describe("lead age and score (FR-NEWS-5)", () => {
  it("reads the newest month and year from the sourced sentences", () => {
    expect(ageInMonths(["In March 2026, X happened.", "By Sept 2026 it will be done."], today)).toBe(1);
    expect(ageInMonths(["Opened in October 2026."], today)).toBe(0);
    expect(ageInMonths(["It plans to grow."], today)).toBeNull();
  });

  it("scores fresh, well-matched, well-sourced news higher", () => {
    const hot = scoreLead({ offerings: 2, ageMonths: 0, trigger: "expansion", domains: 2 });
    const cold = scoreLead({ offerings: 1, ageMonths: 9, trigger: "other", domains: 1 });
    expect(hot).toEqual({ score: 100, label: "hot" });
    expect(cold.label).toBe("long_shot");
    expect(cold.score).toBeLessThan(60);
    expect(scoreLead({ offerings: 2, ageMonths: 2, trigger: "expansion", domains: 1 }).label).toBe("worth_a_look");
  });
});

describe("story assembly (FR-NEWS-3, FR-NEWS-4, invariant 3)", () => {
  it("keeps a story that rests on sourced claims and names a live offering", () => {
    const { stories } = assemble([draft({})]);
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({ id: "story_1", company: "Aeon Co. (M) Bhd", ageMonths: 0, label: "hot" });
    expect(stories[0].claims.map((claim) => claim.id)).toEqual(["clients_1", "clients_2"]);
  });

  it("drops a story with no kept claim or no live offering, and counts it", () => {
    const { stories, left } = assemble([draft({ basedOn: ["made_up"] }), draft({ company: "Lotus's Malaysia", basedOn: ["local_1"], offeringIds: ["off_missing"] })]);
    expect(stories).toHaveLength(0);
    expect(left.unmatched).toBe(2);
  });

  it("leaves out companies that are already an opportunity", () => {
    const { stories, left } = assemble([draft({})], ["AEON CO (M) BHD"]);
    expect(stories).toHaveLength(0);
    expect(left.known).toEqual(["Aeon Co. (M) Bhd"]);
  });

  it("leaves out companies that break a selling rule", () => {
    const regionRule = { ...rules[0], id: "rule_region_test", kind: "region", values: ["MY", "SG"], offeringIds: [] } as Constraint;
    const { stories, left } = assemble([draft({ country: "TH" })], [], [regionRule]);
    expect(stories).toHaveLength(0);
    expect(left.rules[0]).toMatchObject({ company: "Aeon Co. (M) Bhd" });
  });

  it("keeps each company once, in its best story, sorted by score", () => {
    const { stories } = assemble([draft({ trigger: "other", basedOn: ["clients_2"] }), draft({}), draft({ company: "Lotus's Malaysia", basedOn: ["local_1"], trigger: "new_leader", offeringIds: [offerings[0].id] })]);
    expect(stories.map((story) => story.company)).toEqual(["Aeon Co. (M) Bhd", "Lotus's Malaysia"]);
    expect(stories[0].trigger).toBe("expansion");
    expect(stories[0].score).toBeGreaterThan(stories[1].score);
  });
});

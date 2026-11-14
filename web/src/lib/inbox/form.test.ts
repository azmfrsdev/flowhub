import { describe, expect, it } from "vitest";
import { olvessa } from "@/lib/sample/olvessa";
import { InboxForm } from "@/lib/schema";
import { formBody, formItemId, formQuotable, formServices, formTitle, formWebsite, isThin, mapServices } from "./form";

const answer = (over: Record<string, unknown> = {}) =>
  InboxForm.parse({
    responseId: "2_ABaOnudEXAMPLE0123456789",
    submittedAt: "2026-12-04T10:15:00+08:00",
    name: "Farah Hashim",
    email: "Farah@Example.com.my",
    company: "Example Retail Sdn Bhd",
    website: "example.com.my",
    services: ["Google Cloud migration", "Data and analytics on BigQuery"],
    timeline: "In 1 to 3 months",
    message: "We run 40 stores and our weekly sales report takes three days. Could you send a proposal?",
    consent: true,
    ...over,
  });

describe("website form (PRD 7.30)", () => {
  it("names the form after the seller's first word", () => {
    expect(formTitle("Olvessa Cloud")).toBe("Talk to Olvessa");
  });

  it("lists every live offering of the sample as a checkbox, sub-offerings included", () => {
    expect(formServices(olvessa.offerings)).toEqual(["Google Cloud migration", "Migration assessment", "Managed cloud operations", "Data and analytics on BigQuery", "Workspace rollout", "AI agent build"]);
  });

  it("puts each sub-offering after its parent, whatever order Firestore returns", () => {
    const reversed = [...olvessa.offerings].reverse();
    const names = formServices(reversed);
    expect(names.indexOf("Managed cloud operations")).toBeGreaterThan(names.indexOf("Google Cloud migration"));
    expect(names.indexOf("Migration assessment")).toBeGreaterThan(names.indexOf("Google Cloud migration"));
    expect(names).toHaveLength(6);
  });

  it("leaves out retired, planned, restricted and deleted offerings", () => {
    const base = olvessa.offerings[0];
    const offerings = [base, { ...base, id: "x1", name: "Old thing", status: "retired" as const }, { ...base, id: "x2", name: "Soon", status: "planned" as const }, { ...base, id: "x3", name: "Secret", restricted: true }, { ...base, id: "x4", name: "Gone", deletedAt: "2026-11-01T00:00:00Z" }];
    expect(formServices(offerings)).toEqual([base.name]);
  });

  it("maps ticked services to live offerings by exact name, in code, and counts the rest", () => {
    const { matches, dropped } = mapServices(["google cloud  migration", "Data and analytics on BigQuery", "Free iPads", "Data and analytics on BigQuery", ""], olvessa.offerings);
    expect(matches.map((match) => match.offeringId)).toEqual(["off_gcm", "off_bq"]);
    expect(matches[0].label).toBe("Google Cloud migration");
    expect(dropped).toBe(1);
  });

  it("drops a ticked name that is only close to an offering", () => {
    expect(mapServices(["Google Cloud migrations", "BigQuery"], olvessa.offerings)).toEqual({ matches: [], dropped: 2 });
  });

  it("reads a website only when it is one", () => {
    expect(formWebsite("example.com.my")).toBe("https://example.com.my");
    expect(formWebsite("HTTPS://Example.com.my/about")).toBe("https://example.com.my/about");
    expect(formWebsite("javascript:alert(1)")).toBeNull();
    expect(formWebsite("not a site")).toBeNull();
    expect(formWebsite("https://user:pw@example.com")).toBeNull();
    expect(formWebsite("")).toBeNull();
  });

  it("writes the answers as the text quotes are checked against, leaving empty ones out", () => {
    const body = formBody(answer({ company: "", timeline: "" }));
    expect(body).toContain("Work email: farah@example.com.my");
    expect(body).toContain("Company website: https://example.com.my");
    expect(body).toContain("Services ticked: Google Cloud migration; Data and analytics on BigQuery");
    expect(body).not.toContain("Company:");
    expect(body).not.toContain("When they want to start");
    expect(body.endsWith("Could you send a proposal?")).toBe(true);
  });

  it("lets reasons quote only the person's own words: the timeline and the message", () => {
    const quotable = formQuotable(answer());
    expect(quotable).toContain("When they want to start: In 1 to 3 months");
    expect(quotable).toContain("Could you send a proposal?");
    expect(quotable).not.toContain("Services ticked");
    expect(quotable).not.toContain("Example Retail");
  });

  it("calls a message under 30 characters thin", () => {
    expect(isThin(answer({ message: "  hi   there " }))).toBe(true);
    expect(isThin(answer())).toBe(false);
  });

  it("refuses an answer without the consent tick or a valid email", () => {
    expect(InboxForm.safeParse({ ...answer(), consent: false }).success).toBe(false);
    expect(InboxForm.safeParse({ ...answer(), email: "not-an-email" }).success).toBe(false);
    expect(InboxForm.safeParse({ ...answer(), responseId: "../../x" }).success).toBe(false);
  });

  it("keys the item by the response, so a second send finds the first", () => {
    expect(formItemId("2_ABC123")).toBe("wf_2_ABC123");
  });
});

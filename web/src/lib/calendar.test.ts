import { describe, expect, it } from "vitest";
import { calendarTemplateUrl, meetingAgenda, meetingLabel, meetingTitle, parseGuests, utcStamp, zonedTime } from "./calendar";

const prep = {
  points: [
    { text: "One view of sales and stock across every store, refreshed daily.", claimIds: ["cl_1"] },
    { text: "The foundation costs RM 48,000 and runs in eight weeks.", claimIds: ["cl_2"] },
    { text: "Delivered like our work for Bukit Retail Holdings last year.", claimIds: ["cl_3"] },
  ],
  ask: [
    { id: "a1", question: "Which stores should go first in the pilot?", why: "Internal: they hinted at a budget freeze.", basis: "research" as const, basisText: "The group runs over 1,400 stores." },
    { id: "a2", question: "Is {{price:pl_1}} within the approved budget?", why: "x", basis: "gap" as const, basisText: "y" },
    { id: "a3", question: "Can your team share the old reports at www.example.com before we start?", why: "x", basis: "brief" as const, basisText: "z" },
  ],
};
const links = [
  { label: "The proposal (Google Doc)", url: "https://docs.google.com/document/d/abc/edit" },
  { label: "The deal in FlowHub", url: "https://flowhub.example/opportunities/opp_1" },
];

describe("meetingAgenda (FR-CAL-3)", () => {
  const { text, dropped } = meetingAgenda(prep, links, ["Bukit Retail Holdings", "Store analytics rollout"]);

  it("keeps the points and the questions, in order, with the links last", () => {
    expect(text).toContain("1. Introductions and goals for the meeting");
    expect(text).toContain("2. One view of sales and stock across every store, refreshed daily.");
    expect(text).toContain("- Which stores should go first in the pilot?");
    expect(text.indexOf("Agenda")).toBeLessThan(text.indexOf("Questions to talk through"));
    expect(text.indexOf("Questions to talk through")).toBeLessThan(text.indexOf("The proposal (Google Doc): https://docs.google.com/document/d/abc/edit"));
    expect(text).toContain("The deal in FlowHub: https://flowhub.example/opportunities/opp_1");
  });

  it("never carries an amount, a price placeholder, a private result, a model-written address or the prep's notes", () => {
    expect(dropped).toBe(4);
    expect(text).not.toMatch(/RM\s?\d/);
    expect(text).not.toContain("{{price:");
    expect(text).not.toContain("Bukit Retail");
    expect(text).not.toContain("www.example.com");
    expect(text).not.toContain("budget freeze");
    expect(text).not.toContain("1,400 stores");
  });
});

describe("times (FR-CAL-1)", () => {
  it("reads a Kuala Lumpur wall-clock time as UTC+8", () => {
    expect(zonedTime("2026-12-04", "10:00", "Asia/Kuala_Lumpur").toISOString()).toBe("2026-12-04T02:00:00.000Z");
    expect(zonedTime("2026-12-04", "07:30", "Asia/Kuala_Lumpur").toISOString()).toBe("2026-12-03T23:30:00.000Z");
  });

  it("handles a zone with daylight saving", () => {
    expect(zonedTime("2026-07-01", "09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedTime("2026-01-15", "09:00", "Europe/London").toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("stamps and labels a moment", () => {
    expect(utcStamp(new Date("2026-12-04T02:00:00.000Z"))).toBe("20261204T020000Z");
    expect(meetingLabel(new Date("2026-12-04T02:00:00.000Z"), "Asia/Kuala_Lumpur")).toBe("Fri 4 Dec 2026, 10:00");
  });
});

describe("calendarTemplateUrl (FR-CAL-1, FR-CAL-2)", () => {
  it("fills in the title, the times, the guests, the zone and the agenda", () => {
    const url = new URL(
      calendarTemplateUrl(
        {
          title: meetingTitle("Olvessa Cloud", "Kedai Maju", "Data platform proposal"),
          start: zonedTime("2026-12-04", "10:00", "Asia/Kuala_Lumpur"),
          minutes: 60,
          details: "Agenda\n1. Introductions & goals",
          guests: parseGuests("aisyah@kedaimaju.example; aisyah@kedaimaju.example, not-an-email ,ops@kedaimaju.example"),
          timeZone: "Asia/Kuala_Lumpur",
        },
        "nadia@olvessa.example",
      ),
    );
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Olvessa Cloud × Kedai Maju: Data platform proposal");
    expect(url.searchParams.get("dates")).toBe("20261204T020000Z/20261204T030000Z");
    expect(url.searchParams.get("add")).toBe("aisyah@kedaimaju.example,ops@kedaimaju.example");
    expect(url.searchParams.get("ctz")).toBe("Asia/Kuala_Lumpur");
    expect(url.searchParams.get("authuser")).toBe("nadia@olvessa.example");
    expect(url.searchParams.get("details")).toBe("Agenda\n1. Introductions & goals");
  });

  it("leaves out guests when there are none, and keeps a long agenda under the link limit", () => {
    const url = calendarTemplateUrl({ title: "t", start: new Date("2026-12-04T02:00:00Z"), minutes: 30, details: "word ".repeat(4000), guests: [], timeZone: "Asia/Kuala_Lumpur" });
    expect(new URL(url).searchParams.has("add")).toBe(false);
    expect(url.length).toBeLessThanOrEqual(7500);
    expect(new URL(url).searchParams.get("details")?.endsWith("…")).toBe(true);
  });
});

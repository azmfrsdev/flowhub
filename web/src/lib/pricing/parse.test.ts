import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatAmount, parsePrice } from "./parse";

type Fixture = {
  defaultCurrency: string;
  cases: { text: string; expect: Record<string, unknown> }[];
};

const fixture: Fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../../fixtures/price-strings.json"), "utf8"),
);

describe("parsePrice (fixtures/price-strings.json)", () => {
  for (const c of fixture.cases) {
    it(`parses "${c.text}"`, () => {
      expect(parsePrice(c.text, fixture.defaultCurrency)).toEqual(c.expect);
    });
  }
});

describe("formatAmount", () => {
  it("writes ringgit the way the catalogue does", () => {
    expect(formatAmount(30400, "MYR")).toBe("RM 30,400");
    expect(formatAmount(4438.4, "MYR")).toBe("RM 4,438.40");
  });
});

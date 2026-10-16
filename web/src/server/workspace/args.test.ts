import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ArgId, ArgRev, BadRequestError, parseArgs } from "./args";

describe("parseArgs (invariant 10)", () => {
  const Decision = z.enum(["accept_as_seller", "remove"]);

  it("passes well-formed arguments through", () => {
    expect(parseArgs([ArgId, ArgRev, Decision], ["opp_1", 3, "remove"])).toEqual(["opp_1", 3, "remove"]);
  });

  it("refuses a Gate D decision outside the two allowed", () => {
    expect(() => parseArgs([ArgId, ArgRev, Decision], ["opp_1", 3, "keep"])).toThrow(BadRequestError);
  });

  it("refuses an ID that reaches into a subcollection, and a non-integer revision", () => {
    expect(() => parseArgs([ArgId], ["opp_1/runs/x"])).toThrow(BadRequestError);
    expect(() => parseArgs([ArgRev], [1.5])).toThrow(BadRequestError);
  });
});

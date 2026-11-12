import { describe, expect, it } from "vitest";
import { hashInboxKey, keyFromHeader, keyHint, newInboxKey } from "./keys";

describe("workspace keys for the Gmail script (ADR-0020 D2)", () => {
  it("makes a different well-formed key each time", () => {
    const a = newInboxKey();
    const b = newInboxKey();
    expect(a).toMatch(/^fhk_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashes a key the same way every time, and never returns the key itself", () => {
    const key = newInboxKey();
    const hash = hashInboxKey(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInboxKey(key)).toBe(hash);
    expect(hash).not.toContain(key.slice(4));
  });

  it("refuses anything that isn't a key, before Firestore is asked", () => {
    expect(hashInboxKey("")).toBeNull();
    expect(hashInboxKey("fhk_short")).toBeNull();
    expect(hashInboxKey(`${newInboxKey()}x`)).toBeNull();
    expect(hashInboxKey("../inboxKeys/abc")).toBeNull();
  });

  it("reads the key from a bearer header", () => {
    const key = newInboxKey();
    expect(keyFromHeader(`Bearer ${key}`)).toBe(key);
    expect(keyFromHeader(key)).toBeNull();
    expect(keyFromHeader(null)).toBeNull();
    expect(keyHint(key)).toBe(key.slice(-4));
  });
});

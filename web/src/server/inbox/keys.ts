import { createHash, randomBytes } from "node:crypto";

/**
 * Workspace keys for the Gmail script (ADR-0020 D2). A key is 32 random bytes
 * behind a fixed prefix. FlowHub stores only its SHA-256, in
 * `inboxKeys/{hash}` (server only) and on the workspace, so a leaked database
 * can't send emails in. Making a new key deletes the old hash.
 */

export const KEY_PREFIX = "fhk_";
const KEY_SHAPE = /^fhk_[A-Za-z0-9_-]{43}$/;

export function newInboxKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** Null for anything that isn't a well-formed key, so a malformed header never reaches Firestore. */
export function hashInboxKey(key: string): string | null {
  if (!KEY_SHAPE.test(key)) return null;
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export const keyHint = (key: string) => key.slice(-4);

/** The key from `Authorization: Bearer fhk_…`. */
export function keyFromHeader(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/);
  return match ? match[1] : null;
}

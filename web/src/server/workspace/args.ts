import { z } from "zod";

/**
 * Invariant 10: a server action's arguments come from the browser like form
 * fields, so they're parsed with Zod before anything reads them. The UI never
 * sends a bad value; one only arrives in a tampered request.
 */

/** A Firestore document ID: no slash, so it can't reach into a subcollection. */
export const ArgId = z.string().min(1).max(128).regex(/^[^/]+$/);
export const ArgRev = z.number().int().nonnegative();

export class BadRequestError extends Error {
  constructor() {
    super("That request wasn't valid. Reload the page and try again.");
    this.name = "BadRequestError";
  }
}

/** Parses positional arguments against one schema each, or throws BadRequestError. */
export function parseArgs<const T extends readonly [z.ZodType, ...z.ZodType[]]>(schemas: T, values: { [K in keyof T]: unknown }): { [K in keyof T]: z.output<T[K]> } {
  const parsed = schemas.map((schema, index) => schema.safeParse(values[index]));
  if (parsed.some((result) => !result.success)) throw new BadRequestError();
  return parsed.map((result) => result.data) as { [K in keyof T]: z.output<T[K]> };
}

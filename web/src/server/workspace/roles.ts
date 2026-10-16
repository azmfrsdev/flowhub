import type { Role } from "@/lib/schema";

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/** ADR-0008: owner > editor > viewer. A missing or unknown role allows nothing. */
export function roleAllows(role: unknown, min: Role): boolean {
  return typeof role === "string" && role in RANK && RANK[role as Role] >= RANK[min];
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have access to do that in this workspace.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

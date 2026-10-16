import { z } from "zod";
import { Id, IsoDate } from "./common";

/**
 * Workspaces, members and the user's pointer to their workspace
 * (ADR-0008, ADR-0009 D5). One workspace per user; every write is server-only.
 */

export const Role = z.enum(["owner", "editor", "viewer"]);
export type Role = z.infer<typeof Role>;

/** The proposal template a workspace writes by default. This build writes SME only (PRD 7.0). */
export const Persona = z.enum(["sme", "startup", "enterprise"]);
export type Persona = z.infer<typeof Persona>;

/** The three demo sellers, one for each kind of thing a company sells (PRD Q24, ADR-0012). */
export const SampleSeller = z.enum(["kelapa-cloud", "giliran", "rantai-supply"]);
export type SampleSeller = z.infer<typeof SampleSeller>;

export const COUNTRIES = { MY: "Malaysia", SG: "Singapore", ID: "Indonesia", TH: "Thailand", PH: "Philippines", VN: "Vietnam" } as const;
export const CURRENCIES = ["MYR", "SGD", "IDR", "THB", "PHP", "VND", "USD"] as const;

/** `workspaces/{ws}` */
export const Workspace = z.object({
  id: Id,
  name: z.string().trim().min(1).max(120),
  website: z.string().nullable().default(null),
  country: z.enum(Object.keys(COUNTRIES) as [keyof typeof COUNTRIES, ...(keyof typeof COUNTRIES)[]]),
  currency: z.enum(CURRENCIES),
  persona: Persona.default("sme"),
  industries: z.array(z.string()).default([]),
  /** Set when the workspace came from "Try with sample data" (FR-WS-3). */
  sample: SampleSeller.nullable().default(null),
  /** Set when another sample seller replaced this sample workspace (FR-WS-4). It is kept, not shown. */
  deletedAt: IsoDate.nullable().default(null),
  createdAt: IsoDate,
  createdBy: z.string(),
});
export type Workspace = z.infer<typeof Workspace>;

/** `workspaces/{ws}/members/{uid}` */
export const Member = z.object({
  role: Role,
  email: z.string(),
  name: z.string(),
  addedBy: z.string(),
  addedAt: IsoDate,
});
export type Member = z.infer<typeof Member>;

/** `users/{uid}`: the user may read their own. */
export const UserDoc = z.object({
  workspaceId: Id.nullable(),
});
export type UserDoc = z.infer<typeof UserDoc>;

/** FR-WS-2: the short form for a company's own workspace. */
export const WorkspaceSetupInput = z.object({
  name: z.string().trim().min(1, "Enter your company name.").max(120),
  website: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === "" ? null : value))
    .pipe(z.url({ protocol: /^https?$/, error: "Enter a full address, starting with https://" }).nullable()),
  country: Workspace.shape.country,
  currency: Workspace.shape.currency,
});
export type WorkspaceSetupInput = z.infer<typeof WorkspaceSetupInput>;

/** `workspaces/{ws}/auditEvents/{id}`: the fixed vocabulary from CLAUDE.md. */
export const AuditEvent = z.object({
  action: z.enum(["create", "update", "delete", "restore", "view-restricted", "generate", "send"]),
  entity: z.string(),
  entityId: Id,
  summary: z.string(),
  by: z.string(),
  byName: z.string(),
  at: IsoDate,
});
export type AuditEvent = z.infer<typeof AuditEvent>;

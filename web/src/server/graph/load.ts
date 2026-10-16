import "server-only";
import type { z } from "zod";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { Constraint, DocumentRecord, FeeSchedule, Note, Offering, Partner, Proof, RateCard } from "@/lib/schema";
import { db } from "@/server/firebase/admin";

const SCHEMAS = {
  offerings: Offering,
  rateCards: RateCard,
  feeSchedules: FeeSchedule,
  proof: Proof,
  constraints: Constraint,
  partners: Partner,
  notes: Note,
  documents: DocumentRecord,
} as const;

/**
 * A workspace's whole offering graph. An SME catalogue is a few dozen
 * documents, so one read serves every tab and every pipeline step.
 * Soft-deleted entities are left out. A document that doesn't match the
 * schema is skipped and logged, never shown half-read.
 *
 * No request context here: pipelines call it with their run's own workspace
 * ID (ADR-0005 D5). Pages go through getWorkspaceGraph, which resolves the
 * caller's workspace first.
 */
export async function getGraphFor(workspaceId: string): Promise<WorkspaceGraph> {
  const base = db().collection("workspaces").doc(workspaceId);
  const entries = await Promise.all(
    (Object.keys(SCHEMAS) as (keyof typeof SCHEMAS)[]).map(async (collection) => {
      const snap = await base.collection(collection).get();
      const schema: z.ZodType = SCHEMAS[collection];
      const items = snap.docs.flatMap((doc) => {
        const parsed = schema.safeParse(doc.data());
        if (!parsed.success) {
          console.error(`Skipped ${collection}/${doc.id}: ${parsed.error.issues[0]?.message}`);
          return [];
        }
        const item = parsed.data as { deletedAt?: string | null };
        return item.deletedAt ? [] : [item];
      });
      return [collection, items] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as WorkspaceGraph;
}

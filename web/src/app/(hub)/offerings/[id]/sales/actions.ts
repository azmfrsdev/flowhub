"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Proof } from "@/lib/schema";
import { editEntity } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

/** ADR-0009 D3: the public flag on a result is edited by hand. Only public results can be cited (invariant 5). */
export async function setProofPublic(proofId: string, isPublic: boolean): Promise<void> {
  const context = await requireRole("editor");
  [proofId, isPublic] = parseArgs([ArgId, z.boolean()], [proofId, isPublic]);
  await editEntity(context, "proof", proofId, null, (current) => {
    const proof = Proof.parse(current);
    if (proof.isPublic === isPublic) return null;
    return { patch: { isPublic }, summary: `Marked "${proof.title}" as ${isPublic ? "public: proposals may cite it" : "not public: proposals can't cite it"}.` };
  });
  refresh();
}

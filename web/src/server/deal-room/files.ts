import "server-only";
import { malaysiaDay } from "@/lib/offerings/view";
import { bucket, db } from "@/server/firebase/admin";
import type { HubContext } from "@/server/workspace/access";
import { CAPS } from "@/server/workspace/caps";

/**
 * The one file a new opportunity can come with (FR-INT-1 as changed in PRD
 * 7.0): a PDF, an image, or a saved email. It's the prospect's file, so it's
 * stored with the opportunity, never filed in the hub's Sales material.
 */

export class IntakeFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntakeFileError";
  }
}

export const MAX_INTAKE_BYTES = 20 * 1024 * 1024;

/** The file's type from its first bytes (and, for text, its name). A label in the upload is never trusted. */
export function sniffIntakeFile(name: string, bytes: Buffer): string {
  const head = bytes.subarray(0, 8);
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (/\.(eml|txt)$/i.test(name) && !bytes.subarray(0, 4096).includes(0)) return "text/plain";
  if (/\.(docx?|pptx?|xlsx?)$/i.test(name)) throw new IntakeFileError("FlowHub can't read Office files yet. Save it as a PDF and attach that.");
  throw new IntakeFileError("Attach a PDF, an image (PNG or JPG), or a saved email (.eml or .txt).");
}

export async function saveIntakeFile(context: HubContext, opportunityId: string, file: File): Promise<{ kind: "file"; storagePath: string; name: string; contentType: string }> {
  if (file.size === 0) throw new IntakeFileError("That file is empty.");
  if (file.size > MAX_INTAKE_BYTES) throw new IntakeFileError("Files can be up to 20 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const name = file.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "Attachment";
  const contentType = sniffIntakeFile(name, bytes);

  // FR-CAP-1, FR-CAP-2: the same daily upload cap and kill switch as the hub's files.
  const ws = context.workspace.id;
  const usageRef = db().doc(`workspaces/${ws}/usage/${malaysiaDay()}`);
  const flagsRef = db().doc("system/flags");
  await db().runTransaction(async (tx) => {
    const [usage, flags] = await Promise.all([tx.get(usageRef), tx.get(flagsRef)]);
    if (flags.exists && flags.get("agentsEnabled") === false) throw new IntakeFileError("The agents are paused for now. Try again later.");
    const used = Number(usage.get("uploads") ?? 0);
    if (used >= CAPS.uploads) throw new IntakeFileError(`Today's limit of ${CAPS.uploads} uploads is used up. It resets at midnight, Malaysia time.`);
    tx.set(usageRef, { uploads: used + 1 }, { merge: true });
  });

  const extension = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "text/plain": "txt" }[contentType];
  const storagePath = `workspaces/${ws}/opportunities/${opportunityId}/intake.${extension}`;
  await bucket().file(storagePath).save(bytes, { contentType, resumable: false });
  return { kind: "file", storagePath, name, contentType };
}

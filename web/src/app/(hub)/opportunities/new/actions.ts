"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AuditEvent, Opportunity } from "@/lib/schema";
import { IntakeFileError, saveIntakeFile } from "@/server/deal-room/files";
import { StageError, startStage } from "@/server/deal-room/runs";
import { db } from "@/server/firebase/admin";
import { requireRole } from "@/server/workspace/access";

export type NewOpportunityState = { error?: string; values?: { text?: string; url?: string; offerings?: string[] } };

const Input = z
  .object({
    text: z.string().trim().max(20000, "Paste at most 20,000 characters."),
    url: z
      .string()
      .trim()
      .max(300)
      .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
      .pipe(z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Enter a website like example.com.my" })])),
    offerings: z.array(z.string().max(128)).max(20),
    hasFile: z.boolean(),
  })
  .refine((input) => input.text || input.url || input.hasFile, { message: "Paste the invite or email, attach a file, or enter the company's website." });

/** FR-OPP-4, FR-INT-1: a new opportunity from pasted text, one file and/or a company URL. Intake starts straight away. */
export async function createOpportunity(_previous: NewOpportunityState, formData: FormData): Promise<NewOpportunityState> {
  const context = await requireRole("editor");
  const values = { text: String(formData.get("text") ?? ""), url: String(formData.get("url") ?? ""), offerings: formData.getAll("offerings").map(String) };
  // An empty file input still sends a nameless, empty file.
  const upload = formData.get("file");
  const file = upload instanceof File && (upload.size > 0 || upload.name) ? upload : null;
  const parsed = Input.safeParse({ ...values, hasFile: Boolean(file) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };

  const base = db().collection("workspaces").doc(context.workspace.id);
  const ref = base.collection("opportunities").doc();
  let attached: Awaited<ReturnType<typeof saveIntakeFile>> | null = null;
  if (file) {
    try {
      attached = await saveIntakeFile(context, ref.id, file);
    } catch (err) {
      if (err instanceof IntakeFileError) return { error: err.message, values };
      throw err;
    }
  }
  const now = new Date().toISOString();
  const idle = { state: "idle" as const, currentRunId: null, updatedAt: now };
  const opportunity = Opportunity.parse({
    id: ref.id,
    workspaceId: context.workspace.id,
    prospect: null,
    persona: context.workspace.persona,
    intakeType: parsed.data.text ? "client_email" : attached?.contentType === "application/pdf" ? "tender_document" : attached ? "client_email" : "company_url",
    source: attached ? `Attached: ${attached.name}` : parsed.data.text ? "Pasted" : "Company website",
    interestedOfferingIds: parsed.data.offerings,
    status: "new",
    inputs: [
      ...(parsed.data.text ? [{ kind: "text", text: parsed.data.text }] : []),
      ...(attached ? [attached] : []),
      ...(parsed.data.url ? [{ kind: "url", url: parsed.data.url }] : []),
    ],
    stages: { intake: idle, research: idle, fit: idle, write: idle },
    rev: 0,
    createdAt: now,
    createdBy: context.user.name,
    updatedAt: now,
  });
  const batch = db().batch();
  batch.set(ref, JSON.parse(JSON.stringify(opportunity)));
  batch.set(base.collection("auditEvents").doc(), AuditEvent.parse({ action: "create", entity: "opportunity", entityId: ref.id, summary: "Added a new opportunity.", by: context.user.uid, byName: context.user.name, at: now }));
  await batch.commit();

  try {
    await startStage(context, ref.id, "intake");
  } catch (err) {
    if (!(err instanceof StageError)) throw err;
    // The opportunity exists; the deal room shows why intake didn't start and offers Retry.
  }
  redirect(`/opportunities/${ref.id}`);
}

"use server";

import { redirect } from "next/navigation";
import { SAMPLES, sampleWorkspaceFields } from "@/lib/sample";
import { SampleSeller, WorkspaceSetupInput } from "@/lib/schema";
import { requireUser } from "@/server/auth/session";
import { WorkspaceExistsError, createWorkspace } from "@/server/workspace/create";

export type SetupFormState = {
  fieldErrors?: Partial<Record<"name" | "website" | "country" | "currency", string>>;
  error?: string;
  values?: Record<string, string>;
};

/** FR-WS-3: a workspace built from the chosen sample seller's catalogue (PRD Q24), with the user as Owner. */
export async function startWithSample(formData: FormData): Promise<void> {
  const user = await requireUser("/start");
  const seller = SampleSeller.safeParse(formData.get("seller"));
  if (!seller.success) redirect("/start");
  const { graph, documents } = SAMPLES[seller.data];
  try {
    await createWorkspace(user, sampleWorkspaceFields(seller.data), { graph, documents });
  } catch (err) {
    if (!(err instanceof WorkspaceExistsError)) throw err;
  }
  redirect("/home");
}

/** FR-WS-2: the company's own, empty workspace. */
export async function createOwnWorkspace(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const user = await requireUser("/start");
  const values = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]));
  const parsed = WorkspaceSetupInput.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: SetupFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<SetupFormState["fieldErrors"]>;
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors, values };
  }
  try {
    await createWorkspace(user, { ...parsed.data, persona: "sme", industries: [], sample: null });
  } catch (err) {
    if (!(err instanceof WorkspaceExistsError)) {
      return { error: "FlowHub couldn't create the workspace. Try again in a moment.", values };
    }
  }
  redirect("/home");
}

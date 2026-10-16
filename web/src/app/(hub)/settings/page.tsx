import type { Metadata } from "next";
import { Suspense } from "react";
import { ProvenanceMarker, SourceChips } from "@/components/flowhub/provenance";
import { RemoveButton } from "@/components/flowhub/remove-button";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { SAMPLES } from "@/lib/sample";
import { COUNTRIES } from "@/lib/schema/workspace";
import { db } from "@/server/firebase/admin";
import { getWorkspaceGraph } from "@/server/graph/read";
import { getHubContext } from "@/server/workspace/access";
import { getDeletions, getUsageToday } from "@/server/workspace/queries";
import { EditDialog, Field, SelectField } from "@/components/flowhub/edit-dialog";
import { CURRENCIES } from "@/lib/schema/workspace";
import { removeSellingRule, restoreDeleted, updateSellingRule, updateWorkspace } from "./actions";
import { RestoreButton } from "./restore-button";
import { SellingRuleForm } from "./rule-form";
import { DeleteWorkspace, SwitchSample } from "./switch-sample";

export const metadata: Metadata = { title: "Settings" };

const RULE_LABEL = { region: "Region", industry: "Industry", min_deal_size: "Minimum", integration: "Integration", scope: "Scope", other: "Rule" } as const;

/** S14: Settings (FR-WS-6 as changed in PRD 7.0): workspace, selling rules, usage and Drive access. */
export default function SettingsPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Your workspace, the rules that apply to everything you sell, and today&apos;s usage.</p>
      </div>
      <Suspense fallback={<TabFallback label="Loading settings" />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const [{ workspace, role, user }, graph, usage, deletions] = await Promise.all([getHubContext(), getWorkspaceGraph(), getUsageToday(), getDeletions()]);
  const driveGrantedAt = (await db().doc(`users/${user.uid}`).get()).get("driveGrantedAt") as string | undefined;
  const rules = graph.constraints.filter((rule) => rule.offeringIds.length === 0);
  const documents = new Map(graph.documents.map((doc) => [doc.id, doc]));
  const canEdit = role !== "viewer";

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <SectionCard
          title="Selling rules"
          id="rules"
          subtitle="Company-wide. Shown on every Scope tab, and checked first when the agents match a prospect."
          count={rules.length}
          footer={canEdit ? <SellingRuleForm /> : undefined}
        >
          {rules.length === 0 ? (
            <EmptyRow>No selling rules. Add the regions you serve, your minimum deal size, and anyone you won&apos;t work for.</EmptyRow>
          ) : (
            <ul className="flex flex-col divide-y">
              {rules.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
                  <span className="rounded-full bg-fit-cannot-soft px-2 py-px text-xs font-semibold text-fit-cannot">{RULE_LABEL[rule.kind]}</span>
                  <span className="font-medium">{rule.statement}</span>
                  {rule.values.length > 0 ? <span className="font-mono text-xs text-muted-foreground">{rule.values.join(", ")}</span> : null}
                  <span className="flex-1" />
                  {rule.sources.length > 0 ? <SourceChips sources={rule.sources} documents={documents} /> : <ProvenanceMarker provenance={rule.provenance} sources={[]} documents={documents} />}
                  {canEdit ? (
                    <span className="flex items-center">
                      <EditDialog title="Edit the selling rule" action={updateSellingRule.bind(null, rule.id)}>
                        <SelectField
                          label="Kind"
                          name="kind"
                          defaultValue={rule.kind}
                          options={[
                            { value: "region", label: "Region" },
                            { value: "industry", label: "Industry" },
                            { value: "min_deal_size", label: "Minimum deal size" },
                            { value: "integration", label: "Integration" },
                            { value: "other", label: "Other" },
                          ]}
                        />
                        <Field label="The rule, as you'd say it to a client" name="statement" defaultValue={rule.statement} maxLength={200} required />
                        <Field label="Values" name="values" defaultValue={rule.values.join(", ")} maxLength={300} hint="commas between, such as MY, SG" />
                      </EditDialog>
                      <RemoveButton action={removeSellingRule.bind(null, rule.id)} label={`Remove the rule ${rule.statement}`} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Workspace"
          id="workspace"
          action={
            role === "owner" ? (
              <EditDialog title="Edit the workspace" trigger="text" triggerLabel="Edit details" action={updateWorkspace}>
                <Field label="Company" name="name" defaultValue={workspace.name} maxLength={120} required />
                <Field label="Website" name="website" defaultValue={workspace.website ?? ""} maxLength={200} hint="optional" placeholder="kelapacloud.example" />
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Country" name="country" defaultValue={workspace.country} options={Object.entries(COUNTRIES).map(([value, label]) => ({ value, label }))} />
                  <SelectField label="Currency" name="currency" defaultValue={workspace.currency} options={CURRENCIES.map((value) => ({ value, label: value }))} />
                </div>
              </EditDialog>
            ) : undefined
          }
          footer={role === "owner" ? <DeleteWorkspace name={workspace.name} /> : undefined}
        >
          <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-muted-foreground">Company</dt>
            <dd className="font-medium">{workspace.name}</dd>
            <dt className="text-muted-foreground">Website</dt>
            <dd>{workspace.website ?? "Not set"}</dd>
            <dt className="text-muted-foreground">Country</dt>
            <dd>{COUNTRIES[workspace.country]}</dd>
            <dt className="text-muted-foreground">Currency</dt>
            <dd>{workspace.currency}</dd>
            <dt className="text-muted-foreground">Proposals</dt>
            <dd>SME proposal template</dd>
            <dt className="text-muted-foreground">Your role</dt>
            <dd className="capitalize">{role}</dd>
            {workspace.sample ? (
              <>
                <dt className="text-muted-foreground">Sample company</dt>
                <dd className="flex flex-col gap-2.5">
                  <span>Yes. Its people, prices and clients are fictional.</span>
                  {role === "owner" ? (
                    <SwitchSample
                      current={workspace.name}
                      currentSeller={workspace.sample}
                      workspaceId={workspace.id}
                      options={Object.values(SAMPLES)
                        .filter((sample) => sample.seller !== workspace.sample)
                        .map(({ seller, graph: sampleGraph, sells }) => ({ seller, name: sampleGraph.workspace.name, sells }))}
                    />
                  ) : null}
                </dd>
              </>
            ) : null}
          </dl>
        </SectionCard>
      </div>

      <div className="flex flex-col gap-5">
        <SectionCard title="Usage today" id="usage" subtitle="Daily caps keep a public demo affordable. They reset at midnight, Malaysia time.">
          <dl className="flex flex-col gap-3 px-4 py-4 text-sm">
            <UsageRow label="AI stage runs" used={usage.stageRuns} cap={usage.cap} />
            <UsageRow label="Research runs" used={usage.researchRuns} cap={usage.researchCap} />
            <UsageRow label="Ask or tell messages" used={usage.askRuns} cap={usage.askCap} />
            <UsageRow label="Uploads" used={usage.uploads} cap={usage.uploadsCap} />
          </dl>
        </SectionCard>
        <SectionCard title="Recycle bin" id="recycle-bin" subtitle="Everything deleted, newest first. Restoring brings back what was deleted with it." count={deletions.length}>
          {deletions.length === 0 ? (
            <EmptyRow>Nothing deleted.</EmptyRow>
          ) : (
            <ul className="flex flex-col divide-y">
              {deletions.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(item.deletedAt))} by {item.deletedBy}
                      {item.count > 1 ? ` · ${item.count} records` : ""}
                    </span>
                  </span>
                  {canEdit ? <RestoreButton action={restoreDeleted.bind(null, item.id)} label={`Restore ${item.label}`} /> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Google Drive" id="drive">
          <div className="flex flex-col gap-2 px-4 py-4 text-sm">
            {driveGrantedAt ? (
              <p>
                <b>Granted</b> on {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(driveGrantedAt))}, for the files FlowHub creates in your
                &ldquo;FlowHub&rdquo; folder only.
              </p>
            ) : (
              <p>
                <b>Not granted.</b> FlowHub asks the first time you create a proposal in Google Docs, and only for the files it creates.
              </p>
            )}
            <p className="text-muted-foreground">
              FlowHub never stores your Google token. To revoke access, remove FlowHub in{" "}
              <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                your Google Account&apos;s third-party connections
              </a>
              .
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function UsageRow({ label, used, cap }: { label: string; used: number; cap: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between">
        <dt>{label}</dt>
        <dd className="font-semibold">
          {used} / {cap}
        </dd>
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-line-soft" aria-hidden="true">
        <span className="block h-full rounded-full bg-ai" style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
      </span>
    </div>
  );
}

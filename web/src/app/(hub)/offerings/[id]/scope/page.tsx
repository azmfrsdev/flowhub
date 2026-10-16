import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AiMarker } from "@/components/flowhub/markers";
import { ProvenanceMarker, SourceChips } from "@/components/flowhub/provenance";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { scopeRules } from "@/lib/offerings/view";
import { loadOffering } from "@/server/graph/offering";
import { RemoveButton } from "@/components/flowhub/remove-button";
import { EditDialog, Field, SelectField } from "@/components/flowhub/edit-dialog";
import { addExclusion, addFeature, removeExclusion, retireFeature, updateExclusion, updateFeature } from "./actions";
import { AddExclusion, AddFeature } from "./scope-forms";

export const metadata: Metadata = { title: "Scope" };

const RULE_LABEL = { region: "Region", industry: "Industry", min_deal_size: "Minimum", integration: "Integration", scope: "Scope", other: "Rule" } as const;

/** FR-OFR-4, the Scope tab. The Fit Analyst reads it: a need under Not included is Cannot meet. */
export default function ScopePage({ params }: PageProps<"/offerings/[id]/scope">) {
  return (
    <Suspense fallback={<TabFallback label="Loading scope" />}>
      <Scope params={params} />
    </Suspense>
  );
}

async function Scope({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { offering, graph, documents, role } = await loadOffering(id);
  const canEdit = role !== "viewer";
  const { notIncluded, companyWide } = scopeRules(graph, offering.id);
  const features = offering.features.filter((feature) => feature.status !== "retired");
  const partnerName = (partnerId?: string) => graph.partners.find((partner) => partner.id === partnerId);

  return (
    <>
      <p className="flex flex-wrap items-center gap-2 rounded-xl border border-ai/25 bg-ai-soft/50 px-4 py-3 text-sm">
        <AiMarker>Fit Analyst</AiMarker>
        The agents read this tab when they match a prospect&apos;s needs. A need under <b>Not included</b> shows as Cannot meet, and the partner who covers it is suggested.
      </p>

      <SectionCard title="What's included" id="included" count={features.length} footer={canEdit ? <AddFeature action={addFeature.bind(null, offering.id)} /> : undefined}>
        {features.length === 0 ? (
          <EmptyRow>Nothing in scope yet.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-semibold">Feature</th>
                  <th className="px-4 py-2 font-semibold">What it covers</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Added by</th>
                  {canEdit ? <th className="w-20" aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {features.map((feature) => (
                  <tr key={feature.id} className="align-top">
                    <td className="px-4 py-3 font-semibold">
                      {feature.name}
                      {feature.status === "planned" ? <span className="ml-2 rounded-full bg-muted px-2 py-px text-xs font-medium text-muted-foreground">Planned</span> : null}
                    </td>
                    <td className="px-4 py-3">{feature.description}</td>
                    <td className="px-4 py-3">
                      <SourceChips sources={feature.sources} documents={documents} />
                    </td>
                    <td className="px-4 py-3">
                      <ProvenanceMarker provenance={feature.provenance ?? offering.provenance} sources={feature.sources} documents={documents} />
                    </td>
                    {canEdit ? (
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <EditDialog title={`Edit ${feature.name}`} action={updateFeature.bind(null, offering.id, feature.id)}>
                          <Field label="Feature" name="name" defaultValue={feature.name} maxLength={120} required />
                          <Field label="What it covers" name="description" defaultValue={feature.description} multiline maxLength={500} />
                          <SelectField
                            label="Available"
                            name="status"
                            defaultValue={feature.status === "planned" ? "planned" : "active"}
                            options={[
                              { value: "active", label: "Available now" },
                              { value: "planned", label: "Planned: on the roadmap only" },
                            ]}
                          />
                        </EditDialog>
                        <RemoveButton action={retireFeature.bind(null, offering.id, feature.id)} label={`Remove ${feature.name} from scope`} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Not included"
        id="excluded"
        count={notIncluded.length}
        footer={canEdit ? <AddExclusion action={addExclusion.bind(null, offering.id)} partners={graph.partners.map(({ id: partnerId, name, relationship }) => ({ id: partnerId, name, relationship }))} /> : undefined}
      >
        {notIncluded.length === 0 ? (
          <EmptyRow>No exclusions. Add what you don&apos;t do, so the agents never promise it.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-semibold">We don&apos;t do</th>
                  <th className="px-4 py-2 font-semibold">What we offer instead</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  {canEdit ? <th className="w-20" aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {notIncluded.map((rule) => {
                  const partner = partnerName(rule.partnerId);
                  return (
                    <tr key={rule.id} className="align-top">
                      <td className="px-4 py-3 font-semibold">{rule.statement}</td>
                      <td className="px-4 py-3">
                        {partner ? (
                          <>
                            <span className="capitalize">{partner.relationship}</span>{" "}
                            <Link href={`/offerings/${offering.id}/partners`} className="text-link hover:underline">
                              {partner.name}
                            </Link>
                            {rule.insteadText ? `. ${rule.insteadText}` : null}
                          </>
                        ) : (
                          (rule.insteadText ?? <span className="text-muted-foreground">Nothing offered instead</span>)
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {rule.sources.length > 0 ? <SourceChips sources={rule.sources} documents={documents} /> : <ProvenanceMarker provenance={rule.provenance} sources={[]} documents={documents} />}
                      </td>
                      {canEdit ? (
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <EditDialog title="Edit the exclusion" action={updateExclusion.bind(null, rule.id)}>
                            <Field label="We don't do" name="statement" defaultValue={rule.statement} maxLength={200} required />
                            <Field label="What we offer instead" name="insteadText" defaultValue={rule.insteadText ?? ""} maxLength={300} hint="optional" />
                            <SelectField
                              label="Partner who covers it"
                              name="partnerId"
                              defaultValue={rule.partnerId ?? ""}
                              options={[{ value: "", label: "None" }, ...graph.partners.map((item) => ({ value: item.id, label: item.name }))]}
                            />
                          </EditDialog>
                          <RemoveButton action={removeExclusion.bind(null, rule.id)} label={`Remove the exclusion ${rule.statement}`} />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Company-wide rules" id="rules" subtitle="Apply to every offering" action={<Link href="/settings" className="text-sm text-link hover:underline">Edit in Settings</Link>}>
        {companyWide.length === 0 ? (
          <EmptyRow>No company-wide rules.</EmptyRow>
        ) : (
          <ul className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-3.5 text-sm">
            {companyWide.map((rule) => (
              <li key={rule.id} className="flex items-center gap-2">
                <span className="rounded-full bg-fit-cannot-soft px-2 py-px text-xs font-semibold text-fit-cannot">{RULE_LABEL[rule.kind]}</span>
                {rule.statement}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

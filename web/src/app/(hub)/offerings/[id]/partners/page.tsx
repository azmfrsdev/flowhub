import { Lock, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProvenanceMarker } from "@/components/flowhub/provenance";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { DeleteButton } from "@/components/flowhub/delete-button";
import { EditDialog, Field, SelectField } from "@/components/flowhub/edit-dialog";
import { RemoveButton } from "@/components/flowhub/remove-button";
import type { Partner } from "@/lib/schema";
import { loadOffering } from "@/server/graph/offering";
import { addPartner, deletePartner, unlinkPartner, updatePartner } from "./actions";

export const metadata: Metadata = { title: "Partners" };

const RELATIONSHIP_TONE = {
  partner: "bg-accent text-accent-foreground",
  vendor: "bg-attention-soft text-attention",
  supplier: "bg-muted text-foreground",
} as const;

/** FR-OFR-6, the Partners tab. Contacts and buy prices never appear in proposals (invariant 2). */
export default function PartnersPage({ params }: PageProps<"/offerings/[id]/partners">) {
  return (
    <Suspense fallback={<TabFallback label="Loading partners" />}>
      <Partners params={params} />
    </Suspense>
  );
}

async function Partners({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { offering, graph, documents, role } = await loadOffering(id);
  const partners = graph.partners.filter((partner) => offering.partnerIds.includes(partner.id));
  const canEdit = role !== "viewer";
  const others = graph.partners.filter((partner) => !offering.partnerIds.includes(partner.id));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-muted-foreground">
          Partners, vendors and suppliers you work with on this offering, and who to call. Each company is stored once and can appear on several offerings.
        </p>
        {canEdit ? (
          <EditDialog title="Add a partner" trigger="add" action={addPartner.bind(null, offering.id)} submitLabel="Add">
            {others.length ? (
              <SelectField label="A company already in the hub" name="existingId" defaultValue="" options={[{ value: "", label: "No, a new one (fill in below)" }, ...others.map((partner) => ({ value: partner.id, label: partner.name }))]} />
            ) : null}
            <PartnerFields />
          </EditDialog>
        ) : null}
      </div>
      {partners.length === 0 ? (
        <SectionCard title="Partners" id="partners">
          <EmptyRow>No partners on this offering.</EmptyRow>
        </SectionCard>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {partners.map((partner) => {
            const covers = graph.constraints.find((rule) => rule.partnerId === partner.id && rule.offeringIds.includes(offering.id));
            const alsoOn = graph.offerings.filter((other) => other.id !== offering.id && other.partnerIds.includes(partner.id));
            const contact = partner.contacts[0];
            return (
              <article key={partner.id} aria-labelledby={`p-${partner.id}`} className="flex flex-col rounded-xl border bg-card">
                <div className="flex items-start gap-3 border-b px-4 py-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold">
                    {partner.name
                      .split(/\s+/)
                      .map((word) => word[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <b id={`p-${partner.id}`}>{partner.name}</b>
                      <span className={`rounded-full px-2 py-px text-xs font-semibold capitalize ${RELATIONSHIP_TONE[partner.relationship]}`}>{partner.relationship}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{[partner.covers.join(", "), partner.region].filter(Boolean).join(" · ")}</span>
                  </div>
                  {canEdit ? (
                    <span className="flex shrink-0 items-center">
                      <EditDialog title={`Edit ${partner.name}`} action={updatePartner.bind(null, partner.id)}>
                        <PartnerFields partner={partner} />
                      </EditDialog>
                      <RemoveButton action={unlinkPartner.bind(null, offering.id, partner.id)} label={`Take ${partner.name} off this offering`} />
                      <DeleteButton
                        action={deletePartner.bind(null, partner.id)}
                        label={`Delete ${partner.name}`}
                        confirm={`Delete ${partner.name} from the hub?${alsoOn.length ? ` It also leaves ${alsoOn.length} other ${alsoOn.length === 1 ? "offering" : "offerings"}.` : ""}`}
                      />
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-3 px-4 py-3">
                  <dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-[130px_minmax(0,1fr)]">
                    <dt className="text-muted-foreground">For this offering</dt>
                    <dd>
                      {covers ? (
                        <>
                          Covers {covers.statement.charAt(0).toLowerCase() + covers.statement.slice(1)}, which we don&apos;t do (see{" "}
                          <Link href={`/offerings/${offering.id}/scope`} className="text-primary hover:underline">
                            Scope
                          </Link>
                          )
                        </>
                      ) : (
                        partner.covers.join(", ") || "Not set"
                      )}
                    </dd>
                    {partner.arrangement ? (
                      <>
                        <dt className="text-muted-foreground">Arrangement</dt>
                        <dd>{partner.arrangement}</dd>
                      </>
                    ) : null}
                    {partner.buyPrice ? (
                      <>
                        <dt className="text-muted-foreground">Buy price</dt>
                        <dd className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px] text-private">{partner.buyPrice}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-private-soft px-2 py-px text-xs font-semibold text-private">
                            <Lock aria-hidden="true" className="size-3" />
                            Private
                          </span>
                        </dd>
                      </>
                    ) : null}
                    {alsoOn.length > 0 ? (
                      <>
                        <dt className="text-muted-foreground">Also on</dt>
                        <dd className="flex flex-wrap gap-x-2">
                          {alsoOn.map((other) => (
                            <Link key={other.id} href={`/offerings/${other.id}/partners`} className="text-primary hover:underline">
                              {other.name}
                            </Link>
                          ))}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {contact ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Person in charge</span>
                      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                          {contact.name
                            .split(/\s+/)
                            .map((word) => word[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                        <span className="flex flex-col">
                          <b>{contact.name}</b>
                          {contact.role ? <span className="text-xs text-muted-foreground">{contact.role}</span> : null}
                        </span>
                        <span className="flex-1" />
                        <span className="flex flex-col gap-0.5 text-xs">
                          {contact.email ? (
                            <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                              <Mail aria-hidden="true" className="size-3" />
                              {contact.email}
                            </a>
                          ) : null}
                          {contact.phone ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Phone aria-hidden="true" className="size-3" />
                              {contact.phone}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <ProvenanceMarker provenance={partner.provenance} sources={partner.sources} documents={documents} withSource />
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Lock aria-hidden="true" className="size-4 text-private" />
        Contacts stay inside your workspace. Proposals may name a partner, but never their contacts or your buy price.
      </p>
    </>
  );
}

/** FR-OFR-6: a partner's details. The buy price is private: shown here only, never to an agent or a client (invariant 2). */
function PartnerFields({ partner }: { partner?: Partner }) {
  const contact = partner?.contacts[0];
  return (
    <>
      <Field label="Company" name="name" defaultValue={partner?.name ?? ""} maxLength={120} required={!partner ? undefined : true} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Relationship"
          name="relationship"
          defaultValue={partner?.relationship ?? "partner"}
          options={[
            { value: "partner", label: "Partner" },
            { value: "vendor", label: "Vendor" },
            { value: "supplier", label: "Supplier" },
          ]}
        />
        <Field label="Region" name="region" defaultValue={partner?.region ?? ""} maxLength={80} hint="optional" />
      </div>
      <Field label="What they cover" name="covers" defaultValue={partner?.covers.join(", ") ?? ""} maxLength={300} hint="commas between items" placeholder="Network switches, Cabling" />
      <Field label="Arrangement" name="arrangement" defaultValue={partner?.arrangement ?? ""} maxLength={300} hint="optional" placeholder="We resell; they install." />
      <Field label="Buy price" name="buyPrice" defaultValue={partner?.buyPrice ?? ""} maxLength={120} hint="private, never in a proposal" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Person in charge" name="contactName" defaultValue={contact?.name ?? ""} maxLength={120} hint="optional" />
        <Field label="Their role" name="contactRole" defaultValue={contact?.role ?? ""} maxLength={120} />
        <Field label="Email" name="contactEmail" type="email" defaultValue={contact?.email ?? ""} maxLength={120} />
        <Field label="Phone" name="contactPhone" defaultValue={contact?.phone ?? ""} maxLength={40} />
      </div>
    </>
  );
}

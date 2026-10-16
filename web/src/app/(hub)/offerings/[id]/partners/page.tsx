import { Lock, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProvenanceMarker } from "@/components/flowhub/provenance";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { loadOffering } from "@/server/graph/offering";

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
  const { offering, graph, documents } = await loadOffering(id);
  const partners = graph.partners.filter((partner) => offering.partnerIds.includes(partner.id));

  return (
    <>
      <p className="text-muted-foreground">
        Partners, vendors and suppliers you work with on this offering, and who to call. Each company is stored once and can appear on several offerings.
      </p>
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
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <b id={`p-${partner.id}`}>{partner.name}</b>
                      <span className={`rounded-full px-2 py-px text-xs font-semibold capitalize ${RELATIONSHIP_TONE[partner.relationship]}`}>{partner.relationship}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{[partner.covers.join(", "), partner.region].filter(Boolean).join(" · ")}</span>
                  </div>
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

import { FileText, Lock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SourceChips } from "@/components/flowhub/provenance";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import Link from "next/link";
import { loadOffering } from "@/server/graph/offering";
import { getProofCitations } from "@/server/workspace/queries";
import { setProofPublic } from "./actions";
import { DocumentStatus, FileDrop } from "./file-drop";
import { PublicToggle } from "./public-toggle";

export const metadata: Metadata = { title: "Sales material" };

const KIND = { sales_deck: "Deck", brochure: "Brochure", rate_card: "Rate card", past_proposal: "Past proposal", case_study: "Case studies", other: "Document" } as const;

/** FR-OFR-7, the Sales material tab: files, and the results the agents may cite. */
export default function SalesPage({ params }: PageProps<"/offerings/[id]/sales">) {
  return (
    <Suspense fallback={<TabFallback label="Loading sales material" />}>
      <Sales params={params} />
    </Suspense>
  );
}

async function Sales({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ offering, graph, documents, role }, citations] = await Promise.all([loadOffering(id), getProofCitations()]);
  const canEdit = role !== "viewer";
  const files = graph.documents.filter((doc) => doc.offeringIds.includes(offering.id));
  const results = graph.proof.filter((item) => item.offeringIds.includes(offering.id));
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });

  return (
    <>
      <FileDrop offeringId={offering.id} canEdit={canEdit} />

      <SectionCard title="Files" id="files" count={files.length}>
        {files.length === 0 ? (
          <EmptyRow>No files yet.</EmptyRow>
        ) : (
          <ul className="grid gap-3 p-4 lg:grid-cols-2">
            {files.map((file) => {
              const shared = graph.offerings.filter((other) => other.id !== offering.id && file.offeringIds.includes(other.id) && other.parentId === null).length;
              return (
                <li key={file.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <FileText aria-hidden="true" className="mt-0.5 size-8 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <b className="truncate">{file.name}</b>
                    {file.summary ? <span className="text-sm">{file.summary}</span> : null}
                    <span className="text-xs text-muted-foreground">
                      {[KIND[file.kind], file.pages ? `${file.pages} pages` : null, `uploaded ${date.format(new Date(file.uploadedAt))} by ${file.uploadedBy}`, shared ? `shared with ${shared} other ${shared === 1 ? "offering" : "offerings"}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {file.shareable ? (
                        <span className="rounded-full bg-fit-strong-soft px-2 py-px text-xs font-semibold text-fit-strong">OK to share with clients</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-private-soft px-2 py-px text-xs font-semibold text-private">
                          <Lock aria-hidden="true" className="size-3" />
                          Internal only
                        </span>
                      )}
                      <DocumentStatus doc={file} canEdit={canEdit} />
                      {file.scanned ? <span className="text-xs text-muted-foreground">Scanned: Gemini read the page images</span> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Results you can cite"
        id="results"
        subtitle="Case studies and numbers the agents may use in proposals"
        footer={<span className="text-muted-foreground">If a draft names a result marked Not public, the Reviewer blocks the draft.</span>}
      >
        {results.length === 0 ? (
          <EmptyRow>No results yet.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-semibold">Result</th>
                  <th className="px-4 py-2 font-semibold">Can be cited</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Cited in</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-3">
                      <b>{item.title}</b>
                      {item.body ? <div className="text-xs text-muted-foreground">{item.body}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {item.isPublic ? (
                          <span className="rounded-full bg-fit-strong-soft px-2 py-px text-xs font-semibold text-fit-strong">Public</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-private-soft px-2 py-px text-xs font-semibold text-private">
                            <Lock aria-hidden="true" className="size-3" />
                            Not public
                          </span>
                        )}
                        {canEdit ? <PublicToggle action={setProofPublic.bind(null, item.id, !item.isPublic)} isPublic={item.isPublic} title={item.title} /> : null}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceChips sources={item.sources} documents={documents} />
                    </td>
                    <td className="px-4 py-3">
                      {citations.get(item.id)?.length ? (
                        <span className="flex flex-col gap-0.5">
                          {citations.get(item.id)!.map((cite) => (
                            <Link key={cite.opportunityId} href={`/opportunities/${cite.opportunityId}`} className="text-primary hover:underline">
                              Proposal for {cite.prospect}
                            </Link>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not cited yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

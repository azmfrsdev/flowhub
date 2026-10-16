import { sourceLabel } from "@/lib/offerings/view";
import type { DocumentRecord, Provenance, SourceRef } from "@/lib/schema";
import { AiMarker, PersonMarker } from "./markers";
import { SourceDrawerChip } from "./source-drawer";

const KIND = { sales_deck: "Sales deck", brochure: "Brochure", rate_card: "Rate card", past_proposal: "Past proposal", case_study: "Case studies", other: "Document" } as const;

/** A source chip: which document and page a fact came from (invariant 3, FR-OFR AC). It opens the source drawer (FR-OG-9). */
export function SourceChip({ source, documents }: { source: SourceRef; documents: Map<string, DocumentRecord> }) {
  const doc = source.documentId ? documents.get(source.documentId) : undefined;
  return (
    <SourceDrawerChip
      label={sourceLabel(source, documents)}
      quote={source.quote}
      locator={source.locator ?? {}}
      fromMessage={Boolean(source.proposalId && !source.documentId)}
      doc={
        doc
          ? { id: doc.id, name: doc.name, kind: KIND[doc.kind], pages: doc.pages, hasFile: Boolean(doc.storagePath), uploadedBy: doc.uploadedBy, uploadedAt: doc.uploadedAt, scanned: doc.scanned }
          : null
      }
    />
  );
}

export function SourceChips({ sources, documents }: { sources: SourceRef[]; documents: Map<string, DocumentRecord> }) {
  if (sources.length === 0) return <span className="text-xs text-muted-foreground">Entered by hand</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {sources.map((source, index) => (
        <SourceChip key={`${source.documentId ?? source.proposalId}-${index}`} source={source} documents={documents} />
      ))}
    </span>
  );
}

/**
 * Who put a record there (ADR-0009 D4). Read from a document or a message by
 * AI and confirmed by a person shows the AI marker; typed in by hand shows the person.
 */
export function ProvenanceMarker({
  provenance,
  sources,
  documents,
  withSource = false,
}: {
  provenance: Provenance | undefined;
  sources: SourceRef[];
  documents: Map<string, DocumentRecord>;
  withSource?: boolean;
}) {
  const by = provenance?.confirmedBy;
  const readByAi = sources.length > 0 || provenance?.via === "document" || provenance?.via === "message";
  if (!readByAi) return by ? <PersonMarker name={by} /> : <span className="text-xs text-muted-foreground">Entered by hand</span>;
  const from = withSource && sources[0] ? `From ${sourceLabel(sources[0], documents)}` : null;
  const label = [from, by ? `confirmed by ${by}` : null].filter(Boolean).join(" · ");
  return <AiMarker>{label ? label.charAt(0).toUpperCase() + label.slice(1) : "Read by AI"}</AiMarker>;
}

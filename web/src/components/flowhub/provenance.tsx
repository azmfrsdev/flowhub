import { FileText, MessageSquare } from "lucide-react";
import { sourceLabel } from "@/lib/offerings/view";
import type { DocumentRecord, Provenance, SourceRef } from "@/lib/schema";
import { AiMarker, PersonMarker } from "./markers";

/** A source chip: which document and page a fact came from (invariant 3, FR-OFR AC). */
export function SourceChip({ source, documents }: { source: SourceRef; documents: Map<string, DocumentRecord> }) {
  const Icon = source.proposalId && !source.documentId ? MessageSquare : FileText;
  return (
    <span
      title={source.quote ? `"${source.quote}"` : undefined}
      className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-px text-xs whitespace-nowrap"
    >
      <Icon aria-hidden="true" className="size-3 text-primary" />
      {sourceLabel(source, documents)}
    </span>
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

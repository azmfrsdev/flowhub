import { cn } from "cn";

/** Names the fit map needs to label references. No prices, no cost. */
export type Catalogue = {
  offerings: Record<string, string>;
  features: Record<string, string>;
  constraints: Record<string, { statement: string; companyWide: boolean; offeringId: string | null }>;
  partners: Record<string, string>;
  proof: Record<string, string>;
  /** Where a priced line came from: "Google Cloud migration · Packages". Names only. */
  priceSources: Record<string, string>;
};

export function ScoreBadge({ value, band }: { value: number; band: "go" | "consider" | "nogo" }) {
  const tone = { go: "bg-score-go-soft text-score-go", consider: "bg-score-consider-soft text-score-consider", nogo: "bg-score-nogo-soft text-score-nogo" }[band];
  return <span className={cn("rounded-full px-2 py-px text-xs font-bold", tone)}>{`${value} · ${{ go: "Go", consider: "Consider", nogo: "No-go" }[band]}`}</span>;
}

export function Panel({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return <section className={cn("flex flex-col gap-3 rounded-xl border bg-card px-4 py-4", tone === "error" && "border-destructive/40 bg-destructive/5 text-destructive")}>{children}</section>;
}

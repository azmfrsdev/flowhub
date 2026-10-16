import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CalcMarker } from "@/components/flowhub/markers";
import { ProvenanceMarker } from "@/components/flowhub/provenance";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { malaysiaDay, marginPercent } from "@/lib/offerings/view";
import type { FeeSchedule } from "@/lib/schema";
import { loadOffering } from "@/server/graph/offering";
import { getPendingProposals } from "@/server/proposals/queries";
import { AddPricing, CostCardEditor, FeeScheduleEditor, type PendingPrice, RateCardEditor } from "./price-editors";

export const metadata: Metadata = { title: "Pricing" };

/** FR-OFR-5, the Pricing tab. Cost is shown to the team only, marked private (invariant 2). */
export default function PricingPage({ params }: PageProps<"/offerings/[id]/pricing">) {
  return (
    <Suspense fallback={<TabFallback label="Loading pricing" />}>
      <Pricing params={params} />
    </Suspense>
  );
}

async function Pricing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ offering, graph, currency, documents, role }, proposals] = await Promise.all([loadOffering(id), getPendingProposals()]);
  const canEdit = role !== "viewer";
  const day = malaysiaDay();
  // FR-ASK-5: proposed price changes show on the cell or line they'd change.
  const pendingCells: Record<string, Record<string, PendingPrice>> = {};
  const pendingLines: Record<string, Record<string, PendingPrice>> = {};
  for (const proposal of proposals) {
    for (const { op, status } of proposal.operations) {
      if (status !== "proposed") continue;
      const value = (after: string, from?: string): PendingPrice => ({ after, ...(from ? { from } : {}), proposalId: proposal.id });
      if (op.kind === "set_price_cell") (pendingCells[op.rateCardId] ??= {})[`${op.rowId}:${op.colId}`] = value(op.after, op.effectiveFrom);
      if (op.kind === "set_fee_line_price") (pendingLines[op.feeScheduleId] ??= {})[op.lineId] = value(op.after, op.effectiveFrom);
    }
  }
  const cards = graph.rateCards.filter((card) => card.offeringId === offering.id && card.kind === "pricing");
  const costCards = graph.rateCards.filter((card) => card.offeringId === offering.id && card.kind === "cost");
  const schedules = graph.feeSchedules.filter((schedule) => schedule.offeringId === offering.id);
  const bySection = (section: FeeSchedule["section"]) => schedules.filter((schedule) => schedule.section === section);

  const has = { add_ons: bySection("add_ons").length > 0, man_days: bySection("man_days").length > 0 };

  if (cards.length === 0 && schedules.length === 0) {
    return canEdit ? (
      <AddPricing offeringId={offering.id} empty has={has} />
    ) : (
      <SectionCard title="Pricing" id="pricing">
        <EmptyRow>No prices yet. Proposals for this offering will say &quot;On quote&quot; until some are added.</EmptyRow>
      </SectionCard>
    );
  }

  return (
    <>
      <p className="flex items-start gap-2 rounded-xl border border-private/25 bg-private-soft px-4 py-3 text-sm">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-private" />
        Your team sees cost and margin here. The agents, quotes and proposals only ever get the price columns, and a test checks it on every build.
      </p>

      {cards.map((card) => (
        <RateCardEditor
          key={card.id}
          card={card}
          marker={<ProvenanceMarker provenance={card.provenance} sources={card.sources} documents={documents} withSource />}
          canEdit={canEdit}
          day={day}
          pending={pendingCells[card.id]}
        />
      ))}

      {costCards.map((cost) => (
        <CostCardEditor
          key={cost.id}
          card={cost}
          priceCard={cards.find((card) => card.rows.some((row) => cost.rows.some((r) => r.id === row.id)))}
          currency={currency}
          canEdit={canEdit}
          day={day}
        />
      ))}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {[...bySection("man_days"), ...bySection("add_ons"), ...bySection("other")].map((schedule) => (
          <FeeScheduleEditor
            key={schedule.id}
            schedule={schedule}
            currency={currency}
            canEdit={canEdit}
            day={day}
            pending={pendingLines[schedule.id]}
            footer={
              <>
                <ProvenanceMarker provenance={schedule.provenance} sources={schedule.sources} documents={documents} withSource />
                <span className="flex-1" />
                {schedule.lines.some((line) => marginPercent(line.price, line.cost, currency) !== null) ? <CalcMarker>Margin calculated, never stored</CalcMarker> : null}
              </>
            }
          />
        ))}
      </div>

      {canEdit ? <AddPricing offeringId={offering.id} empty={false} has={has} /> : null}
    </>
  );
}

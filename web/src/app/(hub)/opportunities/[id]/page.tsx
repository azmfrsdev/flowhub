import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TabFallback } from "@/components/flowhub/section-card";
import { Opportunity, type Run } from "@/lib/schema";
import { STAGES } from "@/server/deal-room/runs";
import { db } from "@/server/firebase/admin";
import { getWorkspaceGraph } from "@/server/graph/read";
import template from "@/server/templates/sme.json";
import { getHubContext } from "@/server/workspace/access";
import { DealRoom } from "./deal-room";
import type { Catalogue } from "./shared";

export const metadata: Metadata = { title: "Deal room" };

/** The deal room (PRD 7.9, ADR-0005): the stage rail, the current stage, and the gate. Live through Firestore listeners. */
export default function DealRoomPage({ params }: PageProps<"/opportunities/[id]">) {
  return (
    <Suspense fallback={<TabFallback label="Opening the deal room" />}>
      <DealRoomLoader params={params} />
    </Suspense>
  );
}

async function DealRoomLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ workspace, role }, graph] = await Promise.all([getHubContext(), getWorkspaceGraph()]);
  const oppRef = db().doc(`workspaces/${workspace.id}/opportunities/${id}`);
  const snap = await oppRef.get();
  if (!snap.exists || snap.get("deletedAt")) notFound();
  const opportunity = Opportunity.parse(snap.data());
  const runIds = STAGES.flatMap((stage) => (opportunity.stages[stage].currentRunId ? [opportunity.stages[stage].currentRunId!] : []));
  const runs = Object.fromEntries((await Promise.all(runIds.map((runId) => oppRef.collection("runs").doc(runId).get()))).map((doc) => [doc.id, doc.data() as Run]));

  // Names only: what the fit map needs to label references. No prices, no cost.
  const catalogue: Catalogue = {
    offerings: Object.fromEntries(graph.offerings.map((offering) => [offering.id, offering.name])),
    features: Object.fromEntries(graph.offerings.flatMap((offering) => offering.features.map((feature) => [feature.id, feature.name]))),
    constraints: Object.fromEntries(graph.constraints.map((rule) => [rule.id, { statement: rule.statement, companyWide: rule.offeringIds.length === 0, offeringId: rule.offeringIds[0] ?? null }])),
    partners: Object.fromEntries(graph.partners.map((partner) => [partner.id, partner.name])),
    proof: Object.fromEntries(graph.proof.map((item) => [item.id, item.title])),
    priceSources: Object.fromEntries(
      [...graph.rateCards.filter((card) => card.kind === "pricing"), ...graph.feeSchedules].map((item) => [
        item.id,
        `${graph.offerings.find((offering) => offering.id === item.offeringId)?.name ?? "Offering"} · ${item.name}`,
      ]),
    ),
  };

  const titles = Object.fromEntries(template.sections.map((section) => [section.key, section.title]));
  return <DealRoom workspaceId={workspace.id} initial={opportunity} initialRuns={runs} catalogue={catalogue} canEdit={role !== "viewer"} seller={workspace.name} titles={titles} />;
}

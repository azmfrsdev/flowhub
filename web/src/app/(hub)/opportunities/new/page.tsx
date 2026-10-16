import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getWorkspaceGraph } from "@/server/graph/read";
import { NewOpportunityForm } from "./new-opportunity-form";

export const metadata: Metadata = { title: "New opportunity" };

/** FR-OPP-4 and FR-INT-1: what came in, and optionally which offerings they asked about. */
export default function NewOpportunityPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-muted-foreground">
        <Link href="/opportunities" className="text-link hover:underline">
          Opportunities
        </Link>
        <span aria-hidden="true">/</span>
        <span>New opportunity</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">New opportunity</h1>
        <p className="text-muted-foreground">Paste what came in, or attach it. The agents work stage by stage, and you approve each one before the next starts.</p>
      </div>
      <section className="max-w-3xl rounded-xl border-2 border-ink bg-card shadow-comic">
        <Suspense fallback={<div className="h-80" />}>
          <Form />
        </Suspense>
      </section>
    </>
  );
}

async function Form() {
  const graph = await getWorkspaceGraph();
  const offerings = graph.offerings.filter((offering) => offering.parentId === null).sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name }));
  return <NewOpportunityForm offerings={offerings} />;
}

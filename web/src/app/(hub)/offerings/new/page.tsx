import type { Metadata } from "next";
import Link from "next/link";
import { NewOfferingForm } from "./new-offering-form";

export const metadata: Metadata = { title: "New offering" };

/** FR-OFR-1: the short form behind New offering. */
export default function NewOfferingPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-muted-foreground">
        <Link href="/offerings" className="text-link hover:underline">
          Offerings
        </Link>
        <span aria-hidden="true">/</span>
        <span>New offering</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">New offering</h1>
        <p className="text-muted-foreground">Start with the basics. Scope, pricing, partners and sales material go on its tabs.</p>
      </div>
      <section className="max-w-xl rounded-xl border-2 border-ink bg-card shadow-comic">
        <NewOfferingForm />
      </section>
    </>
  );
}

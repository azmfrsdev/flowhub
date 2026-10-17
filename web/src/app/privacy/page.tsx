import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/flowhub/wordmark";

export const metadata: Metadata = { title: "Privacy" };

/** Privacy page (PRD FR-WS-7, ADR-0007). Google's OAuth consent screen links here. */
export default function PrivacyPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-8 sm:px-10">
      <header>
        <Link href="/" aria-label="FlowHub home">
          <Wordmark />
        </Link>
      </header>

      <main className="flex flex-col gap-6 pb-16 leading-relaxed">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
          <p className="text-muted-foreground">
            FlowHub is a prototype built for AI Builder Cup 2026. This page says what it stores, what it asks Google
            for, and how to remove your data.
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">What FlowHub stores</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Your name, email address and Google account ID, so you can sign in.</li>
            <li>
              Your workspace: the offerings, prices, results, partners and notes you add, the PDFs you upload, the
              opportunities you create, and the research briefs, fit maps and drafts FlowHub produces for them.
            </li>
            <li>A record of who changed what and when, and daily usage counts.</li>
          </ul>
          <p>
            Data is stored in Google Cloud in Singapore (asia-southeast1). Gemini models run on Google Cloud. Cost
            prices and results you mark as not public stay inside your workspace and are never sent to a model.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Research about other companies</h2>
          <p>
            When you research a prospect, FlowHub searches the public web with Google Search and keeps the sources it
            used, so every claim can be checked. It researches companies, not private individuals.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Google Drive</h2>
          <p>
            When you create a proposal in Google Docs, FlowHub asks Google for permission to create files in your
            Drive. It uses the narrowest permission Google offers: it can see and change only the files FlowHub
            creates, in a folder called FlowHub. It cannot see anything else in your Drive.
          </p>
          <p>
            That permission is used once, at the moment the Doc is created. FlowHub never stores or logs your Google
            tokens. You can revoke the permission at any time in your Google Account. Settings links there.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Removing your data</h2>
          <p>
            The Owner of a workspace can delete it in Settings. That removes the workspace, its documents and its
            history, along with any sample copies it replaced. Docs already created in your Drive stay there, under
            your control.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Sample data</h2>
          <p>
            The three sample companies, Olvessa Cloud, Yorvex Workforce and Trassoq Hardware, and everyone in them are fictional. So
            are the brands they sell, and their prices, clients, partners and suppliers.
          </p>
          <p>
            Choosing a different sample company replaces your sample workspace. The copy it replaces is kept, out of
            sight, with everything you added to it.
          </p>
        </section>
      </main>
    </div>
  );
}

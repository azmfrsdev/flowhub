import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BrandHero, Wordmark } from "@/components/flowhub/wordmark";
import { SignInWithNext } from "./sign-in-with-next";

export const metadata: Metadata = { title: "Sign in" };

/** Where expired sessions land (FR-WS-1). A browser still signed in to Google recovers without a click. */
export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 py-5 sm:px-10">
        <Link href="/" aria-label="FlowHub home">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-14">
        <BrandHero size={220} />
        <section className="flex w-full max-w-md flex-col gap-5 rounded-2xl border-2 border-ink bg-card p-9 shadow-comic-lg">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold">Sign in to FlowHub</h1>
            <p className="text-muted-foreground">Use your Google account to get back to your workspace.</p>
          </div>
          <Suspense fallback={<div className="h-12 rounded-lg bg-muted" />}>
            <SignInWithNext />
          </Suspense>
          <p className="text-sm text-muted-foreground">
            FlowHub asks Google only for your name and email.{" "}
            <Link href="/privacy" className="text-link underline-offset-4 hover:underline">
              Privacy
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}

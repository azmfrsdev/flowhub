import Link from "next/link";
import { FileText, Globe, Lock } from "lucide-react";
import { GoogleSignIn } from "@/components/flowhub/google-sign-in";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { Wordmark } from "@/components/flowhub/wordmark";
import { Badge } from "@/components/ui/badge";

/** Public home page (PRD FR-WS-7, screen S17). Google's consent screen links here. */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 sm:px-10">
        <Wordmark />
        <nav className="flex gap-5 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-14 sm:px-10">
        <div className="grid w-full max-w-6xl items-center gap-14 lg:grid-cols-2">
          <section className="flex flex-col gap-6">
            <Badge variant="outline" className="h-auto py-1 text-muted-foreground">
              Built for companies that sell without a big sales team
            </Badge>
            <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
              Everything your company sells, in one place. Turned into proposals you can trust.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              FlowHub keeps your offerings, pricing and proof on one page each. Tell it what changed and it updates
              the right tab. When an opportunity arrives, Gemini researches the prospect with cited sources, maps
              their needs to what you sell, prices it from your own rate card and drafts the proposal. You approve
              every step.
            </p>

            <div className="max-w-xl rounded-xl border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Every block says who did it</span>
              </div>
              <ul className="flex flex-col divide-y px-4 text-sm">
                <li className="flex flex-wrap items-center gap-2 py-2.5">
                  <span>Operates 42 stores across Peninsular Malaysia.</span>
                  <span className="inline-flex items-center gap-1 rounded-md border px-1.5 text-xs">
                    <Globe aria-hidden="true" className="size-3 text-primary" /> anjungserai.example
                  </span>
                  <AiMarker>Researcher</AiMarker>
                </li>
                <li className="flex flex-wrap items-center gap-2 py-2.5">
                  <span>Growth landing zone setup:</span>
                  <span className="rounded bg-fit-strong-soft px-1.5 font-mono text-xs text-fit-strong">RM 18,000</span>
                  <span className="inline-flex items-center gap-1 rounded-md border px-1.5 text-xs">
                    <FileText aria-hidden="true" className="size-3 text-fit-strong" /> Sales deck p.7
                  </span>
                  <CalcMarker>Copied, never typed</CalcMarker>
                </li>
                <li className="flex flex-wrap items-center gap-2 py-2.5">
                  <span>Research brief approved at Gate B.</span>
                  <PersonMarker name="Nadia" />
                </li>
              </ul>
            </div>
          </section>

          <section className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border bg-card p-9 shadow-xl shadow-foreground/5">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-bold">Sign in to FlowHub</h2>
              <p className="text-muted-foreground">
                Use your Google account. You can try a ready-made sample company straight after.
              </p>
            </div>
            <GoogleSignIn />
            <p className="flex items-start gap-2.5 rounded-lg bg-muted p-3 text-sm">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-private" />
              FlowHub asks Google only for your name and email. Google tokens are never stored.
            </p>
            <p className="text-sm text-muted-foreground">
              By continuing you agree to the{" "}
              <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
                privacy notice
              </Link>
              . Built for AI Builder Cup 2026.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

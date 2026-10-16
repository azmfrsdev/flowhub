import Link from "next/link";
import { GoogleSignIn } from "@/components/flowhub/google-sign-in";
import { BrandHero, Wordmark } from "@/components/flowhub/wordmark";

/** Public home page (PRD FR-WS-7, screen S17). Google's consent screen links here. */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 py-5 sm:px-10">
        <Wordmark />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-7 px-4 pb-16 text-center sm:px-10">
        <BrandHero size={280} />
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="text-3xl leading-tight text-balance sm:text-4xl">Everything you sell, in one place.</h1>
          <p className="text-lg text-muted-foreground">Turned into cited, priced proposals. You approve every step.</p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <GoogleSignIn />
          <p className="text-sm text-muted-foreground">Try a sample company once you&apos;re in.</p>
        </div>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground sm:px-10">
        Google shares only your name and email.{" "}
        <Link href="/privacy" className="text-link underline-offset-4 hover:underline">
          Privacy
        </Link>{" "}
        · Built for AI Builder Cup 2026
      </footer>
    </div>
  );
}

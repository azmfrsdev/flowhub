import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formTitle } from "@/lib/inbox/form";
import { InboxSettings } from "@/lib/schema";
import { formLink, qrSvg } from "@/server/inbox/qr";
import { getHubContext } from "@/server/workspace/access";

export const metadata: Metadata = { title: "Website form QR code" };

/**
 * PRD 7.30, FR-FORM-10: a printable page with one large QR code to the
 * website form, for a stand or the stage. Outside the hub shell, so it prints
 * without the sidebar. Signed-in members only, like Settings › Inbox.
 */
export default function FormQrPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <Link href="/settings/inbox" className="self-start text-sm text-link hover:underline print:hidden">
        ← Settings · Inbox
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Drawing the QR code…</p>}>
        <FormQr />
      </Suspense>
    </main>
  );
}

async function FormQr() {
  const { workspace } = await getHubContext();
  const settings = InboxSettings.parse(workspace.inbox ?? {});
  const link = formLink(settings);
  const svg = link ? await qrSvg(link, 520) : null;
  if (!svg || !link) {
    return (
      <p className="text-muted-foreground">
        No website form yet. Run <code>createLeadForm</code> in the Gmail script, then come back to{" "}
        <Link href="/settings/inbox" className="text-link hover:underline">
          Settings · Inbox
        </Link>
        .
      </p>
    );
  }
  return (
    <>
      <h1 className="text-4xl font-bold sm:text-5xl">{formTitle(workspace.name)}</h1>
      <p className="text-lg text-muted-foreground">Scan with your phone&apos;s camera, then fill in the form.</p>
      {/* Drawn on the server by the qrcode library, from an https address only. */}
      <div className="w-full max-w-[420px] rounded-2xl border-4 border-ink bg-white p-4 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`QR code for ${link}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="font-mono text-base break-all">{link.replace(/^https:\/\//, "")}</p>
      <p className="text-sm text-muted-foreground">{workspace.name} · answers go to FlowHub&apos;s inbox</p>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { INBOX_DAILY_LIMIT, InboxSettings } from "@/lib/schema";
import { formLink, qrSvg } from "@/server/inbox/qr";
import { getHubContext } from "@/server/workspace/access";
import { AutoIntakeSwitch, KeyPanel } from "./inbox-settings";

export const metadata: Metadata = { title: "Settings · Inbox" };

const SCRIPT_URL = "https://github.com/azmfrsdev/flowhub/tree/main/integrations/gmail";
/** The script checks every minute; three missed checks reads as not connected. */
const STALE_MS = 3 * 60_000;

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));

/** FR-INBOX-2: connect the sales inbox in Gmail. About five minutes, once. */
export default function InboxSettingsPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-muted-foreground">
        <Link href="/settings" className="text-link hover:underline">
          Settings
        </Link>
        <span aria-hidden="true">/</span>
        <span>Inbox</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings · Inbox</h1>
        <p className="text-muted-foreground">Let FlowHub read your sales inbox in Gmail. Takes about five minutes, once.</p>
      </div>
      <Suspense fallback={<TabFallback label="Loading the inbox settings" />}>
        <InboxSettingsBody />
      </Suspense>
    </>
  );
}

async function InboxSettingsBody() {
  const { workspace, role } = await getHubContext();
  const settings = InboxSettings.parse(workspace.inbox ?? {});
  const isOwner = role === "owner";
  // eslint-disable-next-line react-hooks/purity -- a server component renders once per request; "now" is the request time.
  const fresh = settings.lastSeenAt ? Date.now() - new Date(settings.lastSeenAt).getTime() < STALE_MS : false;
  const status = !settings.keyHash ? "Not connected: make a key first" : !settings.lastSeenAt ? "Waiting for the script's first check" : fresh ? `Connected · last check ${when(settings.lastSeenAt)}` : `Last heard from ${when(settings.lastSeenAt)}. Is the script still running?`;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <SectionCard title="Connect Gmail" id="setup" subtitle="The script runs in the sales inbox's own Google account. FlowHub never gets a Google password or token.">
        <ol className="flex list-decimal flex-col gap-4 py-4 pr-4 pl-9 text-sm">
          <li>
            <b>Copy FlowHub&apos;s script into the sales inbox&apos;s Google account.</b>
            <p className="text-muted-foreground">It opens in Apps Script. Gmail asks that account to allow it, once.</p>
            <a href={SCRIPT_URL} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-link hover:underline">
              Open the script and its setup steps ↗
            </a>
          </li>
          <li>
            <b>Paste this workspace key into the script.</b>
            <div className="mt-1.5">
              <KeyPanel hint={settings.keyHint} canEdit={isOwner} />
            </div>
            <p className="mt-1 text-muted-foreground">The key says which company the emails belong to. Anyone with it can send emails in, so keep it in the script only.</p>
          </li>
          <li>
            <b>Run &quot;start&quot; once in the script.</b>
            <p className="text-muted-foreground">It checks the inbox every minute, labels each email in Gmail, and adds the FlowHub panel beside an open email.</p>
          </li>
        </ol>
      </SectionCard>

      <WebsiteForm settings={settings} />

      <SectionCard title="How it reads" id="reading">
        <div className="flex flex-col gap-4 px-4 py-4 text-sm">
          <AutoIntakeSwitch on={settings.autoIntake} canEdit={isOwner} />
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            <dt className="text-muted-foreground">Mailbox</dt>
            <dd>{settings.mailbox ?? "Not reported yet"}</dd>
            <dt className="text-muted-foreground">Reads</dt>
            <dd>New inbox emails from outside the company</dd>
            <dt className="text-muted-foreground">Daily limit</dt>
            <dd>{INBOX_DAILY_LIMIT} emails, then it waits for tomorrow. Each counts as an AI run.</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className={fresh ? "font-semibold text-score-go" : "font-semibold text-attention"}>{status}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            A &quot;Not a lead&quot; keeps only the sender, subject, date and reason. The agents&apos; kill switch stops the inbox too. <Link href="/inbox" className="text-link hover:underline">Open the inbox</Link>
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

/**
 * PRD 7.30, FR-FORM-10: the website form. The same script creates a Google
 * Form and sends each answer in; once it reports the form's address, this card
 * shows a QR code to the website that embeds it, for a phone to scan.
 */
async function WebsiteForm({ settings }: { settings: InboxSettings }) {
  const link = formLink(settings);
  const svg = link ? await qrSvg(link) : null;
  return (
    <SectionCard title="Website form" id="website-form" subtitle="Answers to your website's Google Form land in the inbox too, read and checked like an email.">
      <div className="flex flex-col gap-4 px-4 py-4 text-sm sm:flex-row sm:items-start">
        {svg && link ? (
          <>
            {/* The SVG is drawn on the server by the qrcode library from an https address only. */}
            <div className="w-[180px] shrink-0 rounded-lg border-2 border-ink bg-white p-2 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`QR code for ${link}`} dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="flex min-w-0 flex-col gap-2">
              <p>Scan to open the form on a phone. A clear lead reaches Gate A in seconds.</p>
              <a href={link} target="_blank" rel="noopener noreferrer" className="break-all text-link hover:underline">
                {link} ↗
              </a>
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Last answer</dt>
                <dd>{settings.lastFormAt ? when(settings.lastFormAt) : "None yet"}</dd>
                {settings.formUrl && settings.siteUrl ? (
                  <>
                    <dt className="text-muted-foreground">Google Form</dt>
                    <dd>
                      <a href={settings.formUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                        Open the form itself ↗
                      </a>
                    </dd>
                  </>
                ) : null}
              </dl>
              <Link href="/form-qr" className="text-link hover:underline">
                Open a printable QR page
              </Link>
            </div>
          </>
        ) : (
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              In the same script, run <code>createLeadForm</code> once. It makes a Google Form in the sales inbox&apos;s account, with a box for each live offering, and starts sending its answers here.
            </li>
            <li>
              Embed the form on your website, and set the script property <code>SITE_URL</code> to the website&apos;s address.
            </li>
            <li>A QR code to the website shows here after the script&apos;s next check.</li>
          </ol>
        )}
      </div>
    </SectionCard>
  );
}

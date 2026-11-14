import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { TabFallback } from "@/components/flowhub/section-card";
import { Button } from "@/components/ui/button";
import { locateQuote } from "@/lib/inbox/triage";
import { CLEAR_LEAD, InboxItem, InboxSettings } from "@/lib/schema";
import { cn } from "cn";
import { db } from "@/server/firebase/admin";
import { getHubContext } from "@/server/workspace/access";
import { InboxAction } from "../inbox-buttons";
import { SOURCE_LABEL, VerdictPill, fullWhen } from "../shared";

export const metadata: Metadata = { title: "Inbox email" };

/** PRD 7.27, FR-INBOX-11: one email, with the quoted words highlighted, Gemini's reasons, what code worked out, the score and the actions. */
export default function InboxItemPage({ params }: PageProps<"/inbox/[id]">) {
  return (
    <Suspense fallback={<TabFallback label="Opening the email" />}>
      <ItemLoader params={params} />
    </Suspense>
  );
}

type Span = { start: number; end: number; n: number };

/** The text with each kept quote marked and numbered, as the reasons list numbers them. Overlapping quotes keep the first. */
function Highlighted({ text, spans }: { text: string; spans: Span[] }) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const span of sorted) {
    if (span.start < at) continue;
    if (span.start > at) parts.push(text.slice(at, span.start));
    parts.push(
      <mark key={span.n} className="rounded-sm border-b-2 border-primary bg-accent/60 px-px text-foreground">
        {text.slice(span.start, span.end)}
        <sup className="ml-0.5 text-[10px] font-bold text-accent-foreground">{span.n}</sup>
      </mark>,
    );
    at = span.end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

async function ItemLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace, role } = await getHubContext();
  const base = db().collection("workspaces").doc(workspace.id);
  const snap = /^[^/]{1,128}$/.test(id) ? await base.collection("inbox").doc(id).get() : null;
  const parsed = snap?.exists ? InboxItem.safeParse(snap.data()) : null;
  if (!parsed?.success) notFound();
  const item = parsed.data;
  const settings = InboxSettings.parse(workspace.inbox ?? {});
  const canEdit = role !== "viewer";

  const oppSnap = item.opportunityId ? await base.collection("opportunities").doc(item.opportunityId).get() : null;
  const dealGone = Boolean(oppSnap && (!oppSnap.exists || oppSnap.get("deletedAt")));
  const intakeState = oppSnap?.get("stages.intake.state") as string | undefined;

  const bodySpans: Span[] = [];
  const subjectSpans: Span[] = [];
  item.reasons.forEach((reason, index) => {
    const inBody = item.body ? locateQuote(item.body, reason.quote) : null;
    if (inBody) bodySpans.push({ ...inBody, n: index + 1 });
    else {
      const inSubject = locateQuote(item.subject, reason.quote);
      if (inSubject) subjectSpans.push({ ...inSubject, n: index + 1 });
    }
  });
  const gmailLink = `https://mail.google.com/mail/u/0/#all/${item.threadId}`;
  const fromForm = item.source === "form";
  const whyTitle = item.verdict === "lead" ? "Why it's a lead" : item.verdict === "maybe" ? "Why it's a maybe" : item.verdict === "existing_deal" ? "What the email says" : "Why it's not a lead";

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/inbox" className="text-link hover:underline">
          Inbox
        </Link>
        <span aria-hidden="true">/</span>
        <VerdictPill verdict={item.verdict} />
        <span>
          {SOURCE_LABEL[item.source]} · {fullWhen(item.receivedAt)}
        </span>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight">{item.subject ? <Highlighted text={item.subject} spans={subjectSpans} /> : "(no subject)"}</h1>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-label="The email" className="flex min-w-0 flex-col gap-3 rounded-xl border-[1.5px] bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <b>{item.from.name}</b> <span className="text-muted-foreground">&lt;{item.from.email}&gt;</span>
            </span>
            {fromForm ? (
              item.form?.website ? (
                <a href={item.form.website} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-link hover:underline">
                  Their website ↗
                </a>
              ) : null
            ) : (
              <a href={gmailLink} target="_blank" rel="noopener noreferrer" className="text-xs text-link hover:underline">
                Open in Gmail ↗
              </a>
            )}
          </div>
          {fromForm && item.form ? (
            <div className="flex flex-col gap-1.5 rounded-lg border-[1.5px] bg-muted/40 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>Services they ticked</b>
                <CalcMarker>Matched by code</CalcMarker>
              </div>
              {item.form.services.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {item.form.services.map((name) => (
                    <li key={name} className="rounded-full border-[1.5px] bg-card px-2 text-xs font-semibold">
                      {name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">None that match a live offering.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Each ticked box counts only if it names a live offering exactly.
                {item.form.servicesDropped ? ` ${item.form.servicesDropped} didn't, and ${item.form.servicesDropped === 1 ? "was" : "were"} dropped.` : ""}
              </p>
            </div>
          ) : null}
          {item.body ? (
            <div className="max-w-[65ch] text-[13.5px] leading-relaxed whitespace-pre-line">
              <Highlighted text={item.body} spans={bodySpans} />
            </div>
          ) : (
            <p className="fh-bubble fh-hand max-w-prose px-3 py-1 text-sm">
              {fromForm
                ? "FlowHub didn't keep this form answer, because it isn't a lead. Only the sender, date and reason are kept."
                : item.status === "reread"
                ? "Waiting for Gmail. Open this email in Gmail and choose Send to FlowHub now in the FlowHub panel. FlowHub reads it again, and won't file it as not a lead."
                : "FlowHub didn't keep this email's text, because it isn't a lead. Only the sender, subject, date and reason are kept."}
            </p>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-3">
          <section aria-labelledby="why" className="flex flex-col gap-2.5 rounded-xl border-2 border-ink bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="why" className="text-lg">
                {whyTitle}
              </h2>
              <AiMarker>Gemini</AiMarker>
            </div>
            <p className="text-sm">{item.summary}</p>
            {item.reasons.length ? (
              <ol className="flex flex-col gap-2">
                {item.reasons.map((reason, index) => (
                  <li key={index} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 text-sm">
                    <span aria-hidden="true" className="grid size-5 place-items-center rounded-full border-[1.5px] border-ink bg-primary text-[11px] font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span>{reason.text}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {fromForm ? "Each reason quotes what the person wrote in the form." : "Each reason quotes the email."} Code checks every quote word for word and drops a reason whose quote isn&apos;t there.
              {item.dropped ? ` It dropped ${item.dropped} here.` : ""}
            </p>
          </section>

          {item.verdict !== "not_a_lead" ? (
            <section aria-labelledby="code" className="flex flex-col gap-3 rounded-xl border-2 border-ink bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="code" className="text-lg">
                  What code worked out
                </h2>
                <CalcMarker>Calculated</CalcMarker>
              </div>
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Company</dt>
                <dd>{item.company.freeMail ? (item.company.name ? `${item.company.name}, as the email writes it (sent from a free mail address)` : "Company unknown: sent from a free mail address, and the email doesn't name one") : `${item.company.name} · ${item.company.domain}, from the sender's address${item.company.nameFromEmail ? "" : " (the email doesn't name it)"}`}</dd>
                <dt className="text-muted-foreground">Already a deal?</dt>
                <dd>{item.verdict === "existing_deal" ? `Yes: ${item.dealName ?? "an open deal"}` : "No"}</dd>
                <dt className="text-muted-foreground">Selling rules</dt>
                <dd>{item.rules.length ? item.rules.map((rule) => rule.reason).join(" ") : "None broken"}</dd>
                {item.partner ? (
                  <>
                    <dt className="text-muted-foreground">Partner</dt>
                    <dd>{item.partner}, in your hub</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Could need</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {item.matches.length
                    ? item.matches.map((match) => (
                        <Link key={`${match.offeringId}/${match.featureId ?? ""}`} href={`/offerings/${match.offeringId}`} className="rounded-lg border-[1.5px] border-ink bg-card px-2 py-px text-xs font-semibold text-foreground no-underline hover:bg-muted">
                          {match.label}
                        </Link>
                      ))
                    : "No live offering"}
                </dd>
              </dl>
              <table className="w-full border-collapse text-[13px] tabular-nums">
                <caption className="sr-only">Score breakdown</caption>
                <tbody>
                  {item.breakdown.map((row) => (
                    <tr key={row.label} className="border-b">
                      <td className="py-1">{row.label}</td>
                      <td className="py-1 text-right font-mono">+{row.points}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-1">Score</td>
                    <td className="py-1 text-right font-mono">{item.score}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">
                A clear lead scores {CLEAR_LEAD} or more, from a known company (its own address, or a company the email names), matching a live offering and breaking no selling rule. Gemini said &quot;{item.modelVerdict.replace(/_/g, " ")}&quot;; code only ever lowers that.
              </p>
            </section>
          ) : null}

          <Decision item={item} canEdit={canEdit} autoIntake={settings.autoIntake} dealGone={dealGone} intakeState={intakeState} />
        </div>
      </div>
    </>
  );
}

function Decision({ item, canEdit, autoIntake, dealGone, intakeState }: { item: InboxItem; canEdit: boolean; autoIntake: boolean; dealGone: boolean; intakeState?: string }) {
  const box = (tone: "go" | "attention" | "muted", title: string, text: React.ReactNode, actions?: React.ReactNode) => (
    <section aria-label="What happens next" className={cn("flex flex-col gap-2 rounded-xl border-2 border-ink p-4", tone === "go" ? "bg-score-go-soft" : tone === "attention" ? "bg-attention-soft" : "bg-card")}>
      <b className={cn(tone === "go" && "text-score-go", tone === "attention" && "text-attention")}>{title}</b>
      <div className="text-sm">{text}</div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
  const openDeal = item.opportunityId && !dealGone ? (
    <Button asChild>
      <Link href={`/opportunities/${item.opportunityId}`}>Open the deal</Link>
    </Button>
  ) : null;

  switch (item.status) {
    case "intake_started":
      return box(
        "go",
        dealGone ? "Its deal is in the recycle bin." : "Clear lead, so intake ran on its own.",
        dealGone ? "Restore it from Settings › Recycle bin." : `FlowHub created the opportunity and ${intakeState === "running" ? "is reading" : "read"} the email into requirements. Nothing goes further until a person approves Gate A.`,
        <>
          {openDeal}
          {canEdit && !dealGone ? <InboxAction itemId={item.id} action="dismiss" variant="outline" confirm="Mark this email as not a lead? Its deal moves to the recycle bin, and FlowHub removes the email's text." /> : null}
        </>,
      );
    case "waiting":
      return box(
        "attention",
        item.verdict === "lead" ? "A clear lead, waiting for you." : "A maybe: your call.",
        item.verdict === "lead" && !autoIntake ? "Automatic intake is off in Settings › Inbox, so a person opens the deal." : "Open a deal to start intake, which stops at Gate A. Or mark it as not a lead.",
        canEdit ? (
          <>
            <InboxAction itemId={item.id} action="open" />
            <InboxAction itemId={item.id} action="dismiss" variant="outline" />
          </>
        ) : null,
      );
    case "opened":
      return box("go", "Deal opened.", <PersonMarker name={item.decidedBy ?? "A person"}>opened it</PersonMarker>, openDeal);
    case "added_to_deal":
      return box("muted", `From a company that's already a deal: ${item.dealName ?? "open deal"}.`, "FlowHub added this email to that deal room instead of opening a new deal.", openDeal);
    // A form answer can't be sent again the way an email can, so it has no "This is a lead": the person writes to the sender instead.
    case "filed":
      return item.source === "form"
        ? box("muted", "Not a lead.", `FlowHub kept only the sender, date and reason. If it is a lead after all, write to ${item.from.email} or open a deal by hand.`)
        : box("muted", "Not a lead.", "FlowHub kept only the sender, subject, date and reason.", canEdit ? <InboxAction itemId={item.id} action="reread" variant="outline" /> : null);
    case "dismissed":
      return box("muted", "Not a lead.", <PersonMarker name={item.decidedBy ?? "A person"}>decided</PersonMarker>, canEdit && !item.opportunityId && item.source !== "form" ? <InboxAction itemId={item.id} action="reread" variant="outline" /> : null);
    case "reread":
      return box("attention", "Waiting for Gmail.", "Send it again from the FlowHub panel in Gmail. FlowHub reads it again, and it won't be filed as not a lead.");
  }
}

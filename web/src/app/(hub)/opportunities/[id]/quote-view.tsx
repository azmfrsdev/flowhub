"use client";

import { AlertTriangle, Check, ExternalLink, FileText, Lock, Send, ShieldCheck, Undo2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { LoadingChip } from "@/components/flowhub/loading";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { quoteTotals } from "@/lib/deal-room/quote";
import { driveTokenError, requestDriveToken } from "@/lib/firebase/drive-token";
import { formatAmount } from "@/lib/pricing/parse";
import type { Opportunity, Quote, QuoteLine, QuoteStatus, Run } from "@/lib/schema";
import { cn } from "cn";
import { Card } from "./gate-parts";
import { approve, createQuoteInDocs, requestChanges, saveQuoteEdits, sendForApproval, startQuote } from "./quote-actions";

/**
 * Step G, Quote (PRD 7.20, FR-QUO-1 to FR-QUO-7, ADR-0019). Lines come from
 * the approved pricing with prices copied by code; a person changes only
 * quantities, which lines are in, "On quote" prices and the discount. Totals
 * preview here, but the server works them out again on every save, and runs
 * the checks that gate Approve.
 */

export const QUOTE_STATUS: Record<QuoteStatus, string> = { draft: "Draft", sent: "Waiting for approval", approved: "Approved", changes_requested: "Changes asked for" };
const STATUS_CHIP: Record<QuoteStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-attention-soft text-attention",
  approved: "bg-fit-strong-soft text-fit-strong",
  changes_requested: "bg-fit-partial-soft text-fit-partial",
};

type Edit = Pick<QuoteLine, "include" | "quantity" | "personPrice">;

export function QuoteView({ opp, run, quotes, canEdit, isOwner }: { opp: Opportunity; run: Run; quotes: Quote[]; canEdit: boolean; isOwner: boolean }) {
  const mine = quotes.filter((quote) => quote.writeRunId === run.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = mine.find((quote) => quote.id === openId) ?? mine.at(-1) ?? null;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = () =>
    startTransition(async () => {
      const result = await startQuote(opp.id, run.id);
      setError(result.error ?? null);
      if (result.id) setOpenId(result.id);
    });

  if (!open)
    return (
      <Card title="Quote" marker={<CalcMarker>Prices and totals by code</CalcMarker>}>
        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          <p className="text-muted-foreground">
            Turn the approved pricing into a quote for {opp.prospect?.name ?? "the client"}: every price copied from your Pricing tab, totals, discount and tax worked out by code, then sent for approval. Once approved, create it in Google Docs with a PDF beside it. FlowHub never sends it.
          </p>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={pending} onClick={start}>
                <FileText aria-hidden="true" />
                {pending ? "Starting the quote…" : "Start a quote"}
              </Button>
              <span className="text-xs text-muted-foreground">Uses one of today&apos;s AI runs, for the line descriptions.</span>
            </div>
          ) : (
            <p className="text-muted-foreground">An editor can start a quote.</p>
          )}
          {pending ? <LoadingChip label="Copying prices and describing each line" /> : null}
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      <QuoteEditor key={`${open.id}:${open.rev}`} opp={opp} run={run} quote={open} canEdit={canEdit} isOwner={isOwner} />
      {mine.length > 1 || canEdit ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {mine.length > 1 ? "Quotes for this proposal:" : null}
          {mine.length > 1
            ? [...mine].reverse().map((quote) => (
                <button key={quote.id} type="button" onClick={() => setOpenId(quote.id)} className={cn("rounded-full border px-2 py-0.5 hover:bg-muted", quote.id === open.id && "border-ink font-semibold text-foreground")}>
                  {quote.number} · {QUOTE_STATUS[quote.status]}
                </button>
              ))
            : null}
          {canEdit ? (
            <button type="button" onClick={start} disabled={pending} className="text-link underline-offset-2 hover:underline">
              {pending ? "Starting…" : "Start another quote"}
            </button>
          ) : null}
          {error ? <span className="text-destructive">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function QuoteEditor({ opp, run, quote, canEdit, isOwner }: { opp: Opportunity; run: Run; quote: Quote; canEdit: boolean; isOwner: boolean }) {
  const editable = canEdit && (quote.status === "draft" || quote.status === "changes_requested");
  const [edits, setEdits] = useState<Record<string, Edit>>(() => Object.fromEntries(quote.lines.map((line) => [line.id, { include: line.include, quantity: line.quantity, personPrice: line.personPrice }])));
  const [discount, setDiscount] = useState(String(quote.discountPercent));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const currency = quote.totals.currency;
  const money = (n: number) => formatAmount(n, currency);

  const lines: QuoteLine[] = useMemo(() => quote.lines.map((line) => ({ ...line, ...edits[line.id], personPriceBy: edits[line.id]?.personPrice ? (line.personPriceBy ?? "you") : null })), [quote.lines, edits]);
  const discountNumber = Math.max(0, Math.min(100, Number(discount) || 0));
  const dirty = discountNumber !== quote.discountPercent || quote.lines.some((line) => {
    const edit = edits[line.id]!;
    return edit.include !== line.include || edit.quantity !== line.quantity || (edit.personPrice ?? null) !== (line.personPrice ?? null);
  });
  // A preview only: the server works the totals out again on save.
  const totals = useMemo(() => quoteTotals(lines, discountNumber, quote.tax.rate, currency), [lines, discountNumber, quote.tax.rate, currency]);
  const amounts = new Map(totals.lines.map((item) => [item.lineId, item]));
  const failing = quote.checks.filter((check) => check.state === "fail");
  const stale = quote.writeRev !== run.rev;

  const run_ = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.error ?? null);
    });
  const save = () =>
    run_(() =>
      saveQuoteEdits(opp.id, quote.id, {
        rev: quote.rev,
        discountPercent: discountNumber,
        lines: quote.lines.map((line) => ({ id: line.id, include: edits[line.id]!.include, quantity: edits[line.id]!.quantity, personPrice: edits[line.id]!.personPrice?.trim() || null })),
      }),
    );
  const createDoc = () =>
    startTransition(async () => {
      let token: string;
      try {
        token = await requestDriveToken();
      } catch (err) {
        setError(driveTokenError(err, "FlowHub couldn't get Google's permission. Try again."));
        return;
      }
      const result = await createQuoteInDocs(opp.id, quote.id, token);
      setError(result.error ?? null);
    });
  const set = (id: string, change: Partial<Edit>) => setEdits((current) => ({ ...current, [id]: { ...current[id]!, ...change } }));

  return (
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_21rem]">
      <Card
        title={`Quote ${quote.number}`}
        marker={
          <>
            <span className={cn("rounded-full px-2 text-xs font-semibold", STATUS_CHIP[quote.status])}>{QUOTE_STATUS[quote.status]}</span>
            <CalcMarker>Prices and totals by code</CalcMarker>
            <AiMarker>Line descriptions</AiMarker>
          </>
        }
        action={!editable ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock aria-hidden="true" className="size-3.5" />Locked</span> : null}
      >
        {stale ? (
          <p className="flex items-center gap-2 border-b bg-attention-soft/30 px-5 py-2 text-xs">
            <AlertTriangle aria-hidden="true" className="size-3.5 text-attention" />
            The proposal changed after this quote was made. Start another quote to match it.
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                <th className="w-8 px-3 py-2"><span className="sr-only">On the quote</span></th>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Unit price</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const amount = amounts.get(line.id);
                return (
                  <tr key={line.id} className={cn("border-b border-line-soft align-top", !line.include && "opacity-45")}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" aria-label={`Include ${line.label}`} className="accent-ink" checked={line.include} disabled={!editable} onChange={(event) => set(line.id, { include: event.target.checked })} />
                    </td>
                    <td className="px-2 py-2.5">
                      <b>{line.label}</b>
                      {line.scope !== line.label ? <p className="text-xs text-muted-foreground">{line.scope}</p> : null}
                      {line.basis === "recurring" ? <span className="text-[11px] text-muted-foreground">Recurring, billed apart from the total</span> : null}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {line.quantity === null ? (
                        "1"
                      ) : editable ? (
                        <input
                          type="number"
                          min={1}
                          aria-label={`Quantity for ${line.label}`}
                          value={line.quantity}
                          onChange={(event) => set(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                          className="w-20 rounded-md border-2 border-ink bg-card px-1.5 py-0.5 text-right"
                        />
                      ) : (
                        line.quantity
                      )}
                      {line.quantity !== null && line.quantityFrom === "fit" ? <p className="text-[10px] text-muted-foreground">from the fit map</p> : null}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {line.unpriced ? (
                        editable ? (
                          <span className="flex flex-col items-end gap-0.5">
                            <input
                              aria-label={`Price for ${line.label}`}
                              value={line.personPrice ?? ""}
                              placeholder={currency === "MYR" ? "RM 12,000" : `${currency} 12,000`}
                              onChange={(event) => set(line.id, { personPrice: event.target.value })}
                              className="w-32 rounded-md border-2 border-ink bg-card px-1.5 py-0.5 text-right"
                            />
                            <span className="text-[10px] text-muted-foreground">On quote: you enter it</span>
                          </span>
                        ) : line.personPrice ? (
                          <span className="flex flex-col items-end gap-0.5">
                            {line.personPrice}
                            <PersonMarker name={line.personPriceBy ?? "A person"} />
                          </span>
                        ) : (
                          "On quote"
                        )
                      ) : (
                        <span className="font-mono text-xs">{line.valueText}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {amount?.amount === null || amount?.amount === undefined ? (
                        <span className="text-xs text-destructive">{amount?.text ?? ""}</span>
                      ) : amount.amount === 0 ? (
                        amount.text
                      ) : (
                        <span title={amount.text}>
                          {money(amount.amount)}
                          {amount.recurring ? ` / ${amount.recurring}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-end gap-1 px-5 py-4 text-sm tabular-nums">
          <Row label="Subtotal" value={money(totals.subtotal)} />
          <Row
            label={
              editable ? (
                <span className="flex items-center gap-1.5">
                  Discount
                  <input type="number" min={0} max={100} step={0.5} aria-label="Discount percent" value={discount} onChange={(event) => setDiscount(event.target.value)} className="w-16 rounded-md border-2 border-ink bg-card px-1.5 py-0.5 text-right" />%
                </span>
              ) : (
                `Discount ${quote.discountPercent}%`
              )
            }
            value={`− ${money(totals.discount)}`}
          />
          {quote.tax.rate ? <Row label={`${quote.tax.label} ${quote.tax.rate}%`} value={money(totals.tax)} /> : null}
          <Row label={<b className="fh-hand text-xl">Total</b>} value={<b className="fh-hand text-2xl">{money(totals.total)}</b>} />
          {totals.recurring.map((item) => (
            <p key={item.period} className="text-xs text-muted-foreground">
              Plus {money(item.amount)} per {item.period}, before {quote.tax.label || "tax"}, billed apart.
            </p>
          ))}
          <CalcMarker>Worked out by code</CalcMarker>
        </div>
        {editable ? (
          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
            <Button type="button" variant={dirty ? "default" : "outline"} disabled={pending || !dirty} onClick={save}>
              {pending && dirty ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
            {dirty ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => {
                  setEdits(Object.fromEntries(quote.lines.map((line) => [line.id, { include: line.include, quantity: line.quantity, personPrice: line.personPrice }])));
                  setDiscount(String(quote.discountPercent));
                }}>
                <Undo2 aria-hidden="true" />
                Undo
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">{dirty ? "Save to run the checks again." : "A copied price can't be typed over. Change it on the Pricing tab, then start another quote."}</span>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-col gap-4">
        <Card title="Checks before approval" marker={<CalcMarker>Run by code</CalcMarker>}>
          <ul className="flex flex-col gap-2.5 px-4 py-3 text-sm">
            {quote.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2">
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", check.state === "pass" ? "border-fit-strong bg-fit-strong-soft text-fit-strong" : "border-destructive bg-destructive/10 text-destructive")}>
                  {check.state === "pass" ? <Check aria-hidden="true" className="size-3" /> : <X aria-hidden="true" className="size-3" />}
                </span>
                <span>
                  <b>{check.label}</b>
                  <br />
                  <span className="text-xs text-muted-foreground">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {dirty ? <p className="border-t px-4 py-2 text-xs text-attention">You have unsaved changes. These checks are from the last save.</p> : null}
        </Card>

        <Card title={quote.status === "approved" ? "Approved" : quote.status === "sent" ? "Approval" : "Send for approval"} marker={quote.status === "sent" ? <span className="rounded-full border px-2 py-px text-xs font-semibold">Waiting for the Owner</span> : null}>
          <div className="flex flex-col gap-3 px-4 py-3 text-sm">
            {quote.status === "draft" || quote.status === "changes_requested" ? (
              <>
                {quote.status === "changes_requested" ? (
                  <p className="rounded-lg border border-fit-partial/40 bg-fit-partial-soft/40 px-3 py-2">
                    <b>Changes asked for:</b> {quote.history.findLast((item) => item.action === "changes_requested")?.note}
                  </p>
                ) : null}
                <p className="text-muted-foreground">The Owner approves quotes. Once sent, the quote is locked until it&apos;s approved or sent back.</p>
                {canEdit ? (
                  <Button type="button" disabled={pending || dirty || failing.length > 0} onClick={() => run_(() => sendForApproval(opp.id, quote.id))}>
                    <Send aria-hidden="true" />
                    Send for approval
                  </Button>
                ) : null}
                {failing.length && !dirty ? <p className="text-xs text-destructive">Fix the checks marked ✗ first.</p> : null}
              </>
            ) : quote.status === "sent" ? (
              isOwner ? (
                <>
                  <p className="text-muted-foreground">
                    Sent by {quote.history.findLast((item) => item.action === "sent")?.by}. Total {money(quote.totals.total)}
                    {quote.totals.recurring.map((item) => ` + ${money(item.amount)} / ${item.period}`).join("")}. Approve stays off until every check passes; the server checks again when you click.
                  </p>
                  <Button type="button" disabled={pending || failing.length > 0} onClick={() => run_(() => approve(opp.id, quote.id))}>
                    <ShieldCheck aria-hidden="true" />
                    Approve
                  </Button>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold">Or send it back with a note</span>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="What should change?" className="rounded-lg border border-input bg-card px-3 py-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
                  </label>
                  <Button type="button" variant="outline" disabled={pending || note.trim().length < 3} onClick={() => run_(() => requestChanges(opp.id, quote.id, note))}>
                    Request changes
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">Waiting for the Owner to approve it.</p>
              )
            ) : (
              <>
                <p className="flex items-center gap-2">
                  <span className="fh-hand -rotate-3 rounded-lg border-[2.5px] border-fit-strong px-2.5 py-0.5 text-lg text-fit-strong">Approved · {quote.approvedBy}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {quote.approvedBy === quote.createdBy ? `Built and approved by ${quote.approvedBy}: one person per workspace for now.` : `Built by ${quote.createdBy}, approved by ${quote.approvedBy}.`}
                </p>
                {quote.doc ? (
                  <div className="flex flex-wrap gap-2">
                    <a href={quote.doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-primary px-3 py-1 text-xs font-semibold shadow-comic-sm">
                      Open in Google Docs <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                    {quote.doc.pdfUrl ? (
                      <a href={quote.doc.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-card px-3 py-1 text-xs font-semibold shadow-comic-sm">
                        PDF <ExternalLink aria-hidden="true" className="size-3" />
                      </a>
                    ) : null}
                  </div>
                ) : canEdit ? (
                  <Button type="button" disabled={pending} onClick={createDoc}>
                    <FileText aria-hidden="true" />
                    {pending ? "Creating…" : "Create in Google Docs"}
                  </Button>
                ) : null}
                <p className="text-xs text-muted-foreground">FlowHub never sends the quote. Share it from your Drive.</p>
              </>
            )}
            {pending ? <LoadingChip label="Working" /> : null}
            {error ? <p className="text-destructive">{error}</p> : null}
          </div>
          {quote.history.length ? (
            <ol className="flex flex-col gap-1 border-t px-4 py-3 text-xs text-muted-foreground">
              {quote.history.map((item, index) => (
                <li key={index}>
                  <b className="text-foreground">{item.by}</b> {HISTORY[item.action]} · {new Date(item.at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  {item.note ? <span>: &ldquo;{item.note}&rdquo;</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

const HISTORY: Record<Quote["history"][number]["action"], string> = {
  created: "started the quote",
  edited: "edited it",
  sent: "sent it for approval",
  approved: "approved it",
  changes_requested: "asked for changes",
  doc_created: "created it in Google Docs",
};

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="grid w-full max-w-sm grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
      <span className="text-right text-muted-foreground">{label}</span>
      <span className="min-w-28 text-right">{value}</span>
    </div>
  );
}

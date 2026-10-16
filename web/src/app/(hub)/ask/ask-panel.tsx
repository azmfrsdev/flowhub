"use client";

import { FileText, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { useLiveCollection, useLiveDoc } from "@/lib/firebase/live";
import type { Answer, DocumentRecord, Proposal } from "@/lib/schema";
import { cn } from "cn";
import { retryDocumentAction } from "./actions";
import { AnswerCard } from "./answer-card";
import { useAsk } from "./ask-context";
import { ProposalCard } from "./proposal-card";

export type OfferingName = { id: string; name: string };

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
const SHOWN = 15;

/** The Ask or tell panel (FR-ASK-1, mockups V2-Tell-price and V2-Tell-opportunity). */
export function AskPanel({ workspaceId, offerings, canEdit, userName }: { workspaceId: string; offerings: OfferingName[]; canEdit: boolean; userName: string }) {
  const { open, close, pending, settle, send, sendFile, focus } = useAsk();
  const pathname = usePathname();
  const routeOffering = /^\/offerings\/([^/]+)/.exec(pathname)?.[1];
  const scope = offerings.find((offering) => offering.id === routeOffering);
  const [unscopedOn, setUnscopedOn] = useState<string | null>(null);
  const scoped = scope && unscopedOn !== scope.id ? scope : undefined;
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const proposals = useLiveCollection<Proposal>(open ? `workspaces/${workspaceId}/proposals` : null, "createdAt", SHOWN);
  const answers = useLiveCollection<Answer>(open ? `workspaces/${workspaceId}/answers` : null, "createdAt", SHOWN);
  const entries = useMemo(
    () =>
      [...proposals.map((item) => ({ kind: "proposal" as const, at: item.createdAt, item })), ...answers.map((item) => ({ kind: "answer" as const, at: item.createdAt, item }))]
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-SHOWN),
    [proposals, answers],
  );
  const names = useMemo(() => new Map(offerings.map((offering) => [offering.id, offering.name])), [offerings]);
  // A file's status comes from its document; its proposal arrives once it's read (FR-ING-3).
  const pendingDoc = useLiveDoc<DocumentRecord>(pending?.kind === "document" && pending.id ? `workspaces/${workspaceId}/documents/${pending.id}` : null, null).data;
  const resultId = pending?.kind === "document" ? pendingDoc?.proposalId : pending?.id;
  // The message stays on screen as "reading" until its result arrives through the listener.
  const arrived = Boolean(resultId && entries.some((entry) => entry.item.id === resultId));
  const failed = pending?.error ?? (pendingDoc?.status === "failed" ? (pendingDoc.error ?? "FlowHub couldn't read this file.") : undefined);
  const reading = pending && !failed && !arrived;

  useEffect(() => {
    if (arrived) settle();
  }, [arrived, settle]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  // A proposal opened from Home or a record is scrolled to once; after that, new messages scroll to the bottom.
  const shownFocus = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const target = focus && shownFocus.current !== focus.nonce ? document.getElementById(`proposal-${focus.proposalId}`) : null;
    if (target && focus) {
      shownFocus.current = focus.nonce;
      target.scrollIntoView({ block: "center" });
    } else list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, entries.length, reading, focus]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const submit = async () => {
    const message = text.trim();
    if (!message || reading) return;
    setText("");
    const ok = await send(message, scoped?.id);
    if (!ok) setText(message);
  };
  // FR-ASK-1: a PDF, picked or dropped, goes with whatever is typed in the box.
  const attach = async (file: File | undefined) => {
    if (!file || reading) return;
    const message = text.trim();
    setText("");
    const ok = await sendFile(file, message, scoped?.id);
    if (!ok) setText(message);
  };

  return (
    <aside
      aria-label="Ask or tell FlowHub"
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l bg-card shadow-[-12px_0_32px_color-mix(in_oklch,var(--foreground)_10%,transparent)]",
        dragging && "ring-3 ring-ai/50 ring-inset",
      )}
      onDragOver={(event) => {
        if (!canEdit || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        setDragging(false);
        void attach(event.dataTransfer.files[0]);
      }}
    >
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <AiMarker>
            <span className="text-[13px]">Ask or tell FlowHub</span>
          </AiMarker>
          {scoped ? (
            <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
              about <b className="truncate text-foreground">{scoped.name}</b>
              <button type="button" onClick={() => setUnscopedOn(scoped.id)} className="rounded px-1 text-xs text-primary hover:underline">
                Ask about everything
              </button>
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground">Tell it what changed, or ask about what you sell.</span>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close Ask or tell">
          <X aria-hidden="true" />
        </Button>
      </div>

      <div ref={list} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {entries.length === 0 && !pending ? <Intro /> : null}
        {entries.map((entry) => (
          <div key={entry.item.id} className="flex flex-col gap-2">
            <YouSaid
              text={entry.kind === "proposal" ? (entry.item.input.text ?? "") : entry.item.question}
              fileName={entry.kind === "proposal" ? entry.item.input.fileName : undefined}
              at={entry.at}
              name={entry.item.createdBy}
            />
            {entry.kind === "proposal" ? (
              <ProposalCard proposal={entry.item} names={names} canEdit={canEdit} highlight={focus?.proposalId === entry.item.id} />
            ) : (
              <AnswerCard answer={entry.item} />
            )}
          </div>
        ))}
        {pending && !arrived ? (
          <div className="flex flex-col gap-2">
            <YouSaid text={pending.text} fileName={pending.fileName} at={null} name={userName} />
            {failed ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <span className="flex-1">{failed}</span>
                {pendingDoc?.status === "failed" && pending.id ? <RetryRead documentId={pending.id} /> : null}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin text-ai" />
                {!pending.fileName
                  ? "FlowHub is reading your message against your records…"
                  : !pending.id
                    ? "Uploading the file…"
                    : pendingDoc?.status === "reading"
                      ? "Reading the PDF against your records. A long file takes up to a minute…"
                      : "Uploaded. FlowHub starts reading it in a moment…"}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-2 border-t px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border bg-muted/40 py-1.5 pr-1.5 pl-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <label htmlFor="ask-input" className="sr-only">
            Message to FlowHub
          </label>
          <textarea
            id="ask-input"
            ref={input}
            rows={2}
            maxLength={4000}
            value={text}
            disabled={!canEdit}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={canEdit ? "Ask, or type what changed" : "Viewers can read the hub but not ask or tell."}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <input
            ref={picker}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void attach(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button type="button" variant="ghost" size="icon" disabled={!canEdit || Boolean(reading)} title="Add a PDF (up to 20 MB)" aria-label="Add a PDF" onClick={() => picker.current?.click()}>
            <Paperclip aria-hidden="true" />
          </Button>
          <Button type="submit" size="icon" disabled={!canEdit || !text.trim() || Boolean(reading)} aria-label="Send">
            <SendHorizontal aria-hidden="true" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Type, or drop a PDF here. Cost and margin are never shown here or sent to the model. Nothing changes until you apply it.</p>
      </form>
    </aside>
  );
}

function RetryRead({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await retryDocumentAction(documentId);
          setBusy(false);
          if (!result.ok) setError(result.error);
        }}
      >
        {busy ? "Retrying…" : "Retry"}
      </Button>
      {error ? <span className="basis-full text-xs">{error}</span> : null}
    </>
  );
}

function YouSaid({ text, fileName, at, name }: { text: string; fileName?: string; at: string | null; name: string }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">
          You{at ? ` · ${time.format(new Date(at))}` : ""}
        </span>
        {fileName ? (
          <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-md border bg-background px-2 py-1 text-sm">
            <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="truncate">{fileName}</span>
          </span>
        ) : null}
        {text ? <p className="text-sm break-words whitespace-pre-wrap">{text}</p> : null}
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      <p>FlowHub only proposes. It matches what you write against your own offerings and records, and every change says exactly where it will go.</p>
      <p>Try &ldquo;From 1 November our Growth landing zone goes up to RM 19,500&rdquo;, or &ldquo;What&apos;s our Growth price for 80 VMs?&rdquo;</p>
    </div>
  );
}

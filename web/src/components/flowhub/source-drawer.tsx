"use client";

import { ExternalLink, FileText, MessageSquare, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type SourceDrawerProps = {
  label: string;
  quote?: string;
  locator: { page?: number; slide?: number; sheet?: string; range?: string };
  /** Told to FlowHub in a message, rather than read from a document. */
  fromMessage: boolean;
  /** The document a fact was read from, when it's still in the hub. */
  doc: { id: string; name: string; kind: string; pages?: number; hasFile: boolean; uploadedBy: string; uploadedAt: string; scanned?: boolean } | null;
};

const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));

/**
 * S13, FR-OG-9: a source chip opens a side drawer with the quoted text and,
 * for an uploaded PDF, the page it came from. A native dialog keeps focus
 * inside and closes on Escape.
 */
export function SourceDrawerChip({ label, quote, locator, fromMessage, doc }: SourceDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const Icon = fromMessage ? MessageSquare : FileText;
  const where = locator.page ? `Page ${locator.page}${doc?.pages ? ` of ${doc.pages}` : ""}` : locator.slide ? `Slide ${locator.slide}` : locator.sheet ? `${locator.sheet}${locator.range ? `, ${locator.range}` : ""}` : null;
  const fileUrl = doc?.hasFile ? `/api/documents/${encodeURIComponent(doc.id)}${locator.page ? `#page=${locator.page}` : ""}` : null;

  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={show}
        title={quote ? `"${quote}"` : undefined}
        aria-haspopup="dialog"
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-card px-1.5 py-px text-xs whitespace-nowrap hover:border-ink/50 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:outline-none"
      >
        <Icon aria-hidden="true" className="size-3 text-link" />
        {label}
        <span className="sr-only">: open the source</span>
      </button>
      <dialog
        ref={dialog}
        aria-label={`Source: ${label}`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-2xl border-l bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40"
      >
        {open ? (
          <div className="flex h-full flex-col">
            <header className="flex items-start gap-3 border-b px-5 py-4">
              <Icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-link" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold">{doc ? doc.name : fromMessage ? "A message told to FlowHub" : label}</h2>
                <p className="text-sm text-muted-foreground">
                  {[doc?.kind, where, doc ? `uploaded by ${doc.uploadedBy}, ${dateLabel(doc.uploadedAt)}` : null, doc?.scanned ? "scanned: read from the page images" : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close the source">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4">
              <figure className="flex flex-col gap-1.5">
                <figcaption className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What FlowHub read{where ? ` on ${where.toLowerCase()}` : ""}</figcaption>
                {quote ? (
                  <blockquote className="rounded-lg border-l-4 border-attention bg-muted/50 px-4 py-3 text-sm">
                    <mark className="bg-attention-soft text-foreground">{quote}</mark>
                  </blockquote>
                ) : (
                  <p className="text-sm text-muted-foreground">No quote was kept for this fact.</p>
                )}
              </figure>
              {fileUrl ? (
                <>
                  <iframe title={`${doc?.name}${where ? `, ${where}` : ""}`} src={fileUrl} className="min-h-0 w-full flex-1 rounded-lg border bg-muted" />
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start text-sm text-link hover:underline">
                    Open the PDF{where ? ` at ${where.toLowerCase()}` : ""} <ExternalLink aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </>
              ) : fromMessage ? (
                <p className="text-sm text-muted-foreground">Someone told FlowHub this in plain language, and a person applied it.</p>
              ) : doc ? (
                <p className="text-sm text-muted-foreground">The sample data keeps each document&apos;s name, pages and quotes, not the file itself. Files you upload open here at the cited page.</p>
              ) : (
                <p className="text-sm text-muted-foreground">This document is no longer in the hub.</p>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

"use client";

import { Loader2, RotateCw, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { AiMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { useLiveDoc } from "@/lib/firebase/live";
import type { DocumentRecord } from "@/lib/schema";
import { cn } from "cn";
import { retryDocumentAction } from "../../../ask/actions";
import { OpenAskButton, useAsk } from "../../../ask/ask-context";

/**
 * FR-ING-1 (PDF only, as changed in PRD 7.0): drop a file on an offering's
 * Sales material tab. It's filed here at once, read in the background, and
 * its proposed changes open in Ask or tell.
 */
export function FileDrop({ offeringId, canEdit }: { offeringId: string; canEdit: boolean }) {
  const { sendFile, pending } = useAsk();
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = Boolean(pending?.fileName && !pending.id && !pending.error);
  const attach = (file: File | undefined) => {
    if (file && canEdit && !busy) void sendFile(file, "", offeringId);
  };
  return (
    <div
      className={cn("flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed bg-card px-5 py-4", dragging && "border-ai bg-ai-soft/40")}
      onDragOver={(event) => {
        if (!canEdit || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        attach(event.dataTransfer.files[0]);
      }}
    >
      <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <b>Drop a brochure, deck or case study</b>
        <span className="text-sm text-muted-foreground">
          A PDF up to 20 MB. FlowHub files it here, reads it, and proposes updates to this offering&apos;s tabs. Nothing changes until you apply them.
        </span>
      </div>
      <input
        ref={picker}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          attach(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <Button variant="outline" disabled={!canEdit || busy} onClick={() => picker.current?.click()}>
        {busy ? "Uploading…" : "Choose a PDF"}
      </Button>
    </div>
  );
}

/** FR-ING-3: a file's state, live, with Retry when it couldn't be read. Never silent. */
export function DocumentStatus({ doc, canEdit }: { doc: DocumentRecord; canEdit: boolean }) {
  const live = useLiveDoc<DocumentRecord>(`workspaces/${doc.workspaceId}/documents/${doc.id}`, doc).data ?? doc;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  switch (live.status) {
    case "uploaded":
    case "reading":
      return (
        <AiMarker waiting>
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          {live.status === "reading" ? "Reading" : "Waiting to be read"}
        </AiMarker>
      );
    case "ready_to_review":
      return live.proposalId ? (
        <OpenAskButton proposalId={live.proposalId} className="hover:opacity-80">
          <AiMarker waiting>Changes waiting for you · Review</AiMarker>
        </OpenAskButton>
      ) : null;
    case "applied":
      return <AiMarker>Read, updates applied</AiMarker>;
    case "no_changes":
      return <span className="rounded-full border px-2 py-px text-xs font-semibold text-muted-foreground">Read, nothing changed</span>;
    case "failed":
      return (
        <span className="flex flex-wrap items-center gap-2 text-xs text-destructive">
          Couldn&apos;t read it: {live.error ?? "unknown error"}
          {canEdit ? (
            <button
              type="button"
              disabled={pending}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              onClick={() =>
                startTransition(async () => {
                  const result = await retryDocumentAction(live.id);
                  setError(result.ok ? null : result.error);
                })
              }
            >
              <RotateCw aria-hidden="true" className="size-3" />
              {pending ? "Retrying…" : "Retry"}
            </button>
          ) : null}
          {error ? <span className="basis-full">{error}</span> : null}
        </span>
      );
  }
}

"use client";

import { Paperclip } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { AiMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { useAsk } from "./ask-context";

const EXAMPLES = [
  "Met Farah Hanim, Head of Operations at Anjung Serai Living today. They run 42 furniture stores and want one view of store and online sales. Meeting again Thursday at 10am.",
  "From 1 November our Growth landing zone goes up to RM 19,500.",
  "What's our Growth price for 80 VMs?",
  "Which results can we cite for retail?",
];
const SHORT = ["I met Anjung Serai Living today…", "Growth landing zone goes up to RM 19,500", "What's our Growth price for 80 VMs?", "Which results can we cite for retail?"];

/** Ask or tell on Home (FR-ASK-1, v2 canvas "V2-Home"). Sending opens the panel, where the answer or proposal appears. */
export function TellBox({ canEdit }: { canEdit: boolean }) {
  const { send, sendFile, pending } = useAsk();
  const [text, setText] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // The box grows with what's typed (up to its max height), so a long message stays readable.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);
  const busy = Boolean(pending && !pending.id && !pending.error);
  const submit = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    if (!(await send(message))) setText(message);
  };
  const attach = async (file: File | undefined) => {
    if (!file || busy) return;
    const message = text.trim();
    setText("");
    if (!(await sendFile(file, message))) setText(message);
  };
  return (
    <section aria-labelledby="tell" className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-ai/35 bg-card px-4.5 py-4 shadow-[0_10px_28px_color-mix(in_oklch,var(--ai)_8%,transparent)]">
      <div className="flex flex-wrap items-center gap-2.5">
        <AiMarker>
          <span id="tell">Ask or tell FlowHub</span>
        </AiMarker>
        <span className="text-sm text-muted-foreground">Tell it what changed and it proposes the update in the right tab. Ask it anything about what you sell.</span>
      </div>
      <form
        className="flex min-h-13 items-end gap-2.5 rounded-xl border bg-muted/40 py-2 pr-2 pl-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="tell-input" className="sr-only">
          Message to FlowHub
        </label>
        <textarea
          id="tell-input"
          ref={box}
          rows={1}
          value={text}
          maxLength={4000}
          disabled={!canEdit}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={canEdit ? "We met a new client today who's interested in…" : "Viewers can read the hub but not ask or tell."}
          className="max-h-48 min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
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
        <Button type="button" variant="ghost" size="icon" disabled={!canEdit || busy} title="Add a PDF (up to 20 MB)" aria-label="Add a PDF" onClick={() => picker.current?.click()}>
          <Paperclip aria-hidden="true" />
        </Button>
        <Button type="submit" size="sm" disabled={!canEdit || !text.trim() || busy}>
          {busy ? "Reading…" : "Send"}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example, index) => (
          <button
            key={example}
            type="button"
            disabled={!canEdit}
            onClick={() => setText(example)}
            className="rounded-full border bg-card px-3 py-1 text-[12.5px] hover:border-ai/40 hover:bg-ai-soft/40 disabled:cursor-not-allowed"
          >
            {SHORT[index]}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Enter sends, Shift+Enter adds a line. Nothing changes until a person applies it, and every change remembers where it came from. Press Ctrl+J anywhere to open this.</p>
    </section>
  );
}

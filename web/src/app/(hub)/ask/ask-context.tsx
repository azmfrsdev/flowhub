"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import { sendMessage, uploadFile } from "./actions";

/**
 * Ask or tell is one panel for the whole hub (FR-ASK-1). This holds whether
 * it's open, the message being read, and which proposal to show, so the top
 * bar, Home, an offering page or a highlighted price can all open it.
 */

/** A message or file being read. For a file, `id` is the document's, and its proposal arrives once it's read. */
type Pending = { text: string; fileName?: string; id?: string; kind?: "proposal" | "answer" | "document"; error?: string };
type Focus = { proposalId: string; nonce: number };

type AskState = {
  open: boolean;
  pending: Pending | null;
  focus: Focus | null;
  openAsk: (options?: { proposalId?: string }) => void;
  close: () => void;
  send: (text: string, scopeOfferingId?: string) => Promise<boolean>;
  sendFile: (file: File, text: string, scopeOfferingId?: string) => Promise<boolean>;
  settle: () => void;
};

const AskContext = createContext<AskState | null>(null);

export function useAsk(): AskState {
  const value = useContext(AskContext);
  if (!value) throw new Error("useAsk must be used inside AskShell.");
  return value;
}

/** The hub's outer frame. With the panel open on a wide screen, the page makes room for it rather than hiding under it. */
export function AskShell({ className, children }: { className: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);

  const openAsk = useCallback((options?: { proposalId?: string }) => {
    setOpen(true);
    if (options?.proposalId) setFocus({ proposalId: options.proposalId, nonce: Date.now() });
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const settle = useCallback(() => setPending(null), []);
  const send = useCallback(async (text: string, scopeOfferingId?: string) => {
    setOpen(true);
    setPending({ text });
    const result = await sendMessage(text, scopeOfferingId);
    if (!result.ok) {
      setPending({ text, error: result.error });
      return false;
    }
    setPending({ text, id: result.id, kind: result.kind });
    return true;
  }, []);
  const sendFile = useCallback(async (file: File, text: string, scopeOfferingId?: string) => {
    setOpen(true);
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setPending({ text, fileName: file.name, error: "FlowHub reads PDF files for now. Save it as a PDF and try again." });
      return false;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPending({ text, fileName: file.name, error: "Files can be up to 20 MB." });
      return false;
    }
    setPending({ text, fileName: file.name });
    const form = new FormData();
    form.set("file", file);
    form.set("message", text);
    if (scopeOfferingId) form.set("scopeOfferingId", scopeOfferingId);
    const result = await uploadFile(form);
    if (!result.ok) {
      setPending({ text, fileName: file.name, error: result.error });
      return false;
    }
    setPending({ text, fileName: file.name, id: result.id, kind: "document" });
    return true;
  }, []);

  // Ctrl+J (Cmd+J on a Mac) opens and closes the panel from anywhere in the hub.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, pending, focus, openAsk, close, send, sendFile, settle }), [open, pending, focus, openAsk, close, send, sendFile, settle]);
  return (
    <AskContext.Provider value={value}>
      <div className={cn(className, "transition-[padding] duration-200", open && "xl:pr-[440px]")}>{children}</div>
    </AskContext.Provider>
  );
}

/** Any button that opens the panel, optionally at one proposal. */
export function OpenAskButton({ proposalId, className, children, title }: { proposalId?: string; className?: string; children: React.ReactNode; title?: string }) {
  const { openAsk } = useAsk();
  return (
    <button type="button" className={className} title={title} onClick={() => openAsk(proposalId ? { proposalId } : undefined)}>
      {children}
    </button>
  );
}

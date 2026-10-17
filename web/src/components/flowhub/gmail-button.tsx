"use client";

import { ExternalLink, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientAuth } from "@/lib/firebase/client";
import { type GmailDraft, gmailComposeUrl } from "@/lib/gmail";

/** The Google account the person signed in with, so Gmail opens in that account. */
export function signedInEmail(): string | null {
  try {
    return clientAuth().currentUser?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Opens a URL in a new tab and drops the back-reference. Returns false when
 * the browser blocked it, so the caller can show a link to click instead.
 */
export function openTab(url: string): boolean {
  const tab = window.open(url, "_blank");
  if (!tab) return false;
  tab.opener = null;
  return true;
}

/**
 * FR-SEND-1, FR-SEND-4: opens Gmail's compose window in a new tab, filled in,
 * in the Google account the person signed in with. Nothing is sent from here.
 */
export function GmailButton({ draft, label = "Open in Gmail", size = "sm", variant = "outline", onOpened }: { draft: GmailDraft; label?: string; size?: "sm" | "default"; variant?: "outline" | "default" | "ghost"; onOpened?: () => void }) {
  function open() {
    openTab(gmailComposeUrl(draft, signedInEmail()));
    onOpened?.();
  }
  return (
    <Button type="button" size={size} variant={variant} onClick={open} title="Opens a filled-in draft in Gmail. You check it and press Send there.">
      <Mail aria-hidden="true" />
      {label}
      <ExternalLink aria-hidden="true" />
    </Button>
  );
}

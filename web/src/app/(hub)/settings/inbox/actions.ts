"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AuditEvent, InboxSettings } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { hashInboxKey, keyHint, newInboxKey } from "@/server/inbox/keys";
import { requireRole } from "@/server/workspace/access";
import { parseArgs } from "@/server/workspace/args";

/**
 * Settings › Inbox (FR-INBOX-2, ADR-0020 D2). Owner only: the key lets the
 * Gmail script send emails into this workspace.
 */

/**
 * Makes a workspace key and returns it once. Only its SHA-256 is stored; the
 * old key's hash is deleted in the same transaction, so it stops working at once.
 */
export async function makeInboxKey(): Promise<{ key: string }> {
  const context = await requireRole("owner");
  const key = newInboxKey();
  const hash = hashInboxKey(key)!;
  const wsRef = db().doc(`workspaces/${context.workspace.id}`);
  const now = new Date().toISOString();
  await db().runTransaction(async (tx) => {
    const current = InboxSettings.parse((await tx.get(wsRef)).get("inbox") ?? {});
    if (current.keyHash) tx.delete(db().doc(`inboxKeys/${current.keyHash}`));
    tx.set(db().doc(`inboxKeys/${hash}`), { workspaceId: context.workspace.id, createdAt: now, createdBy: context.user.uid });
    tx.set(wsRef, { inbox: { ...current, keyHash: hash, keyHint: keyHint(key), keyCreatedAt: now } }, { merge: true });
    tx.set(
      wsRef.collection("auditEvents").doc(),
      AuditEvent.parse({ action: current.keyHash ? "update" : "create", entity: "inbox-key", entityId: context.workspace.id, summary: current.keyHash ? "Made a new Gmail key. The old one stopped working." : "Made a Gmail key for the inbox script.", by: context.user.uid, byName: context.user.name, at: now }),
    );
  });
  refresh();
  return { key };
}

/** Decision 1: whether a clear lead starts intake on its own. */
export async function setAutoIntake(on: boolean): Promise<void> {
  const context = await requireRole("owner");
  [on] = parseArgs([z.boolean()], [on]);
  const wsRef = db().doc(`workspaces/${context.workspace.id}`);
  const now = new Date().toISOString();
  await db().runTransaction(async (tx) => {
    const current = InboxSettings.parse((await tx.get(wsRef)).get("inbox") ?? {});
    tx.set(wsRef, { inbox: { ...current, autoIntake: on } }, { merge: true });
    tx.set(
      wsRef.collection("auditEvents").doc(),
      AuditEvent.parse({ action: "update", entity: "inbox-settings", entityId: context.workspace.id, summary: on ? "Turned on automatic intake for clear leads from Gmail." : "Turned off automatic intake for leads from Gmail.", by: context.user.uid, byName: context.user.name, at: now }),
    );
  });
  refresh();
}

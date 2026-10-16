import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type Role, Workspace } from "@/lib/schema";
import { type SessionUser, getSessionUser } from "@/server/auth/session";
import { db } from "@/server/firebase/admin";
import { ForbiddenError, roleAllows } from "./roles";

export type HubContext = { user: SessionUser; workspace: Workspace; role: Role };

/** `users/{uid}.workspaceId`: one workspace per user (FR-WS-4, ADR-0008). */
export async function getUserWorkspaceId(uid: string): Promise<string | null> {
  const snap = await db().doc(`users/${uid}`).get();
  const workspaceId = snap.get("workspaceId");
  return typeof workspaceId === "string" && workspaceId ? workspaceId : null;
}

async function loadContext(user: SessionUser): Promise<HubContext | null> {
  const workspaceId = await getUserWorkspaceId(user.uid);
  if (!workspaceId) return null;
  const [workspaceSnap, memberSnap] = await Promise.all([
    db().doc(`workspaces/${workspaceId}`).get(),
    db().doc(`workspaces/${workspaceId}/members/${user.uid}`).get(),
  ]);
  const role = memberSnap.get("role");
  if (!workspaceSnap.exists || !roleAllows(role, "viewer")) return null;
  return { user, workspace: Workspace.parse({ ...workspaceSnap.data(), id: workspaceSnap.id }), role: role as Role };
}

/**
 * For hub pages: the user, their workspace and role, read once per request.
 * Redirects to sign-in, or to setup when the user has no workspace yet.
 */
export const getHubContext = cache(async (): Promise<HubContext> => {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  const context = await loadContext(user);
  if (!context) redirect("/start");
  return context;
});

/**
 * For every server action that touches a workspace (ADR-0008): re-reads the
 * session and the member document, and checks the role, before anything else.
 */
export async function requireRole(min: Role): Promise<HubContext> {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  const context = await loadContext(user);
  if (!context || !roleAllows(context.role, min)) throw new ForbiddenError();
  return context;
}

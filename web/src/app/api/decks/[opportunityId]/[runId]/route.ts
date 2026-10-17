import type { NextRequest } from "next/server";
import { ClientDeck } from "@/lib/schema";
import { getSessionUser } from "@/server/auth/session";
import { sellerLogo } from "@/server/deck/logos";
import { renderDeck } from "@/server/deck/render";
import { db } from "@/server/firebase/admin";
import { getUserWorkspaceId } from "@/server/workspace/access";
import { ArgId } from "@/server/workspace/args";
import { roleAllows } from "@/server/workspace/roles";

/**
 * FR-DECK-6: the client deck as a .pptx download, rendered from the stored
 * deck. No Google permission is needed. A member reads only their own
 * workspace's decks (invariant 7).
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/decks/[opportunityId]/[runId]">): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const params = await ctx.params;
  const opportunityId = ArgId.safeParse(params.opportunityId);
  const runId = ArgId.safeParse(params.runId);
  const workspaceId = opportunityId.success && runId.success ? await getUserWorkspaceId(user.uid) : null;
  if (!opportunityId.success || !runId.success || !workspaceId) return notFound();

  const base = db().doc(`workspaces/${workspaceId}`);
  const [workspace, member, snap] = await Promise.all([base.get(), base.collection("members").doc(user.uid).get(), base.collection("opportunities").doc(opportunityId.data).collection("decks").doc(runId.data).get()]);
  const deck = ClientDeck.safeParse(snap.data());
  if (!roleAllows(member.get("role"), "viewer") || !deck.success) return notFound();

  const pptx = await renderDeck(deck.data, sellerLogo(workspace.get("sample")));
  const name = `Deck for ${deck.data.title.prospect} - ${deck.data.title.seller}.pptx`.replace(/[^\w .()-]/g, "_");
  return new Response(new Uint8Array(pptx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

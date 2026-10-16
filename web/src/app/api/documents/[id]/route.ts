import type { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { bucket, db } from "@/server/firebase/admin";
import { getUserWorkspaceId } from "@/server/workspace/access";
import { ArgId } from "@/server/workspace/args";
import { roleAllows } from "@/server/workspace/roles";

/**
 * FR-OG-9: the source drawer shows an uploaded PDF at the page a fact cites.
 * A member reads only their own workspace's files (invariant 7), and the file
 * streams through the server, so the bucket stays private.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/documents/[id]">): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const id = ArgId.safeParse((await ctx.params).id);
  const workspaceId = id.success ? await getUserWorkspaceId(user.uid) : null;
  if (!id.success || !workspaceId) return notFound();

  const base = db().doc(`workspaces/${workspaceId}`);
  const [member, doc] = await Promise.all([base.collection("members").doc(user.uid).get(), base.collection("documents").doc(id.data).get()]);
  const storagePath = doc.get("storagePath") as string | undefined;
  if (!roleAllows(member.get("role"), "viewer") || !doc.exists || doc.get("deletedAt") || !storagePath?.startsWith(`workspaces/${workspaceId}/`)) return notFound();

  const file = bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) return notFound();
  const [bytes] = await file.download();
  const name = String(doc.get("name") ?? "document.pdf").replace(/[^\w .-]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

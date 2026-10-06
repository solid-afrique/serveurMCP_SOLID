import { errorResponse, notFound, requireSession } from "@/lib/auth";
import { canManage, canUse, getConnection, revokeGrants } from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Révoque immédiatement des accès accordés aux assistants. L'URL MCP reste valable.
 * - administrateur ou propriétaire : tous les accès (ou ceux d'un seul utilisateur avec `userId`) ;
 * - utilisateur attribué : uniquement ses propres assistants.
 */
export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  try {
    const conn = await getConnection((await ctx.params).id);
    if (!conn || !(await canUse(session.actor, conn))) return notFound();
    const body = (await req.json().catch(() => ({}))) as { userId?: string };

    const manager = canManage(session.actor, conn);
    const target = manager ? body.userId : session.actor.id;
    const revoked = await revokeGrants(conn.id, target ? (g) => g.userId === target : undefined);
    return Response.json({ ok: true, revoked });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

import { errorResponse, forbidden, notFound, requireSession } from "@/lib/auth";
import { parseConnection, publicConfig, withPreviousSecrets } from "@/lib/config";
import { canManage, deleteConnection, getConnection, loadConfig, updateConnection } from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Configuration pour le formulaire de modification (sans secrets) : administrateur ou propriétaire. */
export async function GET(req: Request, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const conn = await getConnection((await ctx.params).id);
  if (!conn) return notFound();
  if (!canManage(session.actor, conn)) return forbidden();
  return Response.json({ ok: true, connection: publicConfig(loadConfig(conn)) });
}

/**
 * Modifie les paramètres d'une connexion. L'URL MCP et les autorisations
 * existantes sont conservées : les assistants n'ont rien à reconfigurer.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  try {
    const { id } = await ctx.params;
    const conn = await getConnection(id);
    if (!conn) return notFound();
    if (!canManage(session.actor, conn)) return forbidden();
    const body = await req.json();
    const config = parseConnection(withPreviousSecrets(body.connection, loadConfig(conn)));
    await updateConnection(id, config);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Supprime la connexion et toutes ses autorisations. */
export async function DELETE(req: Request, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  try {
    const { id } = await ctx.params;
    const conn = await getConnection(id);
    if (!conn) return notFound();
    if (!canManage(session.actor, conn)) return forbidden();
    await deleteConnection(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

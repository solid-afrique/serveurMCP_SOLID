import { errorResponse, notFound, requireSession } from "@/lib/auth";
import { ADMIN_ID, getConnection, setConnectionUsers } from "@/lib/connections";
import { getUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Définit les utilisateurs ayant accès à la connexion (administrateur uniquement).
 * Un utilisateur retiré perd immédiatement l'accès depuis ses assistants.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const session = await requireSession(req, { adminOnly: true });
  if (session instanceof Response) return session;
  try {
    const conn = await getConnection((await ctx.params).id);
    if (!conn) return notFound();
    if (conn.ownerId && conn.ownerId !== ADMIN_ID) {
      throw new Error("Une connexion privée d'utilisateur ne peut pas être partagée.");
    }
    const { userIds } = (await req.json()) as { userIds?: unknown };
    if (!Array.isArray(userIds)) throw new Error("userIds doit être une liste.");
    const ids = [...new Set(userIds.map(String))];
    for (const uid of ids) if (!(await getUser(uid))) throw new Error(`Utilisateur inconnu : ${uid}`);
    await setConnectionUsers(conn.id, ids);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

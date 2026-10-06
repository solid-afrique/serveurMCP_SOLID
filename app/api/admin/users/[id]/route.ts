import { errorResponse, requireSession } from "@/lib/auth";
import { deleteUser, renameUser, setUserStatus } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Renomme, active ou désactive un utilisateur. La désactivation coupe immédiatement ses accès. */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(req, { adminOnly: true });
  if (session instanceof Response) return session;
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { name?: string; status?: string };
    if (body.name !== undefined) await renameUser(id, body.name);
    if (body.status === "active" || body.status === "disabled") await setUserStatus(id, body.status);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Supprime l'utilisateur, ses connexions privées et tous ses accès. */
export async function DELETE(req: Request, ctx: Ctx) {
  const session = await requireSession(req, { adminOnly: true });
  if (session instanceof Response) return session;
  try {
    await deleteUser((await ctx.params).id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

import { errorResponse, requireSession } from "@/lib/auth";
import { baseUrl } from "@/lib/oauth";
import { createInvite, getUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Génère un nouveau lien (invitation ou réinitialisation du mot de passe).
 * Le lien précédent devient invalide ; le mot de passe actuel reste valable jusqu'à son utilisation.
 */
export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(req, { adminOnly: true });
  if (session instanceof Response) return session;
  try {
    const user = await getUser((await ctx.params).id);
    if (!user) return Response.json({ ok: false, error: "Utilisateur introuvable." }, { status: 404 });
    if (user.status === "disabled") throw new Error("Réactivez d'abord ce compte.");
    const token = await createInvite(user.id);
    return Response.json({ ok: true, inviteUrl: `${baseUrl(req)}/invitation/${token}` });
  } catch (error) {
    return errorResponse(error);
  }
}

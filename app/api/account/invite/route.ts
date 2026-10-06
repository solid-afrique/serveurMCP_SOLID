import { errorResponse, sameOrigin, sessionCookie } from "@/lib/auth";
import { acceptInvite } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Choix du mot de passe depuis un lien d'invitation ; l'utilisateur est ensuite connecté. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  try {
    const { token, password } = await req.json();
    const user = await acceptInvite(String(token ?? ""), password);
    const session = { actor: { id: user.id, role: "user" as const, email: user.email, name: user.name }, user };
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(req, session) } });
  } catch (error) {
    return errorResponse(error);
  }
}

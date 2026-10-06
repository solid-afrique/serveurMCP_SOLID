import { errorResponse, requireSession, sessionCookie } from "@/lib/auth";
import { changePassword } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Changement de mot de passe d'un utilisateur (celui de l'administrateur se change dans ADMIN_PASSWORD). */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  if (!session.user) {
    return Response.json(
      { ok: false, error: "Le mot de passe administrateur se change dans la variable d'environnement ADMIN_PASSWORD." },
      { status: 400 },
    );
  }
  try {
    const { current, next } = await req.json();
    const user = await changePassword(session.user, current, next);
    // Les autres sessions sont fermées ; celle-ci est renouvelée.
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(req, { ...session, user }) } });
  } catch (error) {
    return errorResponse(error);
  }
}

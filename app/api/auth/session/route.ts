import {
  adminConfigured,
  authenticate,
  clearSessionCookie,
  errorResponse,
  getSession,
  sameOrigin,
  sessionCookie,
} from "@/lib/auth";
import { storeUrl } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Personne connectée et état de la configuration du serveur. */
export async function GET(req: Request) {
  const session = await getSession(req).catch(() => null);
  return Response.json({
    actor: session?.actor ?? null,
    configured: {
      encryptionKey: (process.env.ENCRYPTION_KEY?.length ?? 0) >= 16,
      adminPassword: adminConfigured(),
      store: storeUrl() ? "redis" : process.env.NODE_ENV === "production" ? "missing" : "memory",
    },
  });
}

/** Connexion (administrateur ou utilisateur). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  try {
    const { email, password } = await req.json();
    const session = await authenticate(req, email, password);
    return Response.json({ ok: true, actor: session.actor }, { headers: { "Set-Cookie": sessionCookie(req, session) } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Déconnexion. */
export function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}

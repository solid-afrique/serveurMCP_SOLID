import { errorResponse, requireSession } from "@/lib/auth";
import { parseConnection } from "@/lib/config";
import { createConnection, listConnections } from "@/lib/connections";
import { baseUrl, mcpUrl } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connexions visibles : toutes pour l'administrateur, les siennes et celles attribuées pour un utilisateur. */
export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  try {
    const base = baseUrl(req);
    const connections = (await listConnections(session.actor)).map((c) => ({ ...c, url: mcpUrl(base, c.id) }));
    return Response.json({ ok: true, connections });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

/** Création : par l'administrateur, ou par un utilisateur (connexion privée). */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  try {
    const body = await req.json();
    const config = parseConnection(body.connection);
    const id = await createConnection(config, session.actor, Number(body.expiresInDays) || undefined);
    return Response.json({ ok: true, id, url: mcpUrl(baseUrl(req), id) });
  } catch (error) {
    return errorResponse(error);
  }
}

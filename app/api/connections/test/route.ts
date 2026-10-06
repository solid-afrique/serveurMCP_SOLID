import { errorMessage, errorResponse, forbidden, requireSession } from "@/lib/auth";
import { parseConnection, withPreviousSecrets } from "@/lib/config";
import { canManage, getConnection, loadConfig } from "@/lib/connections";
import { pingVersion } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Teste des paramètres de connexion (complétés par ceux d'une connexion existante si `id` est fourni). */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  let config;
  try {
    const body = await req.json();
    const existing = body.id ? await getConnection(String(body.id)) : null;
    if (existing && !canManage(session.actor, existing)) return forbidden();
    config = parseConnection(existing ? withPreviousSecrets(body.connection, loadConfig(existing)) : body.connection);
  } catch (error) {
    return errorResponse(error);
  }

  try {
    return Response.json({ ok: true, version: await pingVersion(config) });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) });
  }
}

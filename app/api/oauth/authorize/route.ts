import { authenticate, errorResponse, sameOrigin } from "@/lib/auth";
import { canUse, getConnection, isExpired, listConnections } from "@/lib/connections";
import { DB_LABELS } from "@/lib/config";
import { createCode, redirectWith, validateAuthorize, type AuthorizeParams } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  params: AuthorizeParams;
  decision: "approve" | "deny";
  email?: string;
  password?: string;
  connId?: string;
}

/**
 * Décision de l'écran de consentement. L'identifiant et le mot de passe sont exigés
 * à chaque autorisation : une page tierce ne peut donc pas forcer l'accord (CSRF).
 * L'accès accordé est lié à la personne qui s'est identifiée.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ ok: false, error: "Origine refusée." }, { status: 403 });

  try {
    const body = (await req.json()) as Body;
    const { client, redirectUri, connId: resourceConnId } = await validateAuthorize(body.params);
    const state = body.params.state;

    if (body.decision !== "approve") {
      return Response.json({ ok: true, redirect: redirectWith(redirectUri, { error: "access_denied", state }) });
    }

    const { actor } = await authenticate(req, body.email, body.password);

    const connId = resourceConnId ?? body.connId;
    if (!connId) {
      // Le client n'a pas précisé la ressource : la personne choisit parmi ses connexions.
      const connections = (await listConnections(actor))
        .filter((c) => !c.expired)
        .map((c) => ({ id: c.id, name: c.name, type: DB_LABELS[c.type] }));
      return Response.json({ ok: true, chooseConnection: true, connections });
    }

    const conn = await getConnection(connId);
    if (!conn || isExpired(conn)) {
      return Response.json({ ok: false, error: "Cette connexion n'existe plus ou a expiré." }, { status: 404 });
    }
    if (!(await canUse(actor, conn))) {
      return Response.json({ ok: false, error: "Vous n'avez pas accès à cette connexion." }, { status: 403 });
    }

    const code = await createCode({
      clientId: client.client_id,
      connId,
      redirectUri,
      codeChallenge: body.params.code_challenge!,
      resource: body.params.resource ?? undefined,
      actor,
    });
    return Response.json({ ok: true, redirect: redirectWith(redirectUri, { code, state }) });
  } catch (error) {
    return errorResponse(error);
  }
}

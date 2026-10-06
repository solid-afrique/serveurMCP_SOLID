import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isExpired, loadConfig, touchConnection } from "@/lib/connections";
import { baseUrl, resourceMetadataUrl, verifyAccessToken } from "@/lib/oauth";
import { buildServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function rpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...headers },
  });
}

type Ctx = { params: Promise<{ id: string }> };

/**
 * Point d'entrée MCP « Streamable HTTP » sans état, protégé par OAuth.
 * Sans jeton valide, la réponse 401 indique au client où trouver le serveur
 * d'autorisation (en-tête WWW-Authenticate, RFC 9728).
 */
async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const challenge = (error?: string) => ({
    "WWW-Authenticate": [
      `Bearer resource_metadata="${resourceMetadataUrl(baseUrl(req), id)}"`,
      error ? `error="${error}"` : "",
    ]
      .filter(Boolean)
      .join(", "),
  });

  const auth = req.headers.get("authorization");
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return rpcError(401, "Authentification requise.", challenge());

  let conn;
  try {
    // Jeton valide, autorisation non révoquée, titulaire actif et ayant toujours accès.
    const verified = await verifyAccessToken(token, id);
    if (!verified) return rpcError(401, "Jeton invalide, expiré ou révoqué.", challenge("invalid_token"));
    conn = verified.conn;
    if (isExpired(conn)) return rpcError(403, "Cette connexion a expiré.");
  } catch (error) {
    console.error("[mcp] authentification :", error);
    return rpcError(500, error instanceof Error ? error.message : "Erreur du serveur.");
  }

  const server = buildServer(loadConfig(conn));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    await touchConnection(id).catch(() => undefined);
    return withCors(res);
  } finally {
    await server.close().catch(() => undefined);
  }
}

export const POST = handle;

/**
 * Serveur sans état : pas de flux SSE (GET) ni de session à fermer (DELETE).
 * Répondre 405 indique au client de ne pas ouvrir de flux ; sinon il se
 * reconnecterait en boucle, chaque tentative coûtant une exécution serverless.
 */
function methodNotAllowed() {
  return rpcError(405, "Méthode non prise en charge : ce serveur MCP sans état n'accepte que POST.", { Allow: "POST, OPTIONS" });
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

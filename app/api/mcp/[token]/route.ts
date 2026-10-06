import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { openToken, TokenError } from "@/lib/crypto";
import { buildServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function rpcError(status: number, message: string): Response {
  return withCors(
    Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status }),
  );
}

type Ctx = { params: Promise<{ token: string }> };

/**
 * Point d'entrée MCP « Streamable HTTP » sans état : chaque requête reconstruit
 * le serveur à partir du jeton chiffré, ce qui convient aux fonctions serverless.
 */
async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { token } = await ctx.params;

  let config;
  try {
    config = openToken(token).config;
  } catch (error) {
    if (error instanceof TokenError) return rpcError(401, error.message);
    return rpcError(500, error instanceof Error ? error.message : "Erreur de configuration du serveur.");
  }

  const server = buildServer(config);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(req));
  } finally {
    await server.close().catch(() => undefined);
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

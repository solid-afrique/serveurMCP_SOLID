import { baseUrl, CORS, SCOPE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

// Servi sur /.well-known/oauth-protected-resource/<chemin de la ressource> (RFC 9728).
export async function GET(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const base = baseUrl(req);
  return Response.json(
    {
      resource: path.length ? `${base}/${path.join("/")}` : base,
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
      scopes_supported: [SCOPE],
      resource_name: "Serveur MCP — Bases de données",
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

import { authorizationServerMetadata, baseUrl, CORS } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// Servi sur /.well-known/oauth-authorization-server (voir les rewrites de next.config.ts).
export function GET(req: Request) {
  return Response.json(authorizationServerMetadata(baseUrl(req)), {
    headers: { ...CORS, "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

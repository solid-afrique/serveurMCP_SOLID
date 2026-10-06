import { authenticateClient, CORS, OAuthError, revokeToken } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Révocation d'un jeton par le client (RFC 7009) : répond 200 même si le jeton est inconnu.
export async function POST(req: Request) {
  try {
    const form = new URLSearchParams(await req.text());
    await authenticateClient(req, form);
    const token = form.get("token");
    if (token) await revokeToken(token);
    return new Response(null, { status: 200, headers: CORS });
  } catch (error) {
    if (error instanceof OAuthError) return error.toResponse();
    return new OAuthError("server_error", "Erreur interne.", 500).toResponse();
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

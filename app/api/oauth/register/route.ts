import { CORS, OAuthError, registerClient } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enregistrement dynamique des clients (RFC 7591), utilisé par Claude, ChatGPT, VS Code…
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => {
      throw new OAuthError("invalid_client_metadata", "Corps JSON invalide.");
    });
    const client = await registerClient(body);
    return Response.json(client, { status: 201, headers: { ...CORS, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OAuthError) return error.toResponse();
    console.error("[oauth] register :", error);
    return new OAuthError("server_error", "Erreur interne.", 500).toResponse();
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

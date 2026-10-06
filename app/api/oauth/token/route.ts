import { authenticateClient, CORS, exchangeCode, OAuthError, refreshTokens } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json()) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}

export async function POST(req: Request) {
  try {
    const form = await readForm(req);
    const client = await authenticateClient(req, form);
    const grantType = form.get("grant_type");
    const tokens =
      grantType === "authorization_code"
        ? await exchangeCode(client, form)
        : grantType === "refresh_token"
          ? await refreshTokens(client, form)
          : (() => {
              throw new OAuthError("unsupported_grant_type", `grant_type non pris en charge : ${grantType}`);
            })();
    return Response.json(tokens, { headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch (error) {
    if (error instanceof OAuthError) return error.toResponse();
    console.error("[oauth] token :", error);
    return new OAuthError("server_error", "Erreur interne.", 500).toResponse();
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

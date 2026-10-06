import { checkAdmin, errorMessage } from "@/lib/admin";
import { parseConnection } from "@/lib/config";
import { sealConfig } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: Request) {
  const denied = checkAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const config = parseConnection(body.connection);
    const days = Number(body.expiresInDays) || undefined;
    const token = sealConfig(config, days);
    return Response.json({
      ok: true,
      url: `${baseUrl(req)}/api/mcp/${token}`,
      expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }
}

import { checkAdmin, errorMessage } from "@/lib/admin";
import { parseConnection } from "@/lib/config";
import { pingVersion } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const denied = checkAdmin(req);
  if (denied) return denied;

  let config;
  try {
    config = parseConnection((await req.json()).connection);
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }

  try {
    return Response.json({ ok: true, version: await pingVersion(config) });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) });
  }
}

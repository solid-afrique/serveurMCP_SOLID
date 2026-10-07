import { clientIp } from "@/lib/oauth";
import { getStore, storeKind } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic : le serveur répond et le stockage est joignable (installation, supervision).
 * « ip » est l'adresse du visiteur telle que le serveur la voit : elle permet de vérifier
 * CLIENT_IP_HEADER derrière IIS (elle doit être votre IP, pas 127.0.0.1 ni « inconnue »).
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  try {
    const store = storeKind();
    await getStore().get("health:ping");
    return Response.json({ ok: true, store, ip });
  } catch (error) {
    return Response.json({ ok: false, ip, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}

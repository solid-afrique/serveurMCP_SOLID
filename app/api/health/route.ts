import { getStore, storeKind } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Diagnostic : le serveur répond et le stockage est joignable (utilisé par l'installation et la supervision). */
export async function GET() {
  try {
    const store = storeKind();
    await getStore().get("health:ping");
    return Response.json({ ok: true, store });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}

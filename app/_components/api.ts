export type ApiResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

/** Appel JSON aux routes d'administration (le cookie de session est envoyé automatiquement). */
export async function api<T = Record<string, unknown>>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as ApiResult<T>;
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "jamais";
  return new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "base-de-donnees";
}

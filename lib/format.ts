const MAX_CHARS = 100_000;

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (
    value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return `<binaire ${(value as { data: unknown[] }).data.length} octets>`;
  }
  return value;
}

export function toJson(value: unknown): string {
  const text = JSON.stringify(value, replacer, 2) ?? "null";
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS)}\n… [résultat tronqué à ${MAX_CHARS} caractères — affinez la requête]`;
}

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function ok(value: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof value === "string" ? value : toJson(value) }] };
}

export function fail(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: `Erreur : ${message}` }], isError: true };
}

/** Exécute un outil en convertissant toute exception en résultat d'erreur MCP. */
export async function safely(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}

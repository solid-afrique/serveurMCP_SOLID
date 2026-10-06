import { createHash, timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function adminRequired(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** Renvoie une réponse 401 si ADMIN_PASSWORD est défini et que l'en-tête ne correspond pas. */
export function checkAdmin(req: Request): Response | null {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return null;
  const given = req.headers.get("x-admin-password") ?? "";
  if (timingSafeEqual(digest(given), digest(expected))) return null;
  return Response.json({ ok: false, error: "Mot de passe administrateur incorrect." }, { status: 401 });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((i) => i.message).join(" ; ");
  if (error instanceof AggregateError && error.errors.length) return errorMessage(error.errors[0]);
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

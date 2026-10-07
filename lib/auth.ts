import { ZodError } from "zod";
import { ADMIN_ID, type Actor } from "./connections";
import { hmac, safeEqual, sha256 } from "./crypto";
import { assertNotLocked, OAuthError, recordFailure } from "./oauth";
import { adminIdentifier, getUser, getUserByEmail, normalizeEmail, touchLogin, verifyPassword, type User } from "./users";

const COOKIE = "mcpdb_session";
const SESSION_TTL = 12 * 60 * 60; // 12 h

export interface Session {
  actor: Actor;
  user?: User;
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export const adminActor = (): Actor => ({ id: ADMIN_ID, role: "admin", email: adminIdentifier(), name: "Administrateur" });
const userActor = (u: User): Actor => ({ id: u.id, role: u.role === "admin" ? "admin" : "user", email: u.email, name: u.name });

/**
 * Vérifie un identifiant et un mot de passe (administrateur ou utilisateur),
 * avec limitation des tentatives par IP. Le message d'erreur ne révèle pas
 * si le compte existe.
 */
export async function authenticate(req: Request, identifier: unknown, password: unknown): Promise<Session> {
  await assertNotLocked(req);
  const id = typeof identifier === "string" ? normalizeEmail(identifier) : "";
  const pw = typeof password === "string" ? password : "";

  if (id && id === adminIdentifier()) {
    const expected = process.env.ADMIN_PASSWORD;
    if (expected && safeEqual(pw, expected)) return { actor: adminActor() };
  } else {
    const user = id ? await getUserByEmail(id) : null;
    const valid = await verifyPassword(pw, user?.passwordHash);
    if (user && valid) {
      if (user.status !== "active") throw new OAuthError("access_denied", "Ce compte est désactivé.", 403);
      await touchLogin(user);
      return { actor: userActor(user), user };
    }
  }
  await recordFailure(req);
  throw new OAuthError("access_denied", "Identifiant ou mot de passe incorrect.", 401);
}

/* --------------------------------- Session -------------------------------- */

// La version entre dans la signature : changer de mot de passe ou désactiver un compte ferme ses sessions.
const versionOf = (s: Session) =>
  s.actor.id === ADMIN_ID ? sha256(process.env.ADMIN_PASSWORD ?? "").slice(0, 16) : String(s.user!.sessionVersion);
const sign = (payload: string) => hmac(payload, "session");

function isSecure(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? new URL(req.url).protocol.replace(":", "");
  return proto === "https";
}

export function sessionCookie(req: Request, session: Session): string {
  const payload = `${session.actor.id}.${versionOf(session)}.${Date.now() + SESSION_TTL * 1000}`;
  const attrs = ["Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${SESSION_TTL}`];
  if (isSecure(req)) attrs.push("Secure");
  return `${COOKIE}=${payload}.${sign(payload)}; ${attrs.join("; ")}`;
}

export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export async function getSession(req: Request): Promise<Session | null> {
  const value = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const [sub, version, exp, signature] = value?.split(".") ?? [];
  if (!sub || !version || !exp || !signature) return null;
  if (Number(exp) < Date.now() || !safeEqual(signature, sign(`${sub}.${version}.${exp}`))) return null;

  let session: Session;
  if (sub === ADMIN_ID) {
    if (!adminConfigured()) return null;
    session = { actor: adminActor() };
  } else {
    const user = await getUser(sub);
    if (!user || user.status !== "active") return null;
    session = { actor: userActor(user), user };
  }
  return safeEqual(version, versionOf(session)) ? session : null;
}

/** Refuse les requêtes modifiantes venant d'une autre origine (protection CSRF). */
export function sameOrigin(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // clients non navigateurs
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Renvoie la session, ou une réponse d'erreur si la personne n'est pas connectée
 * (ou n'est pas administrateur quand `adminOnly` est demandé).
 */
export async function requireSession(req: Request, opts: { adminOnly?: boolean } = {}): Promise<Session | Response> {
  if (!sameOrigin(req)) return Response.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  const session = await getSession(req);
  if (!session) return Response.json({ ok: false, error: "Session expirée : reconnectez-vous." }, { status: 401 });
  if (opts.adminOnly && session.actor.role !== "admin") {
    return Response.json({ ok: false, error: "Réservé à l'administrateur." }, { status: 403 });
  }
  return session;
}

/* --------------------------------- Erreurs -------------------------------- */

export function errorMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((i) => i.message).join(" ; ");
  if (error instanceof AggregateError && error.errors.length) return errorMessage(error.errors[0]);
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export function errorResponse(error: unknown, status = 400): Response {
  const code = error instanceof OAuthError ? error.status : status;
  return Response.json({ ok: false, error: errorMessage(error) }, { status: code });
}

export const forbidden = () => Response.json({ ok: false, error: "Accès refusé." }, { status: 403 });
export const notFound = () => Response.json({ ok: false, error: "Connexion introuvable." }, { status: 404 });

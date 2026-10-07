import {
  ADMIN_ID,
  canUse,
  createGrant,
  getConnection,
  getGrant,
  isExpired,
  touchGrant,
  type Actor,
  type Grant,
  type StoredConnection,
} from "./connections";
import { randomToken, safeEqual, sha256 } from "./crypto";
import { getStore } from "./store";
import { getUser } from "./users";

/**
 * Serveur d'autorisation OAuth 2.1 minimal, conforme à ce qu'attendent les clients MCP :
 * découverte (RFC 9728 / RFC 8414), enregistrement dynamique (RFC 7591),
 * code d'autorisation + PKCE S256, jetons de rafraîchissement avec rotation, révocation (RFC 7009).
 */

export const ACCESS_TOKEN_TTL = 60 * 60; // 1 h
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 jours
const CODE_TTL = 5 * 60;
export const SCOPE = "mcp";

type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: AuthMethod;
  client_id_issued_at: number;
  secretHash?: string;
}

interface CodeData {
  clientId: string;
  connId: string;
  redirectUri: string;
  codeChallenge: string;
  resource?: string;
  /** Personne qui a accordé l'accès sur l'écran de consentement. */
  actor: Actor;
}

interface TokenData {
  grantId: string;
  connId: string;
  clientId: string;
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    description: string,
    public status = 400,
  ) {
    super(description);
  }
  toResponse(): Response {
    return Response.json(
      { error: this.code, error_description: this.message },
      { status: this.status, headers: { "Cache-Control": "no-store", ...CORS } },
    );
  }
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version",
};

/* --------------------------------- URLs --------------------------------- */

export function baseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export const mcpUrl = (base: string, connId: string) => `${base}/api/mcp/${connId}`;

export const resourceMetadataUrl = (base: string, connId: string) =>
  `${base}/.well-known/oauth-protected-resource/api/mcp/${connId}`;

/** Extrait l'identifiant de connexion d'une URL de ressource MCP. */
export function connIdFromResource(resource: string | null | undefined): string | undefined {
  if (!resource) return undefined;
  try {
    return new URL(resource).pathname.match(/^\/api\/mcp\/([\w-]+)\/?$/)?.[1];
  } catch {
    return undefined;
  }
}

export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
  };
}

/* ----------------------- Enregistrement dynamique ----------------------- */

function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // Schémas personnalisés des applications natives (ex. cursor://, vscode://).
  return !["javascript:", "data:", "file:", "vbscript:", "blob:"].includes(url.protocol);
}

export async function registerClient(body: Record<string, unknown>) {
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris doit contenir entre 1 et 10 URL.");
  }
  if (!redirectUris.every(validRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "Une des redirect_uris est invalide (https ou http://localhost requis).");
  }
  const requested = (body.token_endpoint_auth_method as string) ?? "client_secret_basic";
  const method: AuthMethod = ["none", "client_secret_post", "client_secret_basic"].includes(requested)
    ? (requested as AuthMethod)
    : "client_secret_basic";

  const clientId = randomToken(16);
  const secret = method === "none" ? undefined : randomToken(32);
  const client: OAuthClient = {
    client_id: clientId,
    client_name: String(body.client_name ?? "Application MCP").slice(0, 100),
    redirect_uris: redirectUris,
    token_endpoint_auth_method: method,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    secretHash: secret ? sha256(secret) : undefined,
  };
  await getStore().set(`client:${clientId}`, JSON.stringify(client));

  const { secretHash: _hash, ...publicFields } = client;
  return {
    ...publicFields,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: SCOPE,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

export async function getClient(clientId: string | null | undefined): Promise<OAuthClient | null> {
  if (!clientId) return null;
  const raw = await getStore().get(`client:${clientId}`);
  return raw ? (JSON.parse(raw) as OAuthClient) : null;
}

/** Authentifie le client sur les endpoints token/revoke (Basic, POST ou client public). */
export async function authenticateClient(req: Request, form: URLSearchParams): Promise<OAuthClient> {
  let clientId = form.get("client_id");
  let secret = form.get("client_secret");
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [id, pw] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
    clientId = decodeURIComponent(id ?? "");
    secret = decodeURIComponent(pw ?? "");
  }
  const client = await getClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "Client inconnu.", 401);
  if (client.secretHash && (!secret || !safeEqual(sha256(secret), client.secretHash))) {
    throw new OAuthError("invalid_client", "Authentification du client invalide.", 401);
  }
  return client;
}

/* ------------------------- Code d'autorisation ------------------------- */

export interface AuthorizeParams {
  response_type: string | null;
  client_id: string | null;
  redirect_uri: string | null;
  state: string | null;
  code_challenge: string | null;
  code_challenge_method: string | null;
  resource: string | null;
  scope: string | null;
}

/**
 * Valide une requête d'autorisation. Les erreurs sur le client ou la redirect_uri
 * ne doivent pas être renvoyées vers la redirect_uri (elle n'est pas fiable).
 */
export async function validateAuthorize(p: AuthorizeParams) {
  const client = await getClient(p.client_id);
  if (!client) throw new OAuthError("invalid_client", "Application inconnue. Supprimez puis rajoutez le connecteur.");
  const redirectUri = p.redirect_uri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : null);
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    throw new OAuthError("invalid_request", "redirect_uri non enregistrée pour cette application.");
  }
  if (p.response_type !== "code") throw new OAuthError("unsupported_response_type", "Seul response_type=code est accepté.");
  if (!p.code_challenge || p.code_challenge_method !== "S256") {
    throw new OAuthError("invalid_request", "PKCE (code_challenge_method=S256) est obligatoire.");
  }
  const connId = connIdFromResource(p.resource);
  if (p.resource && !connId) throw new OAuthError("invalid_target", "Ressource inconnue.");
  return { client, redirectUri, connId };
}

export function redirectWith(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

export async function createCode(data: CodeData): Promise<string> {
  const code = randomToken(32);
  await getStore().set(`code:${sha256(code)}`, JSON.stringify(data), CODE_TTL);
  return code;
}

/* -------------------------------- Jetons -------------------------------- */

async function issueTokens(grant: Grant) {
  const store = getStore();
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  const data: TokenData = { grantId: grant.id, connId: grant.connId, clientId: grant.clientId };
  await store.set(`at:${sha256(accessToken)}`, JSON.stringify(data), ACCESS_TOKEN_TTL);
  await store.set(`rt:${sha256(refreshToken)}`, JSON.stringify(data), REFRESH_TOKEN_TTL);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    scope: SCOPE,
  };
}

async function activeConnection(connId: string) {
  const conn = await getConnection(connId);
  if (!conn || isExpired(conn)) throw new OAuthError("invalid_grant", "La connexion n'existe plus ou a expiré.");
  return conn;
}

/**
 * Vérifie que la personne qui a accordé l'accès y a toujours droit :
 * compte actif et connexion toujours attribuée (l'administrateur a accès à tout).
 */
export async function grantHasAccess(grant: Pick<Grant, "userId">, conn: StoredConnection): Promise<boolean> {
  if (grant.userId === ADMIN_ID) return true;
  const user = await getUser(grant.userId);
  if (!user || user.status !== "active") return false;
  return canUse({ id: user.id, role: "user" }, conn);
}

export async function exchangeCode(client: OAuthClient, form: URLSearchParams) {
  const code = form.get("code");
  const verifier = form.get("code_verifier");
  if (!code || !verifier) throw new OAuthError("invalid_request", "code et code_verifier sont requis.");

  const raw = await getStore().getdel(`code:${sha256(code)}`);
  if (!raw) throw new OAuthError("invalid_grant", "Code d'autorisation invalide ou expiré.");
  const data = JSON.parse(raw) as CodeData;

  if (data.clientId !== client.client_id) throw new OAuthError("invalid_grant", "Code émis pour une autre application.");
  const redirectUri = form.get("redirect_uri");
  if (redirectUri && redirectUri !== data.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri différente.");
  if (sha256(verifier) !== data.codeChallenge) throw new OAuthError("invalid_grant", "code_verifier invalide (PKCE).");
  const resource = form.get("resource");
  if (resource && connIdFromResource(resource) !== data.connId) {
    throw new OAuthError("invalid_target", "La ressource ne correspond pas à l'autorisation.");
  }

  const conn = await activeConnection(data.connId);
  if (!(await grantHasAccess({ userId: data.actor.id }, conn))) {
    throw new OAuthError("access_denied", "Vous n'avez plus accès à cette connexion.");
  }
  const grant = await createGrant(
    data.connId,
    { clientId: client.client_id, clientName: client.client_name },
    data.actor,
    REFRESH_TOKEN_TTL,
  );
  return issueTokens(grant);
}

export async function refreshTokens(client: OAuthClient, form: URLSearchParams) {
  const token = form.get("refresh_token");
  if (!token) throw new OAuthError("invalid_request", "refresh_token est requis.");
  // Rotation : l'ancien jeton de rafraîchissement est consommé.
  const raw = await getStore().getdel(`rt:${sha256(token)}`);
  if (!raw) throw new OAuthError("invalid_grant", "Jeton de rafraîchissement invalide, expiré ou révoqué.");
  const data = JSON.parse(raw) as TokenData;
  if (data.clientId !== client.client_id) throw new OAuthError("invalid_grant", "Jeton émis pour une autre application.");

  const grant = await getGrant(data.grantId);
  if (!grant) throw new OAuthError("invalid_grant", "L'accès a été révoqué. Reconnectez le connecteur.");
  const conn = await activeConnection(grant.connId);
  if (!(await grantHasAccess(grant, conn))) {
    throw new OAuthError("invalid_grant", "Votre accès à cette connexion a été retiré.");
  }
  await touchGrant(grant, REFRESH_TOKEN_TTL);
  return issueTokens(grant);
}

/**
 * Vérifie un jeton d'accès pour une connexion donnée. Renvoie null si le jeton est
 * invalide, révoqué, ou si son titulaire n'a plus accès (la connexion peut être expirée).
 */
export async function verifyAccessToken(
  token: string,
  connId: string,
): Promise<{ grant: Grant; conn: StoredConnection } | null> {
  const raw = await getStore().get(`at:${sha256(token)}`);
  if (!raw) return null;
  const data = JSON.parse(raw) as TokenData;
  if (data.connId !== connId) return null;
  const [grant, conn] = await Promise.all([getGrant(data.grantId), getConnection(connId)]);
  if (!grant || !conn || !(await grantHasAccess(grant, conn))) return null;
  return { grant, conn };
}

export async function revokeToken(token: string): Promise<void> {
  await getStore().del([`at:${sha256(token)}`, `rt:${sha256(token)}`]);
}

/* ------------------------- Limitation de débit ------------------------- */

/** IP du client, lue uniquement dans l'en-tête fixé par la plateforme (non falsifiable). */
export function clientIp(req: Request): string {
  const h = req.headers;
  // Derrière un proxy de confiance (ex. Cloudflare Tunnel : CLIENT_IP_HEADER=cf-connecting-ip).
  const trusted = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  const ip = trusted
    ? h.get(trusted)?.split(",")[0]
    : process.env.NETLIFY
    ? h.get("x-nf-client-connection-ip")
    : process.env.VERCEL
      ? (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0])
      : h.get("x-forwarded-for")?.split(",")[0];
  return ip?.trim() || "inconnue";
}

const LOCK_WINDOW = 15 * 60;
const MAX_PER_IP = 10;
// Plafond global : protège même si les échecs viennent d'IP multiples.
const MAX_GLOBAL = 100;

/** Bloque après trop d'échecs de mot de passe sur 15 minutes (par IP et au total). */
export async function assertNotLocked(req: Request): Promise<void> {
  const [perIp, global] = await getStore().mget([`rl:ip:${clientIp(req)}`, "rl:global"]);
  if (Number(perIp ?? 0) >= MAX_PER_IP || Number(global ?? 0) >= MAX_GLOBAL) {
    throw new OAuthError("too_many_requests", "Trop de tentatives échouées. Réessayez dans 15 minutes.", 429);
  }
}

export async function recordFailure(req: Request): Promise<void> {
  await getStore().incr(`rl:ip:${clientIp(req)}`, LOCK_WINDOW);
  await getStore().incr("rl:global", LOCK_WINDOW);
}

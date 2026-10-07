import { displayName, type ConnectionConfig, type DbType } from "./config";
import { decrypt, encrypt, randomToken } from "./crypto";
import { getStore } from "./store";

/**
 * Registre des connexions. Les paramètres (dont les mots de passe) sont chiffrés
 * avec ENCRYPTION_KEY ; seules les métadonnées d'affichage sont en clair.
 *
 * Clés : conn:{id}, conns (ensemble des ids), conn:{id}:last (dernier usage),
 *        conn:{id}:users / user:{uid}:conns (attributions par l'administrateur),
 *        user:{uid}:owned (connexions privées d'un utilisateur),
 *        conn:{id}:grants (autorisations OAuth), grant:{gid}.
 */

/** Identifiant réservé au compte administrateur (défini par variables d'environnement). */
export const ADMIN_ID = "admin";

export interface StoredConnection {
  id: string;
  name: string;
  type: DbType;
  readOnly: boolean;
  database?: string;
  /** ADMIN_ID ou identifiant de l'utilisateur propriétaire (connexion privée). */
  ownerId?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  secret: string;
}

export interface Grant {
  id: string;
  connId: string;
  clientId: string;
  clientName: string;
  /** ADMIN_ID ou identifiant de l'utilisateur qui a accordé l'accès. */
  userId: string;
  userLabel: string;
  createdAt: number;
}

/** Personne connectée (interface ou écran de consentement). */
export interface Actor {
  id: string;
  role: "admin" | "user";
  email: string;
  name: string;
}

export interface ConnectionSummary extends Omit<StoredConnection, "secret"> {
  ownerId: string;
  userIds: string[];
  lastUsedAt: number | null;
  grants: { id: string; clientName: string; userId: string; userLabel: string; createdAt: number }[];
  expired: boolean;
  canManage: boolean;
}

const k = {
  conn: (id: string) => `conn:${id}`,
  last: (id: string) => `conn:${id}:last`,
  users: (id: string) => `conn:${id}:users`,
  grants: (id: string) => `conn:${id}:grants`,
  grant: (gid: string) => `grant:${gid}`,
  userConns: (uid: string) => `user:${uid}:conns`,
  owned: (uid: string) => `user:${uid}:owned`,
  all: "conns",
};

const ownerOf = (c: StoredConnection) => c.ownerId ?? ADMIN_ID;

function metadata(config: ConnectionConfig) {
  return { name: displayName(config), type: config.type, readOnly: config.readOnly, database: config.database };
}

export async function createConnection(config: ConnectionConfig, owner: Actor, expiresInDays?: number): Promise<string> {
  const store = getStore();
  const id = randomToken(12);
  const now = Date.now();
  const stored: StoredConnection = {
    id,
    ...metadata(config),
    // Les connexions créées par un administrateur appartiennent au pool commun (attribuable).
    ownerId: owner.role === "admin" ? ADMIN_ID : owner.id,
    createdAt: now,
    updatedAt: now,
    expiresAt: expiresInDays ? now + expiresInDays * 86_400_000 : undefined,
    secret: encrypt(config),
  };
  await store.set(k.conn(id), JSON.stringify(stored));
  await store.sadd(k.all, id);
  if (owner.role === "user") await store.sadd(k.owned(owner.id), id);
  return id;
}

/** Renvoie la connexion, y compris expirée (voir isExpired). */
export async function getConnection(id: string): Promise<StoredConnection | null> {
  const raw = await getStore().get(k.conn(id));
  return raw ? (JSON.parse(raw) as StoredConnection) : null;
}

export const isExpired = (c: StoredConnection) => Boolean(c.expiresAt && c.expiresAt < Date.now());

export const loadConfig = (c: StoredConnection) => decrypt<ConnectionConfig>(c.secret);

/* ------------------------------ Droits d'accès ----------------------------- */

/** Modifier, supprimer, voir la configuration : l'administrateur ou le propriétaire. */
export const canManage = (actor: Pick<Actor, "id" | "role">, c: StoredConnection) =>
  actor.role === "admin" || ownerOf(c) === actor.id;

/** Utiliser la connexion via un assistant : gestionnaire ou utilisateur attribué. */
export async function canUse(actor: Pick<Actor, "id" | "role">, c: StoredConnection): Promise<boolean> {
  return canManage(actor, c) || getStore().sismember(k.users(c.id), actor.id);
}

export const connectionUsers = (connId: string) => getStore().smembers(k.users(connId));

/**
 * Définit les utilisateurs ayant accès à une connexion (administrateur uniquement).
 * Les utilisateurs retirés perdent immédiatement leurs autorisations OAuth.
 */
export async function setConnectionUsers(connId: string, userIds: string[]): Promise<void> {
  const store = getStore();
  const current = new Set(await connectionUsers(connId));
  const next = new Set(userIds);
  for (const uid of next) {
    if (current.has(uid)) continue;
    await store.sadd(k.users(connId), uid);
    await store.sadd(k.userConns(uid), connId);
  }
  for (const uid of current) {
    if (next.has(uid)) continue;
    await store.srem(k.users(connId), uid);
    await store.srem(k.userConns(uid), connId);
    await revokeGrants(connId, (g) => g.userId === uid);
  }
}

/** Connexions possédées par un utilisateur et connexions qui lui sont attribuées. */
export async function userConnectionIds(uid: string): Promise<{ owned: string[]; assigned: string[] }> {
  const store = getStore();
  return { owned: await store.smembers(k.owned(uid)), assigned: await store.smembers(k.userConns(uid)) };
}

/* ------------------------------- Lecture/CRUD ------------------------------ */

export async function updateConnection(id: string, config: ConnectionConfig): Promise<void> {
  const current = await getConnection(id);
  if (!current) throw new Error("Connexion introuvable.");
  const updated: StoredConnection = { ...current, ...metadata(config), updatedAt: Date.now(), secret: encrypt(config) };
  await getStore().set(k.conn(id), JSON.stringify(updated));
}

/** Connexions visibles par la personne connectée (toutes pour l'administrateur). */
export async function listConnections(actor: Actor): Promise<ConnectionSummary[]> {
  const store = getStore();
  let ids: string[];
  if (actor.role === "admin") ids = await store.smembers(k.all);
  else {
    const { owned, assigned } = await userConnectionIds(actor.id);
    ids = [...new Set([...owned, ...assigned])];
  }

  const rows = await store.mget(ids.flatMap((id) => [k.conn(id), k.last(id)]));
  const summaries: ConnectionSummary[] = [];
  for (let i = 0; i < ids.length; i++) {
    const raw = rows[2 * i];
    if (!raw) {
      if (actor.role === "admin") await store.srem(k.all, ids[i]);
      continue;
    }
    const { secret: _secret, ...meta } = JSON.parse(raw) as StoredConnection;
    const manage = canManage(actor, meta as StoredConnection);
    const grants = await listGrants(meta.id);
    summaries.push({
      ...meta,
      ownerId: meta.ownerId ?? ADMIN_ID,
      userIds: actor.role === "admin" ? await connectionUsers(meta.id) : [],
      lastUsedAt: rows[2 * i + 1] ? Number(rows[2 * i + 1]) : null,
      // Un simple utilisateur ne voit que ses propres assistants sur une connexion partagée.
      grants: grants
        .filter((g) => manage || g.userId === actor.id)
        .map(({ id, clientName, userId, userLabel, createdAt }) => ({ id, clientName, userId, userLabel, createdAt })),
      expired: Boolean(meta.expiresAt && meta.expiresAt < Date.now()),
      canManage: manage,
    });
  }
  return summaries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteConnection(id: string): Promise<void> {
  const store = getStore();
  const conn = await getConnection(id);
  await revokeGrants(id);
  for (const uid of await connectionUsers(id)) await store.srem(k.userConns(uid), id);
  if (conn?.ownerId && conn.ownerId !== ADMIN_ID) await store.srem(k.owned(conn.ownerId), id);
  await store.del([k.conn(id), k.last(id), k.grants(id), k.users(id)]);
  await store.srem(k.all, id);
}

export async function touchConnection(id: string): Promise<void> {
  await getStore().set(k.last(id), String(Date.now()));
}

/** Nettoie les données d'un utilisateur supprimé : connexions privées et attributions. */
export async function removeUserFromConnections(uid: string): Promise<void> {
  const store = getStore();
  const { owned, assigned } = await userConnectionIds(uid);
  for (const id of owned) await deleteConnection(id);
  for (const id of assigned) {
    await store.srem(k.users(id), uid);
    await revokeGrants(id, (g) => g.userId === uid);
  }
  await store.del([k.owned(uid), k.userConns(uid)]);
}

/** Révoque toutes les autorisations d'un utilisateur (compte désactivé). */
export async function revokeUserGrants(uid: string): Promise<void> {
  const { owned, assigned } = await userConnectionIds(uid);
  for (const id of new Set([...owned, ...assigned])) await revokeGrants(id, (g) => g.userId === uid);
}

/* ------------------------------ Autorisations ------------------------------ */

/**
 * Crée une autorisation (une par application, utilisateur et connexion : une nouvelle
 * autorisation remplace la précédente). Elle expire si elle n'est pas utilisée pendant `ttlSeconds`.
 */
export async function createGrant(
  connId: string,
  client: { clientId: string; clientName: string },
  actor: Actor,
  ttlSeconds: number,
): Promise<Grant> {
  const store = getStore();
  await revokeGrants(connId, (g) => g.clientId === client.clientId && g.userId === actor.id);
  const grant: Grant = {
    id: randomToken(12),
    connId,
    ...client,
    userId: actor.id,
    userLabel: actor.id === ADMIN_ID ? "Administrateur" : actor.email,
    createdAt: Date.now(),
  };
  await store.set(k.grant(grant.id), JSON.stringify(grant), ttlSeconds);
  await store.sadd(k.grants(connId), grant.id);
  return grant;
}

export async function touchGrant(grant: Grant, ttlSeconds: number): Promise<void> {
  await getStore().set(k.grant(grant.id), JSON.stringify(grant), ttlSeconds);
}

export async function getGrant(gid: string): Promise<Grant | null> {
  const raw = await getStore().get(k.grant(gid));
  if (!raw) return null;
  const grant = JSON.parse(raw) as Grant;
  // Autorisations créées avant la gestion des utilisateurs : rattachées à l'administrateur.
  return { ...grant, userId: grant.userId ?? ADMIN_ID, userLabel: grant.userLabel ?? "Administrateur" };
}

export async function listGrants(connId: string): Promise<Grant[]> {
  const store = getStore();
  const gids = await store.smembers(k.grants(connId));
  const grants: Grant[] = [];
  for (const gid of gids) {
    const grant = await getGrant(gid);
    if (grant) grants.push(grant);
    else await store.srem(k.grants(connId), gid); // autorisation expirée
  }
  return grants;
}

/**
 * Révoque les autorisations d'une connexion (toutes, ou celles qui passent le filtre) :
 * les jetons existants deviennent immédiatement invalides, car ils référencent
 * une autorisation qui n'existe plus.
 */
export async function revokeGrants(connId: string, filter?: (g: Grant) => boolean): Promise<number> {
  const store = getStore();
  const targets = (await listGrants(connId)).filter((g) => !filter || filter(g));
  await store.del(targets.map((g) => k.grant(g.id)));
  for (const g of targets) await store.srem(k.grants(connId), g.id);
  return targets.length;
}

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ADMIN_ID, removeUserFromConnections, revokeUserGrants, userConnectionIds } from "./connections";
import { randomToken, sha256 } from "./crypto";
import { getStore } from "./store";

/**
 * Comptes utilisateurs (stockés dans Redis). L'administrateur, lui, est défini par
 * les variables d'environnement ADMIN_EMAIL (« admin » par défaut) et ADMIN_PASSWORD.
 *
 * Clés : user:{id}, user-email:{email} → id, users (ensemble), invite:{empreinte} → id,
 *        user:{id}:invite (empreinte de l'invitation en cours).
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const INVITE_TTL = 7 * 24 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 10;

export type UserStatus = "invited" | "active" | "disabled";

export interface User {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  passwordHash?: string;
  /** Incrémenté à chaque changement de mot de passe ou désactivation : invalide les sessions. */
  sessionVersion: number;
  createdAt: number;
  lastLoginAt?: number;
}

export interface UserSummary extends Omit<User, "passwordHash" | "sessionVersion"> {
  ownedConnections: number;
  assignedConnections: number;
}

const k = {
  user: (id: string) => `user:${id}`,
  email: (email: string) => `user-email:${email}`,
  invite: (hash: string) => `invite:${hash}`,
  pendingInvite: (id: string) => `user:${id}:invite`,
  all: "users",
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const adminIdentifier = () => normalizeEmail(process.env.ADMIN_EMAIL || "admin");

/* ------------------------------ Mots de passe ------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

// Empreinte factice : le temps de réponse est le même que l'utilisateur existe ou non.
const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [, salt, hash] = (stored ?? DUMMY_HASH).split("$");
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected) && Boolean(stored);
}

export function assertPasswordPolicy(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  if (password.length > 200) throw new Error("Mot de passe trop long.");
}

/* --------------------------------- Lecture -------------------------------- */

export async function getUser(id: string): Promise<User | null> {
  if (id === ADMIN_ID) return null;
  const raw = await getStore().get(k.user(id));
  return raw ? (JSON.parse(raw) as User) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const id = await getStore().get(k.email(normalizeEmail(email)));
  return id ? getUser(id) : null;
}

async function saveUser(user: User): Promise<void> {
  await getStore().set(k.user(user.id), JSON.stringify(user));
}

export async function listUsers(): Promise<UserSummary[]> {
  const store = getStore();
  const ids = await store.smembers(k.all);
  const raws = await store.mget(ids.map(k.user));
  const users: UserSummary[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    const { passwordHash: _h, sessionVersion: _v, ...user } = JSON.parse(raw) as User;
    const { owned, assigned } = await userConnectionIds(user.id);
    users.push({ ...user, ownedConnections: owned.length, assignedConnections: assigned.length });
  }
  return users.sort((a, b) => a.email.localeCompare(b.email));
}

/* -------------------------------- Écriture -------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Crée un compte en attente et renvoie le jeton d'invitation (à transmettre à l'utilisateur). */
export async function createUser(input: { email: unknown; name?: unknown }): Promise<{ user: User; inviteToken: string }> {
  if (typeof input.email !== "string" || !EMAIL_RE.test(input.email.trim())) {
    throw new Error("Adresse e-mail invalide.");
  }
  const email = normalizeEmail(input.email);
  if (email === adminIdentifier()) throw new Error("Cet identifiant est réservé à l'administrateur.");
  if (await getUserByEmail(email)) throw new Error("Un utilisateur existe déjà avec cette adresse.");

  const user: User = {
    id: randomToken(12),
    email,
    name: String(input.name ?? "").trim().slice(0, 80) || email.split("@")[0],
    status: "invited",
    sessionVersion: 1,
    createdAt: Date.now(),
  };
  const store = getStore();
  await saveUser(user);
  await store.set(k.email(email), user.id);
  await store.sadd(k.all, user.id);
  return { user, inviteToken: await createInvite(user.id) };
}

/**
 * Crée un lien d'invitation (ou de réinitialisation du mot de passe) à usage unique.
 * Le lien précédent éventuel devient invalide.
 */
export async function createInvite(userId: string): Promise<string> {
  const store = getStore();
  const previous = await store.get(k.pendingInvite(userId));
  if (previous) await store.del([k.invite(previous)]);
  const token = randomToken(32);
  const hash = sha256(token);
  await store.set(k.invite(hash), userId, INVITE_TTL);
  await store.set(k.pendingInvite(userId), hash, INVITE_TTL);
  return token;
}

export async function readInvite(token: string): Promise<User | null> {
  const userId = await getStore().get(k.invite(sha256(token)));
  const user = userId ? await getUser(userId) : null;
  return user && user.status !== "disabled" ? user : null;
}

/** Définit le mot de passe via le lien d'invitation et active le compte. */
export async function acceptInvite(token: string, password: unknown): Promise<User> {
  assertPasswordPolicy(password);
  const user = await readInvite(token);
  if (!user) throw new Error("Lien d'invitation invalide, expiré ou déjà utilisé.");
  const store = getStore();
  await store.del([k.invite(sha256(token)), k.pendingInvite(user.id)]);
  const updated: User = {
    ...user,
    status: "active",
    passwordHash: await hashPassword(password),
    sessionVersion: user.sessionVersion + 1,
  };
  await saveUser(updated);
  return updated;
}

export async function changePassword(user: User, current: unknown, next: unknown): Promise<User> {
  if (typeof current !== "string" || !(await verifyPassword(current, user.passwordHash))) {
    throw new Error("Mot de passe actuel incorrect.");
  }
  assertPasswordPolicy(next);
  const updated: User = { ...user, passwordHash: await hashPassword(next), sessionVersion: user.sessionVersion + 1 };
  await saveUser(updated);
  return updated;
}

/** Active ou désactive un compte. La désactivation coupe sessions et accès des assistants. */
export async function setUserStatus(id: string, status: "active" | "disabled"): Promise<void> {
  const user = await getUser(id);
  if (!user) throw new Error("Utilisateur introuvable.");
  if (status === "active" && !user.passwordHash) throw new Error("Ce compte n'a pas encore accepté son invitation.");
  await saveUser({ ...user, status, sessionVersion: user.sessionVersion + 1 });
  if (status === "disabled") await revokeUserGrants(id);
}

export async function renameUser(id: string, name: unknown): Promise<void> {
  const user = await getUser(id);
  if (!user) throw new Error("Utilisateur introuvable.");
  await saveUser({ ...user, name: String(name ?? "").trim().slice(0, 80) || user.name });
}

export async function touchLogin(user: User): Promise<void> {
  await saveUser({ ...user, lastLoginAt: Date.now() });
}

/** Supprime le compte, ses connexions privées et ses accès. */
export async function deleteUser(id: string): Promise<void> {
  const user = await getUser(id);
  if (!user) return;
  await removeUserFromConnections(id);
  const store = getStore();
  const invite = await store.get(k.pendingInvite(id));
  await store.del([k.user(id), k.email(user.email), k.pendingInvite(id), ...(invite ? [k.invite(invite)] : [])]);
  await store.srem(k.all, id);
}

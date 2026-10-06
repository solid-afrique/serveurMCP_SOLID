import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Chiffrement AES-256-GCM des secrets stockés (paramètres de connexion).
 * Changer ENCRYPTION_KEY rend illisibles toutes les connexions enregistrées.
 */

const IV_LEN = 12;
const TAG_LEN = 16;

function secret(): string {
  const value = process.env.ENCRYPTION_KEY;
  if (!value || value.length < 16) {
    throw new Error(
      "La variable d'environnement ENCRYPTION_KEY est absente ou trop courte (16 caractères minimum).",
    );
  }
  return value;
}

const key = () => createHash("sha256").update(secret()).digest();

export function encrypt(value: unknown): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decrypt<T>(payload: string): T {
  const buf = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, IV_LEN));
  decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
  const plain = Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

/** Jeton aléatoire opaque (identifiants, codes, jetons d'accès). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Les jetons ne sont jamais stockés en clair : on indexe leur empreinte. */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

export function hmac(value: string, purpose: string): string {
  return createHmac("sha256", `${secret()}:${purpose}`).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

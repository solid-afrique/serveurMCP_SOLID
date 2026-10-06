import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { connectionSchema, type ConnectionConfig } from "./config";

/**
 * Les paramètres de connexion ne sont stockés nulle part côté serveur :
 * ils sont chiffrés (AES-256-GCM) dans un jeton placé dans l'URL MCP.
 * Changer ENCRYPTION_KEY invalide tous les jetons émis.
 */

const IV_LEN = 12;
const TAG_LEN = 16;

export class TokenError extends Error {}

function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "La variable d'environnement ENCRYPTION_KEY est absente ou trop courte (16 caractères minimum).",
    );
  }
  return createHash("sha256").update(secret).digest();
}

interface TokenPayload {
  v: 1;
  c: ConnectionConfig;
  iat: number;
  exp?: number;
}

export function sealConfig(config: ConnectionConfig, expiresInDays?: number): string {
  const payload: TokenPayload = {
    v: 1,
    c: config,
    iat: Date.now(),
    exp: expiresInDays ? Date.now() + expiresInDays * 86_400_000 : undefined,
  };
  const plain = deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openToken(token: string): { config: ConnectionConfig; expiresAt?: number } {
  const buf = Buffer.from(token, "base64url");
  if (buf.length <= IV_LEN + TAG_LEN) throw new TokenError("Jeton invalide.");

  let plain: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, IV_LEN));
    decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
    plain = Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]);
  } catch {
    throw new TokenError("Jeton invalide ou clé de chiffrement modifiée.");
  }

  const payload = JSON.parse(inflateRawSync(plain).toString("utf8")) as TokenPayload;
  if (payload.exp && Date.now() > payload.exp) throw new TokenError("Jeton expiré.");
  return { config: connectionSchema.parse(payload.c), expiresAt: payload.exp };
}

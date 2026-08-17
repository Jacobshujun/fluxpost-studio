import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { appConfig } from "./config";

const algorithm = "aes-256-gcm";

function getKey() {
  const encoded = appConfig.dongchediCookieEncryptionKey.trim();
  if (!encoded) throw new Error("DONGCHEDI_COOKIE_ENCRYPTION_KEY is required when a Dongchedi Cookie is supplied.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("DONGCHEDI_COOKIE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptDongchediCookie(cookie: string) {
  const value = cookie.trim();
  if (!value) return undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptDongchediCookie(envelope?: string) {
  if (!envelope) return undefined;
  const [ivValue, tagValue, ciphertextValue] = envelope.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted Dongchedi Cookie envelope.");
  const decipher = createDecipheriv(algorithm, getKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

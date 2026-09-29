import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  return createHash("sha256")
    .update(process.env.ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? "fluks-dev-secret-change-me-please-0123456789")
    .digest();
}

/** Krypterer hemmeligheder (API-nøgler, tokens) før de gemmes i databasen. */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `enc:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(value: string) {
  if (!value?.startsWith("enc:")) return value;
  const [, iv, tag, data] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv!, "base64"));
  decipher.setAuthTag(Buffer.from(tag!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data!, "base64")), decipher.final()]).toString("utf8");
}

export function sha256(buf: Buffer | string) {
  return createHash("sha256").update(buf).digest("hex");
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

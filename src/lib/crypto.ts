// ============================================================
// Secret encryption at rest — SERVER ONLY.
//
// AES-256-GCM using APP_ENCRYPTION_KEY (32 bytes, base64). The stored blob is
// base64(iv[12] || authTag[16] || cipher).
//
// No live caller: the only secret ever stored this way was a tenant's
// Fleetbase API key, and nothing reaches Fleetbase any more. Kept because the
// `tenant_secrets` rows are still in the database — deleting this module is
// what makes them permanently unreadable, so it goes when the table does.
// ============================================================

import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const IV_LEN = 12;
const TAG_LEN = 16;

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY ?? "";
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
    );
  }
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** True when a usable encryption key is configured. */
export function isEncryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

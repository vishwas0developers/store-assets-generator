import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Shared AES-256-GCM encrypt-at-rest helper. One key file (`.auth/.secret.key`)
 * backs every secret store in the application (demo credentials, AI provider
 * keys) — same key, same cipher, so there's exactly one place that can leak
 * or rotate it, not one per store.
 */

const AUTH_DIR = path.join(process.cwd(), ".auth");
const KEY_PATH = path.join(AUTH_DIR, ".secret.key");

export function ensureAuthDir(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function getOrCreateKey(): Buffer {
  ensureAuthDir();
  if (fs.existsSync(KEY_PATH)) {
    return fs.readFileSync(KEY_PATH);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key);
  try {
    fs.chmodSync(KEY_PATH, 0o600);
  } catch {
    // best-effort on Windows
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // ivHex:tagHex:cipherHex — self-contained, no separate nonce store needed
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const key = getOrCreateKey();
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return dec.toString("utf-8");
  } catch {
    // Key rotated/missing since this was written — treat as "not set",
    // never crash. The operator re-enters the secret via the UI/CLI.
    return "";
  }
}

export const AUTH_DIR_PATH = AUTH_DIR;

import fs from "fs";
import path from "path";
import { ensureAuthDir, encrypt, decrypt } from "../auth/crypto.js";

/**
 * Per-provider API key store — same AES-256-GCM-at-rest pattern as the demo
 * auth credential store (src/auth/credentials.ts), keyed by provider id
 * instead of a single email/password pair. Local providers (Ollama,
 * LM Studio) legitimately have no key at all.
 */

const KEYS_PATH = path.join(process.cwd(), ".auth", "ai-keys.json");

interface OnDiskRecord {
  [providerId: string]: { keyEnc: string; updatedAt: string };
}

function readRecord(): OnDiskRecord {
  if (!fs.existsSync(KEYS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(KEYS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeRecord(record: OnDiskRecord): void {
  ensureAuthDir();
  fs.writeFileSync(KEYS_PATH, JSON.stringify(record, null, 2), "utf-8");
}

function envVarName(providerId: string): string {
  return `SAG_AI_KEY_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/** Env var (SAG_AI_KEY_<PROVIDER>) takes precedence over the encrypted file. */
export function getProviderKey(providerId: string): string | null {
  const envKey = process.env[envVarName(providerId)];
  if (envKey) return envKey;

  const record = readRecord();
  const entry = record[providerId];
  if (!entry) return null;
  const key = decrypt(entry.keyEnc);
  return key || null;
}

export function setProviderKey(providerId: string, apiKey: string): void {
  const record = readRecord();
  record[providerId] = { keyEnc: encrypt(apiKey), updatedAt: new Date().toISOString() };
  writeRecord(record);
}

export function clearProviderKey(providerId: string): void {
  const record = readRecord();
  delete record[providerId];
  writeRecord(record);
}

/** Presence-only — never returns the key value or ciphertext. */
export function hasProviderKey(providerId: string): boolean {
  if (process.env[envVarName(providerId)]) return true;
  const record = readRecord();
  return Boolean(record[providerId]?.keyEnc);
}

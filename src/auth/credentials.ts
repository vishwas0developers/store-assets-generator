import fs from "fs";
import path from "path";
import { ensureAuthDir, encrypt, decrypt } from "./crypto.js";

/**
 * Encrypted-at-rest credential store for demo/test account auth.
 * Demo passwords rotate frequently and access expires — this store lets
 * them be updated via CLI/UI/env var without ever touching code.
 *
 * Layout (mirrors the proven pattern in 5.demo-assets-generator's
 * config.py, ported from Fernet to Node's built-in AES-256-GCM so no
 * extra dependency is needed):
 *   .auth/.secret.key        — local encryption key, gitignored, 600 perms
 *   .auth/credentials.json   — { email, passwordEnc, updatedAt }
 *
 * Resolution order (later wins): credentials.json < env vars.
 * Env vars are for CI/one-off overrides; the file is the day-to-day store.
 */

const CREDENTIALS_PATH = path.join(process.cwd(), ".auth", "credentials.json");

export interface StoredCredentials {
  email: string;
  password: string;
  updatedAt: string;
}

export interface CredentialStatus {
  email: string;
  passwordSet: boolean;
  updatedAt: string | null;
  source: "env" | "file" | "none";
}

interface OnDiskRecord {
  email: string;
  passwordEnc: string;
  updatedAt: string;
}

function readRecord(): OnDiskRecord | null {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/** Save credentials. Blank/omitted password keeps the previously saved one —
 *  this is what lets a UI show masked dots instead of forcing re-entry. */
export function setCredentials(email: string, password?: string): void {
  ensureAuthDir();
  const existing = readRecord();
  const passwordEnc = password ? encrypt(password) : existing?.passwordEnc ?? "";
  const record: OnDiskRecord = { email, passwordEnc, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(record, null, 2), "utf-8");
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDENTIALS_PATH)) fs.unlinkSync(CREDENTIALS_PATH);
}

/** Resolves the active credentials: env vars override the encrypted file. */
export function resolveCredentials(): StoredCredentials | null {
  const envEmail = process.env.SAG_AUTH_EMAIL;
  const envPassword = process.env.SAG_AUTH_PASSWORD;
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword, updatedAt: "env" };
  }

  const record = readRecord();
  if (!record || !record.email || !record.passwordEnc) return null;
  const password = decrypt(record.passwordEnc);
  if (!password) return null;
  return { email: record.email, password, updatedAt: record.updatedAt };
}

/** Presence-only status — never returns the password value or ciphertext. */
export function getCredentialStatus(): CredentialStatus {
  if (process.env.SAG_AUTH_EMAIL && process.env.SAG_AUTH_PASSWORD) {
    return { email: process.env.SAG_AUTH_EMAIL, passwordSet: true, updatedAt: null, source: "env" };
  }
  const record = readRecord();
  if (!record) return { email: "", passwordSet: false, updatedAt: null, source: "none" };
  return {
    email: record.email,
    passwordSet: Boolean(record.passwordEnc),
    updatedAt: record.updatedAt,
    source: "file",
  };
}

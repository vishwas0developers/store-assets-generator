import { encrypt, decrypt } from "./crypto.js";
import { readEnvValues, saveEnvValues } from "../config/env.js";

/**
 * Demo-account credential persistence — env-var-only, matching
 * 5.demo-assets-generator/app/config.py exactly: the email is plaintext
 * (not a secret), the password is Fernet ciphertext in .env
 * (DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC there); this project uses the same
 * shape with Node's built-in AES-256-GCM instead of Fernet
 * (src/auth/crypto.ts), keyed by the local, gitignored .auth/.secret.key.
 *
 * No separate credentials file — everything demo-account-auth needs lives
 * in .env as one of exactly two variables:
 *   DEMO_GEN_DEMO_ACCOUNT_EMAIL          — plaintext
 *   DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC   — ciphertext, decryptable only
 *                                          together with .auth/.secret.key
 */

const ENV_KEYS = ["DEMO_GEN_DEMO_ACCOUNT_EMAIL", "DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC"];

export interface StoredCredentials {
  email: string;
  password: string;
}

export interface CredentialStatus {
  email: string;
  passwordSet: boolean;
}

/** Save credentials. Blank/omitted password keeps the previously saved one —
 *  this is what lets a UI show masked dots instead of forcing re-entry. */
export function setCredentials(email: string, password?: string): void {
  const values: Record<string, string> = { DEMO_GEN_DEMO_ACCOUNT_EMAIL: email };
  if (password) values.DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC = encrypt(password);
  saveEnvValues(values);
}

export function clearCredentials(): void {
  saveEnvValues({ DEMO_GEN_DEMO_ACCOUNT_EMAIL: "", DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC: "" });
}

/** Resolves the active credentials from .env. */
export function resolveCredentials(): StoredCredentials | null {
  const { DEMO_GEN_DEMO_ACCOUNT_EMAIL: email, DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC: passwordEnc } = readEnvValues(ENV_KEYS);
  if (!email || !passwordEnc) return null;
  const password = decrypt(passwordEnc);
  if (!password) return null;
  return { email, password };
}

/** Presence-only status — never returns the password value or ciphertext. */
export function getCredentialStatus(): CredentialStatus {
  const { DEMO_GEN_DEMO_ACCOUNT_EMAIL: email, DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC: passwordEnc } = readEnvValues(ENV_KEYS);
  return { email, passwordSet: Boolean(passwordEnc) };
}

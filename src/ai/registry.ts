import fs from "fs";
import path from "path";
import { hasProviderKey } from "./keystore.js";

/**
 * Provider registry + model inventory — config data only, no secrets (keys
 * live in keystore.ts). Mirrors the two-table split proven in the reference
 * OCR tool (engines / saved_models): a provider is configured once, many
 * models can be attached to it, and discovery proposes while the user
 * curates what actually gets saved. See docs/AI-PROVIDERS.md §2-3.
 */

export type AdapterKind = "openai-compatible" | "anthropic" | "gemini";

export interface Provider {
  id: string;
  adapter: AdapterKind;
  baseUrl: string;
  enabled: boolean;
  /** true if this adapter kind requires an API key (local providers don't) */
  requiresKey: boolean;
}

export interface ModelEntry {
  provider: string;
  modelId: string;
  displayName: string;
  vision: boolean;
}

interface ProvidersFile {
  providers: Provider[];
}

interface ModelsFile {
  models: ModelEntry[];
  /** id of the globally selected model, used when a task doesn't override it */
  defaultModel: { provider: string; modelId: string } | null;
}

const CONFIG_DIR = path.join(process.cwd(), "config");
const PROVIDERS_PATH = path.join(CONFIG_DIR, "providers.json");
const MODELS_PATH = path.join(CONFIG_DIR, "models.json");

const DEFAULT_PROVIDERS: Provider[] = [
  { id: "openai", adapter: "openai-compatible", baseUrl: "https://api.openai.com/v1", enabled: true, requiresKey: true },
  { id: "openrouter", adapter: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", enabled: false, requiresKey: true },
  { id: "groq", adapter: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", enabled: false, requiresKey: true },
  { id: "deepseek", adapter: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", enabled: false, requiresKey: true },
  { id: "ollama", adapter: "openai-compatible", baseUrl: "http://localhost:11434/v1", enabled: true, requiresKey: false },
  { id: "lm-studio", adapter: "openai-compatible", baseUrl: "http://localhost:1234/v1", enabled: false, requiresKey: false },
  { id: "anthropic", adapter: "anthropic", baseUrl: "https://api.anthropic.com/v1", enabled: true, requiresKey: true },
  { id: "gemini", adapter: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", enabled: true, requiresKey: true },
];

function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureConfigDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function loadProvidersFile(): ProvidersFile {
  const existing = readJson<ProvidersFile | null>(PROVIDERS_PATH, null);
  if (existing) return existing;
  const seeded: ProvidersFile = { providers: DEFAULT_PROVIDERS };
  writeJson(PROVIDERS_PATH, seeded);
  return seeded;
}

function loadModelsFile(): ModelsFile {
  return readJson<ModelsFile>(MODELS_PATH, { models: [], defaultModel: null });
}

export function listProviders(): Array<Provider & { keySet: boolean }> {
  return loadProvidersFile().providers.map((p) => ({ ...p, keySet: hasProviderKey(p.id) }));
}

export function getProvider(id: string): Provider | null {
  return loadProvidersFile().providers.find((p) => p.id === id) ?? null;
}

/** Upsert a provider's config (not its key). Adding a brand-new
 *  OpenAI-compatible endpoint needs only this — no code change. */
export function upsertProvider(
  id: string,
  updates: { adapter?: AdapterKind; baseUrl?: string; enabled?: boolean; requiresKey?: boolean },
): void {
  const file = loadProvidersFile();
  const idx = file.providers.findIndex((p) => p.id === id);
  if (idx === -1) {
    file.providers.push({
      id,
      adapter: updates.adapter ?? "openai-compatible",
      baseUrl: updates.baseUrl ?? "",
      enabled: updates.enabled ?? true,
      requiresKey: updates.requiresKey ?? true,
    });
  } else {
    // Drop explicit `undefined` values before spreading — an object spread
    // overwrites existing fields with `undefined` if the source object has
    // the key at all (even unset), which would otherwise wipe out a
    // provider's adapter/baseUrl/enabled/requiresKey just from a caller
    // that only meant to set its API key.
    const definedUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    file.providers[idx] = { ...file.providers[idx], ...definedUpdates };
  }
  writeJson(PROVIDERS_PATH, file);
}

export function deleteProvider(id: string): void {
  const file = loadProvidersFile();
  file.providers = file.providers.filter((p) => p.id !== id);
  writeJson(PROVIDERS_PATH, file);

  const modelsFile = loadModelsFile();
  modelsFile.models = modelsFile.models.filter((m) => m.provider !== id);
  if (modelsFile.defaultModel?.provider === id) modelsFile.defaultModel = null;
  writeJson(MODELS_PATH, modelsFile);
}

export function listModels(): ModelEntry[] {
  return loadModelsFile().models;
}

/** Discovery proposes models; this is the curation step that actually
 *  saves the ones the user picked, with a friendly display name. */
export function saveModels(entries: ModelEntry[]): void {
  const file = loadModelsFile();
  for (const entry of entries) {
    const idx = file.models.findIndex((m) => m.provider === entry.provider && m.modelId === entry.modelId);
    if (idx === -1) file.models.push(entry);
    else file.models[idx] = entry;
  }
  writeJson(MODELS_PATH, file);
}

export function deleteModel(provider: string, modelId: string): void {
  const file = loadModelsFile();
  file.models = file.models.filter((m) => !(m.provider === provider && m.modelId === modelId));
  if (file.defaultModel?.provider === provider && file.defaultModel.modelId === modelId) {
    file.defaultModel = null;
  }
  writeJson(MODELS_PATH, file);
}

export function getDefaultModel(): { provider: string; modelId: string } | null {
  return loadModelsFile().defaultModel;
}

export function setDefaultModel(provider: string, modelId: string): void {
  const file = loadModelsFile();
  file.defaultModel = { provider, modelId };
  writeJson(MODELS_PATH, file);
}

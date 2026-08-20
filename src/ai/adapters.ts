import { type Provider } from "./registry.js";
import { getProviderKey } from "./keystore.js";

/**
 * Dynamic model discovery per provider adapter — three adapters cover every
 * provider in the registry (openai-compatible handles OpenAI, OpenRouter,
 * Groq, DeepSeek, Ollama, LM Studio via one client; Anthropic and Gemini get
 * thin adapters because their request shape genuinely differs).
 *
 * Contract, ported deliberately from the reference OCR tool
 * (fetch_models_for_provider): return a model list on success, or
 * { error, requiresApiKey, message } — never throw, never return an opaque
 * failure. A missing key must read as "add it in Settings", not a stack trace.
 */

export interface DiscoveredModel {
  modelId: string;
  displayName: string;
  vision: boolean;
}

export interface DiscoveryError {
  error: true;
  requiresApiKey: boolean;
  message: string;
}

export type DiscoveryResult = DiscoveredModel[] | DiscoveryError;

function isError(result: DiscoveryResult): result is DiscoveryError {
  return !Array.isArray(result);
}

export { isError as isDiscoveryError };

async function fetchOpenAiCompatible(provider: Provider, apiKey: string | null): Promise<DiscoveryResult> {
  try {
    const resp = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        return { error: true, requiresApiKey: true, message: `Rejected credentials for '${provider.id}' (HTTP ${resp.status}).` };
      }
      return { error: true, requiresApiKey: false, message: `${provider.id} returned HTTP ${resp.status}.` };
    }
    const body = (await resp.json()) as { data?: Array<{ id: string }> };
    const models = body.data ?? [];
    return models.map((m) => ({ modelId: m.id, displayName: m.id, vision: /vision|4o|gpt-5|claude|gemini/i.test(m.id) }));
  } catch (e) {
    return { error: true, requiresApiKey: false, message: `Could not reach ${provider.baseUrl}: ${(e as Error).message}` };
  }
}

async function fetchAnthropic(provider: Provider, apiKey: string | null): Promise<DiscoveryResult> {
  if (!apiKey) {
    return { error: true, requiresApiKey: true, message: "API key for Anthropic is not configured — add it in Settings." };
  }
  try {
    const resp = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      if (resp.status === 401) {
        return { error: true, requiresApiKey: true, message: "Anthropic rejected the API key." };
      }
      return { error: true, requiresApiKey: false, message: `Anthropic returned HTTP ${resp.status}.` };
    }
    const body = (await resp.json()) as { data?: Array<{ id: string; display_name?: string }> };
    const models = body.data ?? [];
    return models.map((m) => ({ modelId: m.id, displayName: m.display_name ?? m.id, vision: true }));
  } catch (e) {
    return { error: true, requiresApiKey: false, message: `Could not reach Anthropic: ${(e as Error).message}` };
  }
}

async function fetchGemini(provider: Provider, apiKey: string | null): Promise<DiscoveryResult> {
  if (!apiKey) {
    return { error: true, requiresApiKey: true, message: "API key for Gemini is not configured — add it in Settings." };
  }
  try {
    const resp = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
        return { error: true, requiresApiKey: true, message: "Gemini rejected the API key." };
      }
      return { error: true, requiresApiKey: false, message: `Gemini returned HTTP ${resp.status}.` };
    }
    const body = (await resp.json()) as {
      models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>;
    };
    const models = (body.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent"));
    return models.map((m) => ({
      modelId: m.name.replace(/^models\//, ""),
      displayName: m.displayName ?? m.name,
      vision: true,
    }));
  } catch (e) {
    return { error: true, requiresApiKey: false, message: `Could not reach Gemini: ${(e as Error).message}` };
  }
}

export async function fetchModelsForProvider(provider: Provider): Promise<DiscoveryResult> {
  const apiKey = getProviderKey(provider.id);
  if (provider.requiresKey && !apiKey) {
    return {
      error: true,
      requiresApiKey: true,
      message: `API key for ${provider.id} is not configured. Add it in Settings.`,
    };
  }

  switch (provider.adapter) {
    case "openai-compatible":
      return fetchOpenAiCompatible(provider, apiKey);
    case "anthropic":
      return fetchAnthropic(provider, apiKey);
    case "gemini":
      return fetchGemini(provider, apiKey);
    default:
      return { error: true, requiresApiKey: false, message: `Unknown adapter '${provider.adapter}'.` };
  }
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  modelCount?: number;
  reason?: string;
}

export async function testProvider(provider: Provider): Promise<ProviderTestResult> {
  const start = Date.now();
  const result = await fetchModelsForProvider(provider);
  const latencyMs = Date.now() - start;
  if (isError(result)) {
    return { ok: false, latencyMs, reason: result.message };
  }
  return { ok: true, latencyMs, modelCount: result.length };
}

import { getProvider, getDefaultModel } from "./registry.js";
import { getProviderKey } from "./keystore.js";

/**
 * Minimal text completion across the same three adapters discovery uses
 * (see adapters.ts). Only used by the AI-assist buttons in the mockup/scene
 * steps — copy generation, nothing else.
 *
 * ponytail: no streaming, no tool use, no retry. Add when a step needs more
 * than a single short completion.
 */
export async function chat(prompt: string, model?: { provider: string; modelId: string }): Promise<string> {
  const target = model ?? getDefaultModel();
  if (!target) throw new Error("No AI model configured — open Settings → AI Providers and set a default model.");

  const provider = getProvider(target.provider);
  if (!provider) throw new Error(`Unknown provider '${target.provider}'.`);
  const apiKey = getProviderKey(provider.id);
  if (provider.requiresKey && !apiKey) throw new Error(`API key for ${provider.id} is not configured.`);

  const base = provider.baseUrl.replace(/\/$/, "");
  const timeout = AbortSignal.timeout(60_000);

  if (provider.adapter === "gemini") {
    const resp = await fetch(`${base}/models/${target.modelId}:generateContent?key=${encodeURIComponent(apiKey!)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: timeout,
    });
    if (!resp.ok) throw new Error(`Gemini returned HTTP ${resp.status}: ${await resp.text()}`);
    const body: any = await resp.json();
    return body.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  }

  if (provider.adapter === "anthropic") {
    const resp = await fetch(`${base}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: target.modelId, max_tokens: 2048, messages: [{ role: "user", content: prompt }] }),
      signal: timeout,
    });
    if (!resp.ok) throw new Error(`Anthropic returned HTTP ${resp.status}: ${await resp.text()}`);
    const body: any = await resp.json();
    return body.content?.map((c: any) => c.text ?? "").join("") ?? "";
  }

  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model: target.modelId, messages: [{ role: "user", content: prompt }] }),
    signal: timeout,
  });
  if (!resp.ok) throw new Error(`${provider.id} returned HTTP ${resp.status}: ${await resp.text()}`);
  const body: any = await resp.json();
  return body.choices?.[0]?.message?.content ?? "";
}

/** Parse a JSON array out of an LLM reply that may be fenced or chatty. */
export function extractJsonArray(text: string): any[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`AI reply contained no JSON array: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

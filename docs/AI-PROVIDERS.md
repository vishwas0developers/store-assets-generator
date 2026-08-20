# Multi-Provider AI Layer

**Companion documents:** [`PRD.md`](../PRD.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`AUTHENTICATION.md`](./AUTHENTICATION.md)

**Reference implementation:** `D:\AI_Tools\1-Apps\Flask_Bot_Manager\App_Tools\ocr_for_documents` — a working multi-provider Vision-LLM tool whose provider/model/prompt management is the model for this design.

---

## 1. Decision Reversal

Earlier drafts put **no AI in the engine** — the agent wrote all copy and passed it in. That is now reversed: **APIs, prompts, and generation logic live inside the tool.** The agent controls and executes the workflow; the tool owns the intelligence.

- **The tool works standalone.** `store-assets generate --url X` produces titles and feature copy with no agent attached.
- **Prompts become versioned product assets**, tuned once and shipped.
- **Consistent output** across agents, machines, and runs.

**What survives from the old boundary:** rendering stays deterministic. AI runs as a *content stage* whose output is **persisted into the Project Document**. Re-rendering reads the document and calls no API.

```
capture → [AI content stage] → Project Document → deterministic render
                                      ↑
                          edit by hand or agent; re-render never re-generates
```

---

## 2. Reference Analysis — `ocr_for_documents`

A Flask tool using Vision LLMs as OCR engines. Its provider management is more capable than a flat config block, and directly applicable.

### 2.1 What it does

| Element | Implementation |
|---|---|
| **Provider registry** | `engines` table: `engine_name` (PK), `api_key` (encrypted), `endpoint`, `max_tokens` |
| **Model inventory** | `saved_models` table: `engine_name` FK, `model_id`, `display_name`, `is_default`, `UNIQUE(engine_name, model_id)` |
| **Dynamic model discovery** | `GET /fetch-models/<provider>` queries the provider's live API |
| **Prompt library** | `ocr_prompts` table: named templates with `{{LANGUAGE}}` / `{{CUSTOM_PROMPT}}` placeholders, `is_default`, full CRUD |
| **Key encryption** | Fernet; key from `OCR_APP_SECRET` env var **or** a local `.ocr_key` file |
| **Seeded defaults** | `DEFAULT_ENDPOINTS` for gemini / openai / ollama / lm_studio, inserted without keys |
| **Provider dispatch** | `ocr_processor.py` routes to the correct client per provider |
| **Per-job selection** | Each job carries its own `provider` + `model` + `prompt_id` |
| **Schema migrations** | Handles `is_active` vs `is_default` column drift across versions |
| **Diagnostics** | Every run writes raw LLM output + a diagnostic markdown file |

### 2.2 The five patterns worth taking

1. **Provider registry separate from model inventory.** Configure a provider once; attach many models to it. A flat `provider + model` config cannot express "three OpenAI models and two local Ollama models, all available."

2. **Dynamic model discovery with graceful degradation.** `fetch_models_for_provider` returns either a model list *or* `{error, requires_api_key, message}` — never a bare failure. Missing keys produce **"API key for X is not configured. Please add it in Settings → API Keys"**, which tells the user exactly what to do.

3. **Curated inventory, not raw API output.** Providers return dozens of irrelevant models. The user *saves* the ones they want into `saved_models` with a friendly `display_name`. Discovery proposes; the user curates.

4. **Prompts as first-class database records** with placeholders and a default flag — editable in the UI, not buried in code.

5. **Key from env var OR local file.** `OCR_APP_SECRET` takes precedence, file is the fallback. CI supplies the env var; a developer machine just works.

### 2.3 What we change

| Element | Change | Why |
|---|---|---|
| SQLite | **JSON store** (`config/providers.json`, `config/models.json`, `prompts/`) | Tens of records, not thousands. No native dependency, git-diffable, hand-editable. `node:sqlite` / `better-sqlite3` is the upgrade path if it ever grows |
| Fernet | **AES-256-GCM** via Node `crypto` | Same authenticated encryption, zero dependencies. Shares the store from [`AUTHENTICATION.md`](./AUTHENTICATION.md) §4.2 |
| Per-job model | **Per-task model** | See §4 — a genuine improvement over the reference |
| Gemini SDK | **HTTP adapter** | Avoids a per-provider SDK; see §3 |

---

## 3. Provider Architecture

**Lazy default: one OpenAI-compatible HTTP client.** OpenAI, OpenRouter, Groq, DeepSeek, Together, Ollama, and LM Studio all speak that schema — one `fetch` implementation covers them via a base-URL change. Anthropic and Gemini get thin adapters only because their request shape genuinely differs.

Three adapters total. No per-provider SDKs, no LangChain.

```
ProviderAdapter (interface)
├── openai-compatible   → OpenAI · OpenRouter · Groq · DeepSeek · Together · Ollama · LM Studio
├── anthropic           → Messages API
└── gemini              → generativelanguage v1beta

  chat(messages, opts) · listModels() · supportsVision()
```

Adding a provider that speaks the OpenAI schema requires **no code** — only a registry entry with a base URL.

### 3.1 Provider registry — `config/providers.json`

```jsonc
{
  "providers": [
    { "id": "openai",    "adapter": "openai-compatible", "baseUrl": "https://api.openai.com/v1",     "keyRef": "openai",    "enabled": true },
    { "id": "openrouter","adapter": "openai-compatible", "baseUrl": "https://openrouter.ai/api/v1",  "keyRef": "openrouter","enabled": true },
    { "id": "groq",      "adapter": "openai-compatible", "baseUrl": "https://api.groq.com/openai/v1","keyRef": "groq",      "enabled": false },
    { "id": "ollama",    "adapter": "openai-compatible", "baseUrl": "http://localhost:11434/v1",     "keyRef": null,        "enabled": true },
    { "id": "lm-studio", "adapter": "openai-compatible", "baseUrl": "http://localhost:1234/v1",      "keyRef": null,        "enabled": false },
    { "id": "anthropic", "adapter": "anthropic",         "baseUrl": "https://api.anthropic.com/v1",  "keyRef": "anthropic", "enabled": true },
    { "id": "gemini",    "adapter": "gemini",            "baseUrl": "https://generativelanguage.googleapis.com/v1beta", "keyRef": "gemini", "enabled": true }
  ]
}
```

Seeded on first run exactly as the reference seeds `DEFAULT_ENDPOINTS` — endpoints present, keys empty. `keyRef` points at the encrypted store; **no key value ever appears in this file.** Local providers need no key at all.

### 3.2 Model inventory — `config/models.json`

```jsonc
{
  "models": [
    { "provider": "openai",    "modelId": "gpt-4o-mini",              "displayName": "GPT-4o mini",   "vision": true,  "default": true },
    { "provider": "openai",    "modelId": "gpt-4o",                   "displayName": "GPT-4o",        "vision": true },
    { "provider": "anthropic", "modelId": "claude-sonnet-4-20250514", "displayName": "Claude Sonnet", "vision": true },
    { "provider": "gemini",    "modelId": "gemini-2.0-flash",         "displayName": "Gemini Flash",  "vision": true },
    { "provider": "ollama",    "modelId": "llama3.2-vision",          "displayName": "Llama Vision",  "vision": true }
  ]
}
```

Unique on `(provider, modelId)`, mirroring the reference constraint. Populated by discovery, curated by the user.

### 3.3 Discovery

```
GET /api/ai/providers/:id/fetch-models
  → { models: [{ modelId, displayName, vision }] }
  → { error: true, requiresApiKey: true, message: "API key for OpenAI is not configured…" }
```

Adopts the reference's graceful-degradation contract exactly: a missing key is a **actionable message**, never an exception. The UI shows discovered models with checkboxes; ticking one saves it to the inventory.

---

## 4. Per-Task Model Selection

The reference selects a provider and model **per job**. This project has several distinct AI tasks with genuinely different requirements, so selection is **per task**, with a global default.

```jsonc
{
  "defaultModel": { "provider": "openai", "modelId": "gpt-4o-mini" },
  "tasks": {
    "analyze-screen":    { "provider": "openai",    "modelId": "gpt-4o",       "requiresVision": true },
    "feature-copy":      { "provider": "anthropic", "modelId": "claude-sonnet-4-20250514" },
    "video-title":       { "provider": "groq",      "modelId": "llama-3.3-70b" },
    "scene-narrative":   null,
    "review-asset":      { "provider": "gemini",    "modelId": "gemini-2.0-flash", "requiresVision": true }
  }
}
```

`null` falls back to `defaultModel`. This matters practically: screen analysis needs vision and quality, video titles are short text where a fast cheap model is fine, and review benefits from a *different* model than the one that wrote the copy — a second opinion rather than the same model grading its own work.

Tasks declaring `requiresVision` refuse a non-vision model at selection time with a clear message, rather than failing mid-run.

Every surface — UI, CLI (`--provider` / `--model`), MCP (`generate_*` tool args) — can override per call.

---

## 5. Prompt Library

`prompts/` ships as editable files (front-matter + `{{placeholders}}`), following the reference's prompt-library concept without putting them in a database:

| Prompt | Produces |
|---|---|
| `analyze-screen` | What this screen actually does, from screenshot + source + route |
| `feature-copy` | Headline + description + CTA per screen |
| `video-title` | Video title, subtitle, store short description |
| `scene-narrative` | Scene order and pacing across screens |
| `review-asset` | Critique of generated output for the iterate loop |

Placeholders: `{{APP_NAME}}`, `{{SCREEN_ROUTE}}`, `{{SOURCE_CONTEXT}}`, `{{UI_LABELS}}`, `{{CUSTOM_PROMPT}}`, `{{TONE}}`, `{{LANGUAGE}}`.

User overrides in `prompts/` beat built-ins — same resolution order as templates. **The grounding rule is baked into every shipped prompt:** describe only what is evidenced in the screenshot or source; omit rather than guess. This is the guardrail against invented features, and it belongs in the shipped prompt rather than in each agent's discretion.

---

## 6. Web UI — Settings → AI

Following the reference's Settings layout, in the same local workflow UI (`store-assets ui`, loopback only). Fully usable manually, sharing the same API as CLI and MCP.

**Providers tab** — table of providers with enabled toggle, endpoint (editable), API key (masked, **blank = keep existing**), Test button, Add Custom Provider (id + base URL + adapter).

**Models tab** — provider dropdown → **Fetch Models** → checkbox list of discovered models → Save selected. Shows saved inventory with display name, vision badge, set-default, delete.

**Tasks tab** — one row per AI task, each with a provider+model dropdown drawn from the inventory, defaulting to "Use default".

**Prompts tab** — edit, preview against a real captured screen, revert to built-in.

**Usage tab** — tokens and estimated cost per run, per provider.

```
GET  /api/ai/providers                      → registry (never key values)
POST /api/ai/providers                      → upsert { id, baseUrl, adapter, apiKey? }
POST /api/ai/providers/:id/test             → { ok, latencyMs, reason? }
GET  /api/ai/providers/:id/fetch-models     → discovery (see §3.3)
GET  /api/ai/models                         → saved inventory
POST /api/ai/models                         → save selected models
DELETE /api/ai/models/:provider/:modelId
GET  /api/ai/tasks · POST /api/ai/tasks     → per-task model bindings
GET  /api/prompts/:name · POST /api/prompts/:name
```

API keys use the AES-256-GCM store from [`AUTHENTICATION.md`](./AUTHENTICATION.md) §4.2, with an env-var layer (`SAG_AI_KEY_<PROVIDER>`) taking precedence — the reference's env-or-file pattern. **Never logged, never returned, never in any output.**

---

## 7. MCP Surface

```
list_ai_providers                     → configured providers + status
list_ai_models                        → saved inventory
generate_screen_copy    (screen, provider?, model?)  → writes to Project Document
generate_video_title    (project, provider?, model?)
generate_scene_narrative(project, provider?, model?)
review_asset            (assetPath, provider?, model?)
get_ai_status                         → { providers, defaultModel, taskBindings }
```

Optional `provider`/`model` args let an agent pick a model per call — the same override the UI and CLI expose. Keys are never readable through MCP.

---

## 8. Failure Behaviour

AI is **optional infrastructure**, never a hard dependency:

- No key, provider down, or disabled → fall back to page-heading extraction, clearly labelled as placeholder in the Project Document.
- A capture run must never fail because an AI call failed.
- Provider errors report which provider/model failed and why — adopting the reference's actionable-message discipline.
- **Failover:** if a task's bound model is unavailable, fall back to `defaultModel` and record the substitution in the run report, so output is never silently produced by a different model than intended.
- Cached copy in the Project Document is reused; regeneration is explicit.
- Per-run diagnostics (raw response + resolved prompt), following the reference's diagnostic-artifact practice — the thing that makes prompt debugging tractable.

---

## 9. Open Questions

1. Ship a default provider enabled out of the box, or force explicit configuration on first run?
2. Cost ceiling per run, and whether to warn before exceeding it.
3. Ship an Ollama-first default for zero-cost local operation?
4. Should `review_asset` gate packaging automatically, or only advise?
5. Retry/backoff policy per provider — uniform, or per-provider rate-limit awareness?

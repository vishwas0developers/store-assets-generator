# Agent, MCP, and Distribution Architecture

**Companion documents:** [`PRD.md`](../PRD.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`ANDROID-CAPTURE.md`](./ANDROID-CAPTURE.md) · [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) · [`architecture.mmd`](./architecture.mmd)

This document covers the layers added by the final requirements: the AI Agent as the intelligence layer, Skills as the workflow teaching layer, MCP as the controlled capability layer, and NPM as the distribution layer.

---

## 1. The Core Separation

The governing principle, and the thing every design decision below serves:

> **The AI Agent provides the intelligence; Skills teach the workflow; MCP provides controlled capabilities; and Store Assets Generator performs deterministic asset generation and rendering.**

Practically, this means a hard boundary:

| Layer | Owns | Must never |
|---|---|---|
| **Agent** | Judgement — which screens matter, what a feature does, what the headline should say, whether output is good enough | Perform rendering, manipulate files directly, invent features |
| **Skills** | Workflow reasoning — the order of operations, what to inspect, when to iterate | Contain absolute paths, contain execution logic |
| **MCP** | Deterministic capabilities with typed inputs and outputs | Make aesthetic or editorial decisions |
| **Generator core** | Capture, composition, rendering, validation | Depend on any AI service |

The reason this boundary matters: **the generator must remain fully usable without an agent**. The CLI is the product; the agent is a very capable operator of it. If the intelligence layer and the execution layer blur together, the tool stops being deterministic and stops being testable.

---

## 2. `workspace-sync` Architecture Analysis

`D:\AI_Tools\workspace-sync` (v0.2.8, MIT, published to npm as `workspace-sync`) is the reference for distribution and agent integration. Findings from inspection:

### 2.1 Package shape

```jsonc
{
  "name": "workspace-sync",
  "main": "dist/src/server.js",           // MCP server entry
  "bin": { "workspace-sync": "dist/cli/index.js" },
  "files": ["dist/cli", "dist/install", "dist/src", "!dist/src/test"],
  "engines": { "node": ">=18" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "commander": "^11.1.0",
    "zod": "^3.22.4",
    "chalk": "^4.1.2"
  },
  "scripts": { "build": "tsc", "prepublishOnly": "npm run build" }
}
```

Three entry points from one package: a **CLI** (`bin`), an **MCP server** (`main`, started via `workspace-sync mcp`), and an **installer** (`dist/install`). This is the shape to copy.

### 2.2 Multi-agent installation — the most valuable lesson

`install/index.ts` (670 lines) maintains two explicit lookup tables:

- **`VERIFIED_SKILLS_TARGETS`** — per-agent native skills directory, ~22 agents: `.claude/skills`, `.codex/skills`, `.cursor/…`, `.gemini/skills`, `.copilot/skills`, `.factory/skills` (droid), `.openclaw/skills` (claw), `.trae/skills`, `.kiro/skills`, `.pi/agent/skills`, `.devin/skills`, and `.agents/skills` for the cross-framework Agent Skills convention (also used by amp and antigravity).
- **`MCP_CONFIG_PATHS`** — per-agent MCP config location and format: `.mcp.json` (Claude), `.cursor/mcp.json`, `~/.gemini/config/mcp_config.json`, TOML for Codex.

Plus `SKILLS_ONLY_AGENTS` for agents with no MCP integration at all (aider, cross-framework skills), which get skills without MCP config.

The lessons worth carrying, in order of importance:

1. **Each agent gets its own native directory, not a shared fallback.** Avoids collisions and means each agent discovers skills without relying on cross-framework support.
2. **Verified vs. assumed is tracked explicitly.** The code comments distinguish confirmed conventions from "most common MCP config shape" guesses. Honest uncertainty beats silent wrongness.
3. **Skills are embedded as string constants** (`SKILL_DEFINITIONS`) in the installer and written to disk at install time. This is *why* skills are portable — there is no source directory to reference, so no absolute path can leak in.
4. **A version stamp file** (`.workspace-sync-version`) sits in the skills directory. Drift detection compares both the stamp *and* the actual file contents, so hand-edited or partially-written skills are caught even when the stamp matches.
5. **`DEPRECATED_SKILL_NAMES`** are actively removed on install, so renamed or dropped skills don't linger.
6. **`setup` and `install` are deliberately separate.** `setup` initializes the project; `install [agent]` configures one agent. Conflating them would force agent choice on users who only want the CLI.
7. **`doctor` and `update` commands** report and repair drift, with `--check-only` and `--offline` flags.

### 2.3 What we adopt vs. change

| Element | Disposition |
|---|---|
| Package shape (CLI + MCP + installer in one) | **Adopt directly** |
| Per-agent skills/MCP target tables | **Adopt directly** — this is hard-won compatibility knowledge |
| Skills-as-string-constants (portability mechanism) | **Adopt directly** — solves the no-hardcoded-paths requirement |
| Version stamp + content-hash drift detection | **Adopt directly** |
| `setup` / `install` / `doctor` / `update` command split | **Adopt directly** |
| Commander + Zod + MCP SDK + chalk | **Adopt** |
| SSH/remote execution, VPS environment model | **Not applicable** — different product |
| Security guards (`command-guard`, `path-guard`) | **Adapt** — our equivalent risk is template path traversal and capture-target validation, not remote shell |
| CommonJS | **Reconsider** — ESM is the better default for a new package; verify MCP SDK compatibility |

**Explicitly not copied blindly:** workspace-sync's domain model (projects, environments, SSH links) has no analogue here. Only the distribution and agent-integration machinery transfers.

---

## 3. NPM Package Architecture

### 3.1 Naming

Proposed: **`store-assets-generator`** with binary `store-assets`.

Rationale: matches the repository and folder name, follows the `workspace-sync` precedent of package-name-equals-project-name, and leaves the short `store-assets` command for daily use. Verify availability on npm before committing; fall back to a scope (`@vishwas0developers/store-assets-generator`) if taken.

### 3.2 Structure

```
store-assets-generator/
├── package.json
├── README.md · LICENSE
├── .mcp.json                     # self-registration for this repo
├── cli/index.ts                  # CLI entry (bin)
├── install/
│   ├── index.ts                  # agent detection + skill/MCP installation
│   └── skills/                   # skill content as string constants
├── mcp/
│   ├── server.ts                 # MCP stdio server (main)
│   └── tools/                    # one module per MCP tool
├── src/                          # the deterministic engine (ARCHITECTURE.md)
│   ├── discovery/ capture/ android/ platform/ devices/
│   ├── project/ templates/ render/ validate/ package/
├── templates/builtin/
├── docs/
├── examples/
└── tests/
```

```jsonc
{
  "name": "store-assets-generator",
  "main": "dist/mcp/server.js",
  "bin": { "store-assets": "dist/cli/index.js" },
  "files": ["dist/cli", "dist/install", "dist/mcp", "dist/src", "templates"],
  "engines": { "node": ">=20" }
}
```

Node 20+ rather than 18: Playwright and modern tooling assume it, and it is comfortably available.

### 3.3 Installation flow

```bash
npm install -g store-assets-generator
store-assets setup                    # environment: deps, browsers, config scaffold
store-assets install claude           # agent: skills + MCP config
```

`setup` is responsible for:

1. Verifying Node version.
2. Installing the Playwright Chromium browser (`playwright install chromium`) — this is a real download, so it must be explicit and reported, never silent.
3. Detecting FFmpeg/FFprobe on `PATH`; if absent, printing platform-specific install guidance rather than attempting a silent binary download.
4. Detecting Android tooling (`adb`, `ANDROID_HOME`) — optional, only needed for Android capture; absence is reported as a disabled capability, not an error.
5. Scaffolding config and `templates/`.
6. Printing a capability report of what is and is not available.

**Design rule, learned from the dependency weight here:** `setup` must never fail the whole install because an optional capability is missing. A machine without adb should still generate web assets perfectly. Capabilities degrade individually and visibly.

### 3.4 Cross-platform

The install targets are all path-joined from `os.homedir()` or the project dir, exactly as workspace-sync does — no separators hardcoded. Platform-specific concerns:

| Concern | Handling |
|---|---|
| FFmpeg presence | Detect; guide per-platform (winget/choco, apt, brew) |
| Playwright browsers | Handled by Playwright's own installer |
| adb / Android SDK | Detect `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `PATH` |
| Font rendering differences | **Real risk** — Linux/macOS/Windows render text differently. Bundle template fonts inside `.sagtpl` packages (already the design) and document that the reference environment must be pinned for byte-identical output |
| Path length limits (Windows) | Keep output paths shallow |

---

## 4. Skill Architecture

### 4.1 Design principles

- **Skills teach reasoning, not execution.** Every action a skill describes should terminate in an MCP tool call or a CLI command, never in file manipulation instructions.
- **No absolute paths.** Skills are written as string constants and installed to an agent-resolved directory. They refer to tools and commands, never to `D:\AI_Tools\store-assets-generator`.
- **Progressive disclosure.** Agents load the skill matching the task, not all of them. Keep each skill focused.

### 4.2 Proposed skill set

Mapped from the capability list in the requirements:

| Skill | Teaches |
|---|---|
| `store-assets-overview` | What the system does, the layer separation, when to use which skill, the end-to-end workflow |
| `store-assets-inspect-project` | How to understand an application: read source, routes, docs, existing assets; identify what it actually offers; distinguish real features from aspirational ones |
| `store-assets-select-screens` | How to identify important screens and choose which belong in a store listing; ranking; what makes a screen marketable |
| `store-assets-capture` | Choosing frontend vs Android capture; device profiles; auth/demo state; verifying capture quality |
| `store-assets-write-copy` | How to analyse a screenshot together with source code to write accurate headlines, descriptions, and CTAs. **Includes the prohibition on inventing features.** |
| `store-assets-compose` | Mockups, marketing screenshots, templates, layout selection |
| `store-assets-video` | Scene narrative, sequencing, pacing, animation selection, BGM/CTA |
| `store-assets-validate-iterate` | Reading validation reports, reviewing output critically, regenerating individual assets or scenes |

The `write-copy` skill carries the most product value and the most risk — it is where hallucinated features would enter. It must instruct the agent to ground every claim in observed source or UI, and to omit rather than guess.

### 4.3 Portability mechanism

Following workspace-sync exactly: skills live as string constants in `install/skills/`, are written to the agent's resolved directory at install time, stamped with `.store-assets-version`, drift-checked by content, and deprecated names cleaned up. This is what makes "works on another computer" true rather than aspirational.

---

## 5. MCP Architecture

### 5.1 Design rules

- **Deterministic.** Same inputs, same outputs. No MCP tool calls an AI service.
- **Typed.** Zod schemas in, structured results out.
- **Granular enough to iterate.** The requirement that an agent can regenerate one scene without rebuilding everything dictates tool granularity — this is a functional requirement, not an optimization.
- **Returns references, not blobs.** Tools return file paths and metadata; agents read images via their own vision capability when needed.
- **Never destructive without explicit intent.**

### 5.2 Proposed tool surface

```
# Inspection
list_screens                 discover candidate screens for a URL
list_device_profiles         available device profiles
list_templates               available templates + their slots
get_project_document         read the current project document
get_platform_spec            resolved requirements for a platform

# Capture
capture_web_screen           one screen, one device profile → PNG
capture_android_screen       one screen via adb → PNG
list_android_devices         connected devices/emulators

# Composition
create_mockup                screenshot + device frame → framed PNG
create_marketing_image       framed screenshot + copy + template → store PNG

# Video
create_video_scene           one scene → preview clip
create_video                 assemble scenes → final MP4
update_scene                 modify one scene, re-render only it

# Project / output
set_screen_copy              write headline/description/CTA into project doc
preview_asset                fast low-res render for agent review
validate_asset               validate one asset against platform spec
validate_package             validate the whole package → report
package_assets               final versioned package
```

`update_scene` and `preview_asset` exist specifically to make the agent's review-and-improve loop cheap. Without them, every editorial tweak would trigger a full re-render, and iteration would be too slow to actually happen.

### 5.3 The copy-generation boundary

This deserves explicit statement because it is easy to get wrong:

The generator **never** generates copy. `set_screen_copy` accepts text the agent wrote and stores it in the project document. The agent produced that text by reading source code and viewing screenshots — that is the agent's job, using its own model. There is no LLM dependency inside the generator, no API key, and no cost attached to running the CLI.

This keeps the tool deterministic, testable, offline-capable, and free of vendor lock-in, while still supporting the AI-driven workflow. A human operator can supply copy through the same path.

---

## 6. Multi-Agent Installation Strategy

```
New computer
   ↓
npm install -g store-assets-generator
   ↓
store-assets setup            → deps verified, browsers installed, capability report
   ↓
store-assets install <agent>  → skills written, MCP registered
   ↓
Agent ready
```

- `store-assets install` with no argument detects candidate agents by probing for their marker directories, reporting what it found and what it will write before doing so.
- `store-assets install <agent>` targets one explicitly.
- `--global` vs project-level installation, following the workspace-sync split.
- `store-assets doctor` reports drift, missing dependencies, and stale skills; `--check-only` reports without repairing.
- `store-assets update` re-syncs skills and MCP config after a package upgrade.

**Adopt workspace-sync's honesty about verification status.** Where an agent's skill directory or MCP config path is assumed rather than confirmed, say so in code comments and in `doctor` output. A wrong path that fails loudly is far better than one that silently installs into a directory the agent never reads.

---

## 7. Open Decisions

| # | Decision | Impact |
|---|---|---|
| 1 | Package name availability on npm | Naming; scope fallback ready |
| 2 | ESM vs CommonJS | Verify MCP SDK and Playwright compatibility under ESM |
| 3 | Which agents to support at launch | Full workspace-sync table (~22) or a verified subset first |
| 4 | Global vs project-level default for skills | Affects multi-project ergonomics |
| 5 | Public open-source or internal GitHub | Licensing of bundled frames/music depends on this answer |
| 6 | Whether `setup` may auto-install FFmpeg | Automating a system-level install is convenient but intrusive; recommend guidance-only by default |

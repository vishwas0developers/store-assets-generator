# Store Assets Generator — Architecture Diagrams

**Companion to:** [`ARCHITECTURE.md`](./ARCHITECTURE.md)

Each diagram lives in its own file under [`diagrams/`](./diagrams/) as **pure
Mermaid syntax** — no Markdown headers or prose mixed in — so each one opens
and previews correctly on its own with a Mermaid extension/viewer. This
replaces the old single `architecture.mmd`, which held all diagrams
concatenated with Markdown headings between them; a `.mmd` file can hold
exactly one diagram, so that file could never actually preview as Mermaid.

| Diagram | File | Section |
|---|---|---|
| 0 — Layered Architecture (Agent · Skills · MCP · Engine) | [`diagrams/diagram-00-layered-architecture.mmd`](./diagrams/diagram-00-layered-architecture.mmd) | §0 |
| 0a — One Core, Three Surfaces | [`diagrams/diagram-00a-one-core-three-surfaces.mmd`](./diagrams/diagram-00a-one-core-three-surfaces.mmd) | §0 |
| 0b — Distribution & Multi-Agent Installation | [`diagrams/diagram-00b-distribution-installation.mmd`](./diagrams/diagram-00b-distribution-installation.mmd) | `AGENT-MCP-DISTRIBUTION.md` |
| 0c — AI-Driven End-to-End Workflow | [`diagrams/diagram-00c-ai-workflow.mmd`](./diagrams/diagram-00c-ai-workflow.mmd) | §0 |
| 0d — Authentication Flow | [`diagrams/diagram-00d-authentication-flow.mmd`](./diagrams/diagram-00d-authentication-flow.mmd) | `AUTHENTICATION.md` |
| 0e — Multi-Provider AI Layer | [`diagrams/diagram-00e-multi-provider-ai-layer.mmd`](./diagrams/diagram-00e-multi-provider-ai-layer.mmd) | `AI-PROVIDERS.md` |
| 1 — System Overview *(historical, pre-Phase-9)* | [`diagrams/diagram-01-system-overview.mmd`](./diagrams/diagram-01-system-overview.mmd) | §6.2 |
| **2 — Four-Step Manual Workflow (current)** | [`diagrams/diagram-02-four-step-workflow.mmd`](./diagrams/diagram-02-four-step-workflow.mmd) | §6.1 |
| 2 legacy — Generation Pipeline *(historical, pre-Phase-9)* | [`diagrams/diagram-02-legacy-generation-pipeline.mmd`](./diagrams/diagram-02-legacy-generation-pipeline.mmd) | §6.2 |
| 3 — Video Generation Pipeline *(historical, pre-Phase-9 Remotion path)* | [`diagrams/diagram-03-video-generation-pipeline.mmd`](./diagrams/diagram-03-video-generation-pipeline.mmd) | §6.2 |
| 4 — Template System (`.sagtpl`) | [`diagrams/diagram-04-template-system.mmd`](./diagrams/diagram-04-template-system.mmd) | §4 |
| 5 — Legacy Concept Migration | [`diagrams/diagram-05-legacy-concept-migration.mmd`](./diagrams/diagram-05-legacy-concept-migration.mmd) | §2 |
| 6 — Component / Module Structure *(historical, pre-Phase-9 layout)* | [`diagrams/diagram-06-component-module-structure.mmd`](./diagrams/diagram-06-component-module-structure.mmd) | §7 |
| 7 — Capture Sources (Web vs Android) | [`diagrams/diagram-07-capture-sources.mmd`](./diagrams/diagram-07-capture-sources.mmd) | §6.1/§6.2 |

**Current vs historical:** Diagram 2 (four-step workflow) is the diagram that
matches what is actually built (Phase 9). Diagrams 1, 2-legacy, 3, and 6
describe the original one-shot `AssetPipeline`/Remotion design that Phase 9
superseded — `src/orchestrator.ts` and `src/render/video.ts` are
disabled-not-deleted, so these remain accurate documentation of that code
path, just no longer the primary one. See `ARCHITECTURE.md` §6.1 vs §6.2.

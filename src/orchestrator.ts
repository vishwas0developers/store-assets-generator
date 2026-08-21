import { type ProjectDocument } from "./project/schema.js";

/**
 * DISABLED — superseded by the four-step session workflow (Phase 9).
 *
 * The original one-shot pipeline (crawl -> capture -> compose -> video ->
 * validate, no place to intervene) is preserved unmodified at
 * src/_disabled/orchestrator.ts.bak (excluded from the TypeScript build —
 * see tsconfig.json's `exclude`) so it can be restored verbatim if this
 * workflow is ever needed again. Per PRD.md §10 / §6 this is a disable,
 * not a delete.
 *
 * Replacement: src/session/store.ts (Session model) +
 * src/capture/step1.ts (Capture) + src/render/mockup.ts (Studio Mockups) +
 * src/package/store.ts (Store Asset Package) + src/render/scene.ts
 * (Animation Video), wired up in web/server.ts's /api/sessions/* routes.
 * See docs/ARCHITECTURE.md §6.1 and docs/IMPLEMENTATION_PLAN.md Phase 9.
 *
 * To re-enable: restore src/_disabled/orchestrator.ts.bak over this file
 * and remove it from tsconfig.json's exclude list.
 */

export interface PipelineOptions {
  slug?: string;
  email?: string;
  password?: string;
}

export interface PipelineResult {
  projectDoc: ProjectDocument;
  screenshots: string[];
  videoPath: string | null;
  validationReport: any;
  authStatus: { attempted: boolean; ok: boolean; stage: string | null; reason?: string } | null;
}

export class AssetPipeline {
  async run(_url: string, _platform: string, _outputDir: string, _options: PipelineOptions = {}): Promise<PipelineResult> {
    throw new Error(
      "AssetPipeline.run() is superseded by the four-step workflow (Capture / Studio Mockups / " +
        "Store Asset Package / Animation Video). Use the session-based routes in web/server.ts " +
        "(POST /api/sessions, /capture, /mockups, /package, /scenes, /video) or the equivalent " +
        "MCP tools instead. See docs/IMPLEMENTATION_PLAN.md Phase 9.",
    );
  }
}

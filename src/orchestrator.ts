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
 * Replacement: three independent tabs, each with its own project store --
 * src/capture/store.ts + websiteCapture.ts/androidCapture.ts (Screen Capture),
 * src/mockup/project.ts + render.ts + export.ts (Studio Mockup),
 * src/video/project.ts + render.ts (Video) -- wired up in web/server.ts's
 * /api/captures/*, /api/mockups/*, /api/videos/* routes.
 * See docs/ARCHITECTURE.md and docs/IMPLEMENTATION_PLAN.md.
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
      "AssetPipeline.run() is superseded by the three independent tabs -- Screen Capture, " +
        "Studio Mockup, Video -- each with its own project store. Use the web UI (store-assets ui) " +
        "or the equivalent /api/captures, /api/mockups, /api/videos routes in web/server.ts instead. " +
        "See docs/IMPLEMENTATION_PLAN.md.",
    );
  }
}

import { type ProjectDocument } from "../project/schema.js";

/**
 * DISABLED — superseded by src/render/scene.ts (Phase 9).
 *
 * The original hardcoded single-screenshot 5s-clip engine is preserved
 * unmodified at src/_disabled/video.ts.bak (excluded from the TypeScript
 * build — see tsconfig.json's `exclude`). Per PRD.md §10 / §6 this is a
 * disable, not a delete.
 *
 * Replacement: src/render/scene.ts's multi-scene, template-driven,
 * HTML/CSS/JS-animated renderer (renderVideo), one scene per raw
 * screenshot, deterministically frame-stepped via window.seek(). See
 * docs/ARCHITECTURE.md §6.1.
 *
 * To re-enable: restore src/_disabled/video.ts.bak over this file and
 * remove it from tsconfig.json's exclude list.
 */

export interface VideoRenderOptions {
  outputDir: string;
}

export class PlaywrightFFmpegVideoEngine {
  async render(_doc: ProjectDocument, _options: VideoRenderOptions): Promise<string> {
    throw new Error(
      "PlaywrightFFmpegVideoEngine.render() is superseded by src/render/scene.ts's renderVideo() " +
        "— multi-scene, template-driven HTML/CSS/JS animation. See docs/IMPLEMENTATION_PLAN.md Phase 9.",
    );
  }
}

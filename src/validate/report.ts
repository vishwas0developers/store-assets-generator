import fs from "fs";
import path from "path";
import { type PlatformSpec } from "../project/schema.js";

export interface ValidationIssue {
  assetPath: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
}

export class AssetValidator {
  /**
   * Validate generated screenshots and video assets against PlatformSpec rules
   */
  validatePackage(outputDir: string, spec: PlatformSpec): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // 0. Reject any screen whose capture is a recorded error page (404/5xx).
    // Belt-and-suspenders: capture/browser.ts already refuses to save an
    // error-status capture, but this catches a stale project.json being
    // re-validated, or a screen assembled by a path that skipped that guard.
    const projectPath = path.join(outputDir, "project.json");
    if (fs.existsSync(projectPath)) {
      try {
        const projectDoc = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
        for (const screen of projectDoc.screens ?? []) {
          if (typeof screen.httpStatus === "number" && screen.httpStatus >= 400) {
            issues.push({
              assetPath: screen.capture,
              rule: "no-error-page",
              severity: "error",
              message: `Screen '${screen.id}' captured an HTTP ${screen.httpStatus} error page (${screen.sourceUrl}).`,
            });
          }
        }
      } catch {
        // Malformed project.json is a separate concern; capture-count and
        // directory checks below still run independently.
      }
    }

    // 1. Verify composed screenshots
    const storeDir = path.join(outputDir, "store");
    if (!fs.existsSync(storeDir)) {
      issues.push({
        assetPath: storeDir,
        rule: "directory-presence",
        severity: "error",
        message: "Composed screenshots output directory is missing."
      });
      return issues;
    }

    const files = fs.readdirSync(storeDir).filter(f => f.endsWith(".png"));
    if (files.length === 0) {
      issues.push({
        assetPath: storeDir,
        rule: "screenshot-count",
        severity: "error",
        message: "No composed store screenshots found."
      });
    }

    // 2. Validate video output rules if any
    const videoPath = path.join(outputDir, "video", "promo_video.mp4");
    if (fs.existsSync(videoPath)) {
      const stats = fs.statSync(videoPath);
      if (spec.video) {
        if (stats.size > spec.video.maxSizeBytes) {
          issues.push({
            assetPath: videoPath,
            rule: "video-size-cap",
            severity: "error",
            message: `Video file exceeds platform size limits: ${stats.size} bytes`
          });
        }
      }
    }

    return issues;
  }
}

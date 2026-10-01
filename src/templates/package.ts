import fs from "fs";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";
import { TemplateSchema, type Template } from "../application/schema.js";

export class TemplatePackager {
  /**
   * Package a template directory into a .sagtpl ZIP archive
   */
  async exportTemplate(templateDirPath: string, outputFilePath: string): Promise<string> {
    const manifestPath = path.join(templateDirPath, "template.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`template.json not found at ${manifestPath}`);
    }

    // Validate schema before export
    const raw = fs.readFileSync(manifestPath, "utf-8");
    TemplateSchema.parse(JSON.parse(raw));

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputFilePath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve(outputFilePath));
      archive.on("error", (err) => reject(err));

      archive.pipe(output);
      // Confines files to the directory root (no path traversal)
      archive.directory(templateDirPath, false);
      archive.finalize();
    });
  }

  /**
   * Unpack and validate a .sagtpl archive to target directory
   */
  async importTemplate(zipPath: string, targetParentDir: string): Promise<string> {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`Template archive file not found: ${zipPath}`);
    }

    const tempExtractDir = path.join(targetParentDir, `temp_${Date.now()}`);
    fs.mkdirSync(tempExtractDir, { recursive: true });

    // Extract
    const directory = await unzipper.Open.file(zipPath);
    await directory.extract({ path: tempExtractDir });

    // Validate manifest
    const manifestPath = path.join(tempExtractDir, "template.json");
    if (!fs.existsSync(manifestPath)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
      throw new Error("Invalid template pack: template.json missing");
    }

    const raw = fs.readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    const validation = TemplateSchema.safeParse(parsed);

    if (!validation.success) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
      throw new Error(`Template validation failed: ${JSON.stringify(validation.error.format())}`);
    }

    // Move to final target
    const templateId = validation.data.meta.id;
    const finalTargetDir = path.join(targetParentDir, templateId);
    if (fs.existsSync(finalTargetDir)) {
      fs.rmSync(finalTargetDir, { recursive: true, force: true });
    }

    fs.renameSync(tempExtractDir, finalTargetDir);
    return finalTargetDir;
  }
}

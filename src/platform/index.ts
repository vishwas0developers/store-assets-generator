import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";
import { PlatformSpecSchema, type PlatformSpec } from "../application/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadPlatformSpec(platformId: string): PlatformSpec {
  let specPath = path.join(__dirname, "specs", `${platformId}.yaml`);
  if (!fs.existsSync(specPath)) {
    // Check fallback to src/platform/specs
    const srcFallback = path.join(process.cwd(), "src", "platform", "specs", `${platformId}.yaml`);
    if (fs.existsSync(srcFallback)) {
      specPath = srcFallback;
    } else {
      throw new Error(`Platform specification for '${platformId}' not found at: ${specPath}`);
    }
  }

  const rawYaml = fs.readFileSync(specPath, "utf-8");
  const parsed = YAML.parse(rawYaml);
  
  const validationResult = PlatformSpecSchema.safeParse(parsed);
  if (!validationResult.success) {
    throw new Error(
      `Platform spec validation failed for '${platformId}': ${JSON.stringify(validationResult.error.format())}`
    );
  }

  return validationResult.data;
}

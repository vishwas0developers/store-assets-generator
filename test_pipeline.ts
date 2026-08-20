import { AssetPipeline } from "./src/orchestrator.js";
import path from "path";

async function main() {
  const url = "https://1web.iticareer.com";
  const platform = "google-play";
  const outputDir = path.join(process.cwd(), "output", "full-pipeline-test");

  try {
    const pipeline = new AssetPipeline();
    const result = await pipeline.run(url, platform, outputDir);
    console.log("Full Pipeline Executed successfully!");
    console.log("Validation Status:", result.validationReport.status);
    console.log("Composed Screenshots:", result.screenshots);
    console.log("Video output path:", result.videoPath);
    process.exit(0);
  } catch (err) {
    console.error("Full Pipeline run failed:", err);
    process.exit(1);
  }
}

main();

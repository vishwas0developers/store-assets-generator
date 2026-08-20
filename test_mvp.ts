import { runMVPSlice } from "./src/orchestrator.js";
import path from "path";
import fs from "fs";

async function main() {
  const url = "https://1web.iticareer.com";
  const platform = "google-play";
  const outputDir = path.join(process.cwd(), "output", "mvp-test");

  try {
    const doc = await runMVPSlice(url, platform, outputDir);
    console.log("MVP Slice executed successfully!");
    console.log("Project Document Generated:\n", JSON.stringify(doc, null, 2));

    const docPath = path.join(outputDir, "project.json");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(docPath, JSON.stringify(doc, null, 2), "utf-8");
    console.log(`Saved Project Document to: ${docPath}`);
    process.exit(0);
  } catch (err) {
    console.error("MVP Slice failed:", err);
    process.exit(1);
  }
}

main();

import fs from "fs";
import path from "path";

// Copies the static web UI assets into dist/web/ — tsc only compiles .ts,
// so index.html/app.css/app.js need an explicit copy step. A plain script
// file instead of an inline `node -e "..."` in package.json avoids cmd.exe's
// quoting/`&&` parser breaking on Windows (see docs/IMPLEMENTATION_PLAN.md).
const files = ["index.html", "app.css", "app.js"];
const destDir = path.join("dist", "web");
fs.mkdirSync(destDir, { recursive: true });

for (const name of files) {
  const src = path.join("web", name);
  const dest = path.join(destDir, name);
  fs.copyFileSync(src, dest);
  console.log(`Copied ${src} -> ${dest}`);
}

// Automatically create demo PNG assets on build
try {
  await import("./generate/create-demo-assets.mjs");
} catch (e) {
  console.warn("Failed to generate demo assets:", e);
}

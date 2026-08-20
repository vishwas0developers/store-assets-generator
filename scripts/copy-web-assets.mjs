import fs from "fs";
import path from "path";

// Copies web/index.html into dist/web/ — tsc only compiles .ts, so the
// static UI page needs an explicit copy step. A plain script file instead
// of an inline `node -e "..."` in package.json avoids cmd.exe's quoting/
// `&&` parser breaking on Windows (see docs/IMPLEMENTATION_PLAN.md).
const src = path.join("web", "index.html");
const destDir = path.join("dist", "web");
const dest = path.join(destDir, "index.html");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied ${src} -> ${dest}`);

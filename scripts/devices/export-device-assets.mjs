// Materialises every catalogue device as a standalone file under devices/:
//   devices/2d/<id>.svg   and   devices/3d/<id>.glb
// (CSS devices already live in devices/css/*.json.)  Run: npm run devices:export
import path from "path";
import { pathToFileURL } from "url";
const dist = (p) => import(pathToFileURL(path.join(process.cwd(), "dist", "src", p)).href);
const { sync2dDeviceFiles } = await dist("devices/rig-assets.js");
const { DEVICE_REGISTRY } = await dist("devices/registry.js");
const { getDeviceGlbPath } = await dist("devices/device-manager.js");
console.log(`2D: ${sync2dDeviceFiles()} svg file(s) written`);
let n = 0;
for (const d of Object.values(DEVICE_REGISTRY)) { await getDeviceGlbPath(d.definition); n++; }
console.log(`3D: ${n} glb file(s) present`);

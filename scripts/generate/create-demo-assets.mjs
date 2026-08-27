import fs from "fs";
import path from "path";
import zlib from "zlib";

const dir = path.join(process.cwd(), "assets", "demo");
fs.mkdirSync(dir, { recursive: true });

// The genuine demo/default assets in assets/demo/ are committed, read-only source assets
// (see git history) -- this script must NEVER overwrite one that already exists. It only
// fills in a file that is genuinely missing, with a small solid-color placeholder, so a
// fresh checkout without the real assets still has *something* to fall back to.
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

function solidColorPng(r, g, b, a = 255) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: RGBA
  const raw = Buffer.from([0 /* filter: none */, r, g, b, a]);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const COLORS = {
  "demo_screen_1.png": [239, 68, 68],
  "demo_screen_2.png": [34, 197, 94],
  "demo_screen_3.png": [59, 130, 246],
  "demo_screen_4.png": [234, 179, 8],
  "demo_screen_5.png": [168, 85, 247],
  "demo_screen_6.png": [249, 115, 22],
  "demo_landscape.png": [20, 184, 166],
  "demo_logo.png": [236, 72, 153],
};

let created = 0;
for (const [name, [r, g, b]] of Object.entries(COLORS)) {
  const dest = path.join(dir, name);
  if (fs.existsSync(dest)) continue; // never touch an existing (genuine) asset
  fs.writeFileSync(dest, solidColorPng(r, g, b));
  created++;
}

console.log(created > 0 ? `Created ${created} missing placeholder demo asset(s) in assets/demo/` : "Demo assets already present -- nothing to do.");

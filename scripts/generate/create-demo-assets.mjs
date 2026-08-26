import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "assets", "demo");
fs.mkdirSync(dir, { recursive: true });

// Small valid PNG files (coloured squares)
const RED_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const GREEN_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const BLUE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPjPUAMEAQGAPgCBd5bfVAAAAABJRU5ErkJggg==";
const YELLOW_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z9BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PURPLE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ORANGE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const CYAN_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const MAGENTA_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPjPUAMEAQGAPgCBd5bfVAAAAABJRU5ErkJggg==";

const files = {
  "demo_screen_1.png": RED_PNG,
  "demo_screen_2.png": GREEN_PNG,
  "demo_screen_3.png": BLUE_PNG,
  "demo_screen_4.png": YELLOW_PNG,
  "demo_screen_5.png": PURPLE_PNG,
  "demo_screen_6.png": ORANGE_PNG,
  "demo_landscape.png": CYAN_PNG,
  "demo_logo.png": MAGENTA_PNG
};

for (const [name, base64] of Object.entries(files)) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from(base64, "base64"));
}

console.log("Real demo PNG assets successfully created in assets/demo/");

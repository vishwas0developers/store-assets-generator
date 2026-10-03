import fs from "fs";
import path from "path";
import { dependenciesRoot, dependencyDir, isChromiumInstalled, ensureChromium, chromiumLocation } from "./dependencies.js";
import {
  resolveToolInfo, getToolVersion, getToolchainStatus, resetToolCache, downloadZip, installZip, COMPONENT_URLS, type ToolName,
} from "./binaries.js";

/** Step-by-step first-run setup: every operation (not just downloads) is a visible, stateful step. */
export type StepStatus = "pending" | "active" | "done" | "skipped" | "failed";
export interface SetupStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  progress?: number;
  dl?: { name: string; done: number; total: number; speed: number; eta: number };
}
export interface SetupState { steps: SetupStep[]; status: "running" | "failed" | "complete"; error?: string }

const DEFS: Array<[string, string]> = [
  ["prepare", "Preparing installation"],
  ["requirements", "Checking system requirements"],
  ["detect-chromium", "Detecting Chromium"],
  ["detect-tools", "Detecting scrcpy-bin and FFmpeg"],
  ["dl-chromium", "Downloading Chromium"],
  ["dl-scrcpy", "Downloading scrcpy-bin"],
  ["dl-ffmpeg", "Downloading FFmpeg"],
  ["install", "Installing components"],
  ["configure", "Configuring dependency paths"],
  ["verify-chromium", "Verifying Chromium"],
  ["verify-scrcpy", "Verifying scrcpy-bin"],
  ["verify-ffmpeg", "Verifying FFmpeg"],
  ["validate", "Validating application configuration"],
  ["finalize", "Finalizing setup"],
];

const SKIP = Symbol("skip");
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

export async function runSetup(emit: (s: SetupState) => void): Promise<void> {
  const state: SetupState = { status: "running", steps: DEFS.map(([id, label]) => ({ id, label, status: "pending" as StepStatus })) };
  const get = (id: string) => state.steps.find((s) => s.id === id)!;
  let last = 0;
  const push = (force = true) => {
    const now = Date.now();
    if (!force && now - last < 100) return;
    last = now;
    emit(JSON.parse(JSON.stringify(state)));
  };
  const need = { chromium: false, scrcpy: false, ffmpeg: false };
  const zips: Array<{ zip: string; dir: string; label: string }> = [];

  async function step(id: string, fn: (s: SetupStep) => Promise<string | void | typeof SKIP>) {
    const s = get(id);
    s.status = "active";
    push();
    try {
      const r = await fn(s);
      if (r === SKIP) s.status = "skipped";
      else { s.status = "done"; if (typeof r === "string") s.detail = r; }
      s.dl = undefined;
      s.progress = undefined;
      push();
    } catch (err: any) {
      s.status = "failed";
      s.detail = err?.message || String(err);
      state.status = "failed";
      state.error = `${s.label} failed — ${s.detail}`;
      push();
      throw err;
    }
  }
  const skipWith = (id: string, detail: string): typeof SKIP => { get(id).detail = detail; return SKIP; };

  /** Progress callback that fills the step's download details (size, speed, ETA). */
  const tracker = (s: SetupStep, name: string) => {
    const t0 = Date.now();
    return (_m: string, pct?: number, b?: { done: number; total: number }) => {
      if (pct !== undefined) s.progress = pct;
      if (b) {
        const speed = b.done / Math.max(0.5, (Date.now() - t0) / 1000);
        s.dl = { name, done: b.done, total: b.total, speed, eta: b.total && speed ? (b.total - b.done) / speed : 0 };
      }
      push(false);
    };
  };

  await step("prepare", async () => {
    for (const k of ["chromium", "scrcpy", "ffmpeg"] as const) fs.mkdirSync(dependencyDir(k), { recursive: true });
    return `Dependency folder ready: ${dependenciesRoot()}`;
  });

  await step("requirements", async () => {
    if (process.platform !== "win32") return "Non-Windows platform: scrcpy/FFmpeg must be on PATH";
    if (process.arch !== "x64") throw new Error(`Unsupported architecture ${process.arch}`);
    const free = fs.statfsSync(dependenciesRoot());
    const freeBytes = free.bavail * free.bsize;
    if (freeBytes < 1.5 * 1024 ** 3 && !isChromiumInstalled()) throw new Error(`Not enough disk space (${mb(freeBytes)} free, ~1.5 GB needed)`);
    return `Windows x64, ${(freeBytes / 1024 ** 3).toFixed(1)} GB free`;
  });

  await step("detect-chromium", async () => {
    need.chromium = !isChromiumInstalled();
    return need.chromium ? "Chromium not found — will be downloaded" : "Chromium already installed — using existing version";
  });

  await step("detect-tools", async () => {
    const has = (n: ToolName) => { try { resolveToolInfo(n); return true; } catch { return false; } };
    need.scrcpy = !(has("scrcpy") && has("adb"));
    need.ffmpeg = !has("ffmpeg");
    return `scrcpy-bin: ${need.scrcpy ? "missing" : "found"} · FFmpeg: ${need.ffmpeg ? "missing" : "found"}`;
  });

  await step("dl-chromium", async (s) => {
    if (!need.chromium) return skipWith("dl-chromium", "Already installed — nothing to download");
    await ensureChromium(tracker(s, "Chromium"));
    return "Chromium downloaded and installed";
  });

  await step("dl-scrcpy", async (s) => {
    if (!need.scrcpy) return skipWith("dl-scrcpy", "Already available — reusing it");
    zips.push({ zip: await downloadZip(COMPONENT_URLS.scrcpy, dependencyDir("scrcpy"), "scrcpy-bin", tracker(s, "scrcpy-bin")), dir: dependencyDir("scrcpy"), label: "scrcpy-bin" });
    return "Downloaded";
  });

  await step("dl-ffmpeg", async (s) => {
    if (!need.ffmpeg) return skipWith("dl-ffmpeg", "Already available — reusing it");
    zips.push({ zip: await downloadZip(COMPONENT_URLS.ffmpeg, dependencyDir("ffmpeg"), "FFmpeg", tracker(s, "FFmpeg")), dir: dependencyDir("ffmpeg"), label: "FFmpeg" });
    return "Downloaded";
  });

  await step("install", async (s) => {
    if (!zips.length) return skipWith("install", "No archives to install");
    for (const z of zips) {
      s.detail = `Extracting ${z.label}...`;
      push();
      await installZip(z.zip, z.dir, z.label);
    }
    return `Installed ${zips.map((z) => z.label).join(", ")}`;
  });

  await step("configure", async () => {
    resetToolCache();
    process.env.PLAYWRIGHT_BROWSERS_PATH = chromiumLocation();
    const paths = (["scrcpy", "adb", "ffmpeg"] as ToolName[]).map((n) => resolveToolInfo(n).path);
    return `${paths.length} tool paths registered`;
  });

  await step("verify-chromium", async () => {
    const { chromium } = await import("playwright");
    const b = await chromium.launch({ headless: true });
    const v = b.version();
    await b.close();
    return `Chromium ${v} launches correctly`;
  });
  for (const [id, tool] of [["verify-scrcpy", "scrcpy"], ["verify-ffmpeg", "ffmpeg"]] as const) {
    await step(id, async () => {
      const v = getToolVersion(tool, resolveToolInfo(tool).path);
      if (!v) throw new Error(`${tool} did not report a version`);
      return v;
    });
  }

  await step("validate", async () => {
    const cwd = process.cwd();
    for (const rel of ["config/providers.json", "devices/catalogue.json"]) JSON.parse(fs.readFileSync(path.join(cwd, rel), "utf-8"));
    for (const rel of ["templates/mockup", "templates/video", "web/index.html"]) if (!fs.existsSync(path.join(cwd, rel))) throw new Error(`Missing ${rel}`);
    return "Configuration, templates and device files are valid";
  });

  await step("finalize", async () => {
    if (!getToolchainStatus().ready) throw new Error("A required component is still missing");
    return "All components ready";
  });

  state.status = "complete";
  push();
}

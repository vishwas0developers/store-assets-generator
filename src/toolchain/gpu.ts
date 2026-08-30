import { execFile } from "child_process";
import { promisify } from "util";
import { resolveTool } from "./binaries.js";

const execFileAsync = promisify(execFile);

export interface GpuCapabilities {
  vendor: "nvidia" | "intel" | "amd" | "generic" | "cpu";
  name: string;
  hasHardwareDecode: boolean;
  hasHardwareEncode: boolean;
  ffmpegDecodeFlags: string[];
  ffmpegEncodeCodec: string;
  ffmpegEncodeFlags: string[];
}

let cachedCapabilities: GpuCapabilities | null = null;

/**
 * Probes the system GPU capabilities and returns optimized FFmpeg hardware flags.
 */
export async function detectGpuCapabilities(): Promise<GpuCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  let ffmpegPath = "";
  try {
    ffmpegPath = resolveTool("ffmpeg");
  } catch {
    ffmpegPath = "ffmpeg";
  }

  let decodersOut = "";
  let encodersOut = "";
  let hwaccelsOut = "";

  try {
    const [decRes, encRes, hwRes] = await Promise.all([
      execFileAsync(ffmpegPath, ["-decoders"]).catch(() => ({ stdout: "" })),
      execFileAsync(ffmpegPath, ["-encoders"]).catch(() => ({ stdout: "" })),
      execFileAsync(ffmpegPath, ["-hwaccels"]).catch(() => ({ stdout: "" })),
    ]);
    decodersOut = decRes.stdout.toLowerCase();
    encodersOut = encRes.stdout.toLowerCase();
    hwaccelsOut = hwRes.stdout.toLowerCase();
  } catch {
    // default to cpu/d3d11va
  }

  const supportsCuda = hwaccelsOut.includes("cuda") || hwaccelsOut.includes("nvdec");
  const supportsNvenc = encodersOut.includes("h264_nvenc");
  const supportsQsv = hwaccelsOut.includes("qsv") || encodersOut.includes("h264_qsv");
  const supportsAmf = encodersOut.includes("h264_amf");
  const supportsD3d11va = hwaccelsOut.includes("d3d11va") || hwaccelsOut.includes("dxva2");

  if (supportsCuda || supportsNvenc) {
    cachedCapabilities = {
      vendor: "nvidia",
      name: "NVIDIA GPU (CUDA / NVDEC / NVENC)",
      hasHardwareDecode: supportsCuda,
      hasHardwareEncode: supportsNvenc,
      ffmpegDecodeFlags: supportsCuda ? ["-hwaccel", "cuda"] : ["-hwaccel", "auto"],
      ffmpegEncodeCodec: supportsNvenc ? "h264_nvenc" : "libx264",
      ffmpegEncodeFlags: supportsNvenc
        ? ["-preset", "p4", "-tune", "ll", "-zerolatency", "1", "-rc", "cbr_ld_hq"]
        : ["-preset", "ultrafast", "-tune", "zerolatency"],
    };
    return cachedCapabilities;
  }

  if (supportsQsv) {
    cachedCapabilities = {
      vendor: "intel",
      name: "Intel GPU (Quick Sync Video)",
      hasHardwareDecode: true,
      hasHardwareEncode: true,
      ffmpegDecodeFlags: ["-hwaccel", "qsv"],
      ffmpegEncodeCodec: "h264_qsv",
      ffmpegEncodeFlags: ["-preset", "veryfast", "-look_ahead", "0"],
    };
    return cachedCapabilities;
  }

  if (supportsAmf) {
    cachedCapabilities = {
      vendor: "amd",
      name: "AMD GPU (AMF Hardware Engine)",
      hasHardwareDecode: supportsD3d11va,
      hasHardwareEncode: true,
      ffmpegDecodeFlags: supportsD3d11va ? ["-hwaccel", "d3d11va"] : ["-hwaccel", "auto"],
      ffmpegEncodeCodec: "h264_amf",
      ffmpegEncodeFlags: ["-quality", "speed", "-rc", "cbr"],
    };
    return cachedCapabilities;
  }

  if (supportsD3d11va) {
    cachedCapabilities = {
      vendor: "generic",
      name: "Direct3D 11 Hardware Acceleration",
      hasHardwareDecode: true,
      hasHardwareEncode: false,
      ffmpegDecodeFlags: ["-hwaccel", "d3d11va"],
      ffmpegEncodeCodec: "libx264",
      ffmpegEncodeFlags: ["-preset", "ultrafast", "-tune", "zerolatency"],
    };
    return cachedCapabilities;
  }

  cachedCapabilities = {
    vendor: "cpu",
    name: "Software CPU Processing",
    hasHardwareDecode: false,
    hasHardwareEncode: false,
    ffmpegDecodeFlags: ["-hwaccel", "auto"],
    ffmpegEncodeCodec: "libx264",
    ffmpegEncodeFlags: ["-preset", "ultrafast", "-tune", "zerolatency"],
  };

  return cachedCapabilities;
}

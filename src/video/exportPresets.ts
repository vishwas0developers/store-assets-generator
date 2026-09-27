export interface ExportPreset {
  id: string;
  name: string;
  description: string;
  format: "mp4" | "webm";
  resolution: "native" | "1080" | "720" | "480";
  orientation: "native" | "landscape" | "portrait" | "square";
  fps: 24 | 30 | 60;
  quality: "high" | "standard" | "small";
}

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "app-store",
    name: "App Store / Play",
    description: "Native resolution, MP4 (H.264), 30 fps, High Quality",
    format: "mp4",
    resolution: "native",
    orientation: "native",
    fps: 30,
    quality: "high",
  },
  {
    id: "social-square",
    name: "Social Square 1080",
    description: "1080×1080 letterboxed, MP4 (H.264), 30 fps",
    format: "mp4",
    resolution: "1080",
    orientation: "square",
    fps: 30,
    quality: "high",
  },
  {
    id: "web-720",
    name: "Web 720 WebM",
    description: "720p WebM (VP9), 30 fps, Standard Quality",
    format: "webm",
    resolution: "720",
    orientation: "native",
    fps: 30,
    quality: "standard",
  },
  {
    id: "youtube-1080",
    name: "YouTube 1080p",
    description: "1920×1080 landscape, MP4 (H.264), 30 fps, High Quality",
    format: "mp4",
    resolution: "1080",
    orientation: "landscape",
    fps: 30,
    quality: "high",
  },
];

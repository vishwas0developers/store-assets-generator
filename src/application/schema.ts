import { z } from "zod";

// --- PLATFORM SPEC SCHEMA ---
export const PlatformSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  specVersion: z.string(),
  deviceClasses: z.record(
    z.string(),
    z.object({
      name: z.string(),
      width: z.number(),
      height: z.number(),
      aspectRatio: z.string(),
      minScreenshots: z.number().default(2),
      maxScreenshots: z.number().default(8),
      required: z.boolean().default(false),
    })
  ),
  video: z.object({
    required: z.boolean().default(false),
    formats: z.array(z.string()),
    minDurationSeconds: z.number(),
    maxDurationSeconds: z.number(),
    maxSizeBytes: z.number(),
    resolutions: z.array(
      z.object({
        width: z.number(),
        height: z.number(),
      })
    ),
  }).optional(),
});

export type PlatformSpec = z.infer<typeof PlatformSpecSchema>;


// --- TEMPLATE SCHEMA ---
export const LayerAnimationSchema = z.object({
  property: z.enum([
    "translateX", "translateY", 
    "scale", "scaleX", "scaleY", 
    "rotate", "rotateX", "rotateY", "rotateZ",
    "opacity", "blur"
  ]),
  from: z.union([z.number(), z.string()]),
  to: z.union([z.number(), z.string()]),
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "spring", "easeOutCubic"]),
  start: z.number(), // frame index or normalized percentage
  duration: z.number(), // frame count
});

export interface LayerType {
  type: "background" | "image" | "text" | "shape" | "logo" | "device-mockup" | "group" | "camera";
  id?: string;
  content?: string;
  from?: string;
  device?: string;
  screenshot?: string;
  transform?: Record<string, number | string | boolean>;
  animations?: z.infer<typeof LayerAnimationSchema>[];
  layers?: LayerType[];
}

export const LayerSchema: z.ZodType<LayerType> = z.lazy(() => z.object({
  type: z.enum(["background", "image", "text", "shape", "logo", "device-mockup", "group", "camera"]),
  id: z.string().optional(),
  content: z.string().optional(),
  from: z.string().optional(),
  device: z.string().optional(),
  screenshot: z.string().optional(),
  transform: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  animations: z.array(LayerAnimationSchema).optional(),
  layers: z.array(LayerSchema).optional(),
}));

export const TemplateSchema = z.object({
  meta: z.object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    engineVersion: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
  }),
  compatibility: z.object({
    platforms: z.array(z.string()),
    outputs: z.array(z.enum(["screenshots", "video"])),
    aspectRatios: z.array(z.string()),
    minScreenshots: z.number(),
    maxScreenshots: z.number(),
  }),
  slots: z.record(
    z.string(),
    z.object({
      type: z.enum(["text", "image", "text[]", "image[]", "palette", "audio"]),
      required: z.boolean().default(true),
    })
  ),
  theme: z.object({
    background: z.object({
      type: z.enum(["solid", "gradient", "image"]),
      preset: z.string().optional(),
      colorOne: z.string().optional(),
      colorTwo: z.string().optional(),
      image: z.string().optional(),
    }),
    typography: z.record(
      z.string(),
      z.object({
        font: z.string(),
        size: z.number(),
        align: z.enum(["left", "center", "right"]).default("center"),
      })
    ),
    device: z.object({
      default: z.string(),
      style: z.enum(["default", "clay"]).default("default"),
      colorway: z.enum(["light", "dark"]).default("dark"),
    }),
  }),
  panoramic: z.object({
    enabled: z.boolean().default(false),
    image: z.string().optional(),
    flip: z.boolean().default(false),
  }).optional(),
  screenshots: z.object({
    layout: z.string(),
    variants: z.array(z.string()).optional(),
  }),
  timeline: z.object({
    fps: z.number().default(30),
    scenes: z.array(
      z.object({
        id: z.string(),
        durationInFrames: z.number(),
        repeatFor: z.enum(["screenshots"]).optional(),
        layers: z.array(LayerSchema),
      })
    ),
  }).optional(),
  audio: z.object({
    track: z.string(),
    fadeInFrames: z.number().default(0),
    fadeOutFrames: z.number().default(0),
  }).optional(),
});

export type Template = z.infer<typeof TemplateSchema>;


// --- PROJECT DOCUMENT SCHEMA ---
export const ProjectDocumentSchema = z.object({
  app: z.object({
    name: z.string(),
    url: z.string().optional(),
    slug: z.string(),
  }),
  platform: z.string(),
  template: z.object({
    id: z.string(),
    version: z.string(),
  }),
  branding: z.object({
    logo: z.string().optional(),
    palette: z.object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
    }).optional(),
  }).optional(),
  locale: z.string().default("en"),
  screens: z.array(
    z.object({
      id: z.string(),
      sourceUrl: z.string().optional(),
      capture: z.string(), // path to raw capture file
      httpStatus: z.number().optional(), // response status of the captured page; validator flags >= 400
      featureText: z.string().optional(),
      device: z.string().optional(),
      layout: z.string().optional(),
      overrides: z.record(z.any()).optional(),
    })
  ),
  outputs: z.object({
    screenshots: z.boolean().default(true),
    video: z.boolean().default(true),
  }),
});

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;

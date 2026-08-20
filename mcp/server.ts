import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DiscoveryEngine } from "../src/discovery/crawl.js";
import { WebCaptureBackend } from "../src/capture/browser.js";
import { AndroidCaptureBackend } from "../src/android/capture.js";
import { StillCompositionEngine } from "../src/render/still.js";
import { PlaywrightFFmpegVideoEngine } from "../src/render/video.js";
import { AssetValidator } from "../src/validate/report.js";
import { loadPlatformSpec } from "../src/platform/index.js";
import { DEVICE_REGISTRY } from "../src/devices/registry.js";
import { type ProjectDocument } from "../src/project/schema.js";
import { loadAuthConfig, slugify } from "../src/auth/appConfig.js";
import { defaultSessionStatePath } from "../src/capture/auth.js";
import { setCredentials, getCredentialStatus, clearCredentials } from "../src/auth/credentials.js";

const server = new Server(
  {
    name: "store-assets-generator",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Expose MCP Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_screens",
        description: "Discover candidate screens and routes from a frontend target URL",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "Target application URL" },
            maxPages: { type: "number", description: "Max pages to crawl" }
          },
          required: ["url"],
        },
      },
      {
        name: "list_device_profiles",
        description: "List available device models and SVG frame presets in the registry",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_platform_spec",
        description: "Retrieve dimensions, rules, and video constraints for google-play or apple-app-store",
        inputSchema: {
          type: "object",
          properties: {
            platform: { type: "string", description: "Platform ID (google-play | apple-app-store)" }
          },
          required: ["platform"],
        },
      },
      {
        name: "capture_web_screen",
        description:
          "Capture a web screen, authenticating first via the app's configured auth strategy (apps/<slug>/auth.json) and stored/env credentials if needed. Never captures a login screen — fails loudly instead.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
            filename: { type: "string" },
            width: { type: "number" },
            height: { type: "number" },
            outputDir: { type: "string" },
            slug: { type: "string", description: "App slug for apps/<slug>/auth.json lookup; defaults to the URL hostname" }
          },
          required: ["url", "filename", "outputDir"],
        },
      },
      {
        name: "get_auth_status",
        description: "Check whether credentials are configured for demo/test-account auth (never returns the password)",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "set_auth_credentials",
        description: "Write-only: save/update the stored email/password. Never echoes the value back.",
        inputSchema: {
          type: "object",
          properties: {
            email: { type: "string" },
            password: { type: "string", description: "Omit to keep the currently stored password" }
          },
          required: ["email"],
        },
      },
      {
        name: "clear_auth_session",
        description: "Delete the stored credentials and cached browser session",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "capture_android_screen",
        description: "Capture a screenshot from an attached Android device or emulator via adb",
        inputSchema: {
          type: "object",
          properties: {
            filename: { type: "string" },
            outputDir: { type: "string" },
            deviceId: { type: "string" }
          },
          required: ["filename", "outputDir"],
        },
      },
      {
        name: "create_mockup",
        description: "Generate static framed store screenshot images with headlines and styled backgrounds",
        inputSchema: {
          type: "object",
          properties: {
            projectDoc: { type: "object" },
            outputDir: { type: "string" }
          },
          required: ["projectDoc", "outputDir"],
        },
      },
      {
        name: "create_video",
        description: "Render high-quality 3D promotional animation video from project screenshots",
        inputSchema: {
          type: "object",
          properties: {
            projectDoc: { type: "object" },
            outputDir: { type: "string" }
          },
          required: ["projectDoc", "outputDir"],
        },
      },
      {
        name: "validate_package",
        description: "Validate generated screenshots and video package against platform specification",
        inputSchema: {
          type: "object",
          properties: {
            outputDir: { type: "string" },
            platform: { type: "string" }
          },
          required: ["outputDir", "platform"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_screens": {
        const discover = new DiscoveryEngine();
        await discover.initialize();
        const pages = await discover.crawl((args as any).url, { maxPages: (args as any).maxPages || 5 });
        await discover.close();
        return { content: [{ type: "text", text: JSON.stringify(pages, null, 2) }] };
      }

      case "list_device_profiles": {
        return { content: [{ type: "text", text: JSON.stringify(DEVICE_REGISTRY, null, 2) }] };
      }

      case "get_platform_spec": {
        const spec = loadPlatformSpec((args as any).platform);
        return { content: [{ type: "text", text: JSON.stringify(spec, null, 2) }] };
      }

      case "capture_web_screen": {
        const backend = new WebCaptureBackend();
        await backend.initialize();
        const { url, filename, width = 1080, height = 2400, outputDir, slug: slugArg } = args as any;
        const slug = slugArg ?? slugify(url);
        const auth = loadAuthConfig(slug);
        if (auth && !auth.sessionStatePath) auth.sessionStatePath = defaultSessionStatePath(slug);

        try {
          const result = await backend.captureScreen(url, filename, { width, height, outputDir, auth: auth ?? undefined });
          return { content: [{ type: "text", text: JSON.stringify({ path: result.path, auth: result.auth }) }] };
        } finally {
          await backend.close();
        }
      }

      case "get_auth_status": {
        return { content: [{ type: "text", text: JSON.stringify(getCredentialStatus(), null, 2) }] };
      }

      case "set_auth_credentials": {
        const { email, password } = args as any;
        setCredentials(email, password);
        return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
      }

      case "clear_auth_session": {
        clearCredentials();
        return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
      }

      case "capture_android_screen": {
        const backend = new AndroidCaptureBackend();
        const { filename, outputDir, deviceId } = args as any;
        const filePath = await backend.captureScreen(filename, { outputDir, deviceId });
        return { content: [{ type: "text", text: JSON.stringify({ path: filePath }) }] };
      }

      case "create_mockup": {
        const engine = new StillCompositionEngine();
        const { projectDoc, outputDir } = args as any;
        const outputs = await engine.render(projectDoc as ProjectDocument, { outputDir });
        return { content: [{ type: "text", text: JSON.stringify({ screenshots: outputs }) }] };
      }

      case "create_video": {
        const engine = new PlaywrightFFmpegVideoEngine();
        const { projectDoc, outputDir } = args as any;
        const videoPath = await engine.render(projectDoc as ProjectDocument, { outputDir });
        return { content: [{ type: "text", text: JSON.stringify({ videoPath }) }] };
      }

      case "validate_package": {
        const validator = new AssetValidator();
        const spec = loadPlatformSpec((args as any).platform);
        const issues = validator.validatePackage((args as any).outputDir, spec);
        return { content: [{ type: "text", text: JSON.stringify({ issues, valid: issues.length === 0 }, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Tool error: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Store Assets Generator MCP server running on stdio");
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  startMcpServer().catch(console.error);
}

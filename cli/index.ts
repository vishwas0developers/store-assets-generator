#!/usr/bin/env node
import { Command } from "commander";
import { AssetPipeline } from "../src/orchestrator.js";
import { startMcpServer } from "../mcp/server.js";
import { startUiServer } from "../web/server.js";
import { installSkillsAndMcp } from "../install/index.js";
import { setCredentials, getCredentialStatus, clearCredentials, resolveCredentials } from "../src/auth/credentials.js";
import { loadAuthConfig, slugify } from "../src/auth/appConfig.js";
import { defaultSessionStatePath } from "../src/capture/auth.js";
import { WebCaptureBackend } from "../src/capture/browser.js";
import path from "path";

const program = new Command();

program
  .name("store-assets")
  .description("AI Agent-driven Store Assets Generator CLI and MCP Server")
  .version("1.0.0");

program
  .command("generate")
  .description("Run the end-to-end asset generation pipeline")
  .requiredOption("--url <url>", "Target application URL")
  .option("--platform <platform>", "Platform (google-play | apple-app-store)", "google-play")
  .option("--out <outputDir>", "Output directory", path.join(process.cwd(), "output"))
  .option("--slug <slug>", "App slug — resolves apps/<slug>/auth.json (defaults to the URL hostname)")
  .option("--email <email>", "Authentication email/username (overrides the stored credential)")
  .option("--password <password>", "Authentication password (overrides the stored credential)")
  .action(async (options) => {
    try {
      const pipeline = new AssetPipeline();
      const result = await pipeline.run(options.url, options.platform, options.out, {
        slug: options.slug,
        email: options.email,
        password: options.password,
      });
      console.log("Generation complete! Status:", result.validationReport.status);
      if (result.authStatus) {
        console.log(
          `Auth: ${result.authStatus.ok ? "OK" : "FAILED"} (stage: ${result.authStatus.stage ?? "n/a"})${
            result.authStatus.reason ? ` — ${result.authStatus.reason}` : ""
          }`,
        );
      }
    } catch (err) {
      console.error("Pipeline failed:", err);
      process.exit(1);
    }
  });

program
  .command("mcp")
  .description("Start the MCP stdio server")
  .action(async () => {
    await startMcpServer();
  });

program
  .command("ui")
  .description("Start the local web interface (default command — the main manual workflow surface)")
  .option("--port <port>", "Port to listen on", (v) => parseInt(v, 10), Number(process.env.SAG_UI_PORT) || 8787)
  .option("--no-open", "Do not open the browser automatically")
  .action(async (options) => {
    try {
      await startUiServer({ port: options.port, openBrowser: options.open });
    } catch (err) {
      console.error("Failed to start the web interface:");
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("install [agent]")
  .description("Install skills and register MCP server for AI agents (antigravity, claude, cursor, etc.)")
  .action(async (agent) => {
    await installSkillsAndMcp(agent);
  });

const auth = program.command("auth").description("Manage rotating demo/test-account credentials");

auth
  .command("set")
  .description("Save or update the stored email/password (blank password keeps the existing one)")
  .requiredOption("--email <email>", "Account email/username")
  .option("--password <password>", "Account password — omit to keep the currently stored one")
  .action((options) => {
    setCredentials(options.email, options.password);
    console.log(`Credentials saved for ${options.email}.`);
  });

auth
  .command("status")
  .description("Show whether credentials are configured (never prints the password)")
  .action(() => {
    const status = getCredentialStatus();
    console.log(JSON.stringify(status, null, 2));
  });

auth
  .command("clear")
  .description("Delete the stored credentials")
  .action(() => {
    clearCredentials();
    console.log("Stored credentials cleared.");
  });

auth
  .command("test")
  .description("Run preflight + login + verification against a configured app, without capturing anything")
  .requiredOption("--url <url>", "Target application URL")
  .option("--slug <slug>", "App slug — resolves apps/<slug>/auth.json (defaults to the URL hostname)")
  .action(async (options) => {
    const slug = options.slug ?? slugify(options.url);
    const authConfig = loadAuthConfig(slug);
    if (!authConfig) {
      console.error(`No apps/${slug}/auth.json found — nothing to test. Public/unauthenticated capture will still work.`);
      process.exit(1);
    }
    const creds = resolveCredentials();
    if (!creds) {
      console.error("No credentials configured — run `store-assets auth set --email ... --password ...` first.");
      process.exit(1);
    }
    if (!authConfig.sessionStatePath) authConfig.sessionStatePath = defaultSessionStatePath(slug);

    const backend = new WebCaptureBackend();
    await backend.initialize();
    try {
      const result = await backend.captureScreen(options.url, "auth-test.png", {
        width: 1080,
        height: 2400,
        outputDir: path.join(process.cwd(), ".auth", "test"),
        auth: authConfig,
      });
      console.log(`Auth OK (stage: ${result.auth?.stage}). Test screenshot: ${result.path}`);
    } catch (err) {
      console.error(`Auth test FAILED: ${(err as Error).message}`);
      process.exit(1);
    } finally {
      await backend.close();
    }
  });

program.parse(process.argv);

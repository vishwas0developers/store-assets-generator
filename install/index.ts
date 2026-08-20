import fs from "fs";
import path from "path";
import os from "os";

export const SKILL_DEFINITIONS: Record<string, string> = {
  "store-assets-overview": `---
name: store-assets-overview
description: Overview of Store Assets Generator workflow (AI Agent + Skills + MCP + Generator Core).
---
# Store Assets Overview
Store Assets Generator allows an AI agent to understand an application, pick key screens, write accurate feature text, and render marketing screenshots and animated promotional videos deterministically via MCP tools.
`,
  "store-assets-capture": `---
name: store-assets-capture
description: Guide for capturing authenticated and unauthenticated screens using Playwright or Android adb.
---
# Screen Capture Workflow
1. Use \`list_screens\` tool to discover available routes.
2. Use \`capture_web_screen\` with optional credentials (email/password) to authenticate and capture the internal authenticated app UI.
3. For Android native flows, use \`capture_android_screen\`.
`,
  "store-assets-write-copy": `---
name: store-assets-write-copy
description: Guidelines for generating truthful and accurate feature copy from observed UI and source code.
---
# Writing Feature Copy
1. Inspect real UI elements and titles.
2. Never invent features that are not observed in code or screenshots.
3. Write concise, value-driven headlines (3-6 words) suitable for Google Play / App Store listing images.
`
};

export async function installSkillsAndMcp(agentName?: string) {
  console.log(`Installing skills and configuring MCP for agent: ${agentName || "all detected agents"}...`);
  
  const homeDir = os.homedir();
  const targetDirs = [
    path.join(homeDir, ".gemini", "antigravity-ide", "skills"),
    path.join(homeDir, ".claude", "skills"),
    path.join(homeDir, ".cursor", "skills"),
    path.join(process.cwd(), ".agents", "skills")
  ];

  for (const skillDir of targetDirs) {
    fs.mkdirSync(skillDir, { recursive: true });
    for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
      const skillPath = path.join(skillDir, `${name}.md`);
      fs.writeFileSync(skillPath, content, "utf-8");
    }
  }

  console.log("Successfully installed Store Assets Generator skills to agent directories!");
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './generate/player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log("Rebuilding all 10 default standalone templates with authentic designs and playable player controllers...");

  // Import compiled render engine modules
  const renderModule = await import('../dist/src/video/render.js');
  const tempOrigModule = await import('../dist/src/video/temp_orig_templates.js');

  const {
    sceneLayoutCss,
    sceneContentHtml,
    CANVAS_BASE_CSS,
    DEVICE_CSS,
    WORD_SPAN_CSS,
    foldRigCss,
    SCENE_ANIMATIONS,
    DEVICE_REGISTRY,
    sourceUrisFor,
    sourceKindsFor,
    scratchVideoProject
  } = renderModule;

  const originalTemplates = tempOrigModule.VIDEO_TEMPLATES;
  const outBaseDir = path.join(rootDir, 'templates', 'video');
  fs.mkdirSync(outBaseDir, { recursive: true });

  // Re-generate the 10 original templates with their pristine design and CSS keyframes
  for (const t of originalTemplates) {
    const tplDir = path.join(outBaseDir, t.id);
    fs.mkdirSync(tplDir, { recursive: true });

    const scratch = tempOrigModule.scratchVideoProject(t.id);
    scratch.template = null; // Forces templatePreviewHtml to run its full original CSS + keyframes generation engine!
    const rawHtml = renderModule.templatePreviewHtml(scratch);

    const playerComponents = getUniversalPlayerScriptAndStyle(t);

    // Inject player style into <head>, player html + config + player script before </body>
    let fullHtml = rawHtml;

    // Remove the old inline preview script from rawHtml
    fullHtml = fullHtml.replace(/<script>[\s\S]*?<\/script>/, '');

    // Inject styles
    fullHtml = fullHtml.replace('</style>', `${playerComponents.style}\n  </style>`);

    // Inject manifest config, player HTML, and interactive player script
    const injection = `
  ${playerComponents.html}

  <script type="application/json" id="template-config">
${JSON.stringify(t, null, 2)}
  </script>

  ${playerComponents.script}
`;
    fullHtml = fullHtml.replace('</body>', `${injection}\n</body>`);

    fs.writeFileSync(path.join(tplDir, 'template.html'), fullHtml);
    console.log(`[OK] Recreated authentic original template: ${t.id} (${t.aspectRatio}, ${t.device})`);
  }

  console.log("All 10 default templates successfully generated!");
}

main().catch(err => {
  console.error("Error generating templates:", err);
  process.exit(1);
});

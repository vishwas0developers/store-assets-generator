// Templates module — template discovery, grid rendering, filter tabs,
// client-side template HTML screen generator, and applying templates to project.

import {
  mockupTemplates,
  mockupTemplateCategory,
  mockupTemplateDetailId,
  setMockupTemplates,
  setMockupTemplateCategory,
  setMockupTemplateDetailId,
  mockupId,
  mockupProject,
  setMockupId,
  setMockupProject,
  setMockupHistory,
  pushMockupHistory
} from './state.js';
import { api, showAlert, showConfirm, showToast } from './utils.js';
import { renderMockupCanvas } from './canvas.js';
import { renderMockupMatrix, selectMockupScreen } from './matrix.js';

let mockupDevicesCatalog = [];
let mockupLayouts = { presets: [], grouped: [] };

/** Fetches and caches device catalog + layout presets, populating the Layout Preset select once. */
export async function ensureMockupReferenceData() {
  if (mockupDevicesCatalog.length === 0) {
    try {
      const res = await api("/api/devices");
      mockupDevicesCatalog = Array.isArray(res) ? res : (Array.isArray(res?.devices) ? res.devices : []);
    } catch (_) {}
  }
  if (mockupLayouts.presets.length === 0) {
    try {
      mockupLayouts = await api("/api/mockups/layouts");
      const layoutSelect = document.getElementById("mk-layout");
      if (layoutSelect && mockupLayouts.grouped) {
        layoutSelect.innerHTML = mockupLayouts.grouped
          .map((g) => `<optgroup label="${g.name}">${g.slugs.map((s) => `<option value="${s}">${mockupLayouts.presets.find((p) => p.slug === s)?.name ?? s}</option>`).join("")}</optgroup>`)
          .join("");
      }
    } catch (_) {}
  }
}

/** Loads (or clears) the mockup project for a given project id — the entry point when switching into the Studio Mockup tab. */
export async function loadMockupProjectInto(id) {
  setMockupId(id);
  const label = document.getElementById("mockup-project-label");
  if (id) {
    try {
      const proj = await api(`/api/mockups/${id}`);
      setMockupProject(proj);
      if (label) label.textContent = proj.name || "Mockup Project";
      setMockupHistory([JSON.stringify(proj)], 0);
    } catch (e) {
      console.error("Failed to load mockup project:", e);
      setMockupProject(null);
      if (label) label.textContent = "No mockup project loaded";
    }
  } else {
    setMockupProject(null);
    if (label) label.textContent = "No mockup project selected";
  }

  await ensureMockupReferenceData();
  await renderMockupTemplateGrid();

  if (mockupProject) {
    renderMockupCanvas();
    renderMockupMatrix();
    if (mockupProject.columns?.length > 0) {
      selectMockupScreen(mockupProject.columns[0].id);
    }
  } else {
    const table = document.getElementById("mockup-matrix");
    if (table) table.innerHTML = `<tr><td class="hint" style="padding:2rem; text-align:center;">Select or create a project first from the Projects List.</td></tr>`;
  }
}

export const CATEGORY_LABELS = {
  all: "All",
  books: "Books",
  business: "Business",
  education: "Education",
  entertainment: "Entertainment",
  fintech: "Fintech & Crypto",
  "food-and-drink": "Food & Drink",
  "health-and-fitness": "Health & Fitness",
  modern: "Modern & Minimal",
  music: "Music",
  "photo-and-video": "Photo & Video",
  productivity: "Productivity",
  professional: "Professional & Corporate",
  "shopping-and-e-commerce": "Shopping & E-Commerce",
  "social-networking": "Social Networking",
  "travel-and-local": "Travel & Local",
  utilities: "Utilities"
};

function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

const EXTRA_STARTER_TEMPLATES = [
  {
    id: "modern-minimalist-1",
    name: "Modern Glass Minimalist",
    category: "modern",
    description: "Sleek obsidian dark mode with glassmorphism glow and floating iPhone 16 Pro Max.",
    devices: [{ deviceId: "apple-iphone-16-pro-max", label: "6.7 Inch Phone" }],
    columnCount: 5,
    layout: "rotated-left-1-title-above",
    background: { type: "pattern", value: "mesh" },
    titles: ["Next-Gen Experience", "Fluid Interface", "Dark Mode First", "Instant Sync", "Pure Focus"],
    subtitles: [
      "Engineered for seamless productivity",
      "Intuitive gestures and smooth motion",
      "Designed to reduce eye strain",
      "Realtime cloud updates across devices",
      "Distraction-free environment"
    ]
  },
  {
    id: "modern-studio-neon",
    name: "Modern Neon Studio",
    category: "modern",
    description: "Vibrant neon ring dark background with continuous overlapping screen cards.",
    devices: [{ deviceId: "apple-iphone-17-pro-max", label: "6.9 Inch Phone" }],
    columnCount: 5,
    layout: "two-devices-title-below",
    background: { type: "pattern", value: "neon-rings" },
    titles: ["Vibrant Workflows", "Smart Insights", "Automated Action", "Custom Views", "Instant Sharing"],
    subtitles: [
      "Bring your ideas to life with speed",
      "AI-powered analytics at a glance",
      "Set up triggers in seconds",
      "Tailor dashboard to your workflow",
      "Export and share with your team"
    ]
  },
  {
    id: "professional-corporate-suite",
    name: "Professional Corporate Suite",
    category: "professional",
    description: "Clean grid pattern layout with tablet & phone for enterprise SaaS.",
    devices: [
      { deviceId: "ipad-pro-12-9", label: "12.9 Inch Tablet" },
      { deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }
    ],
    columnCount: 5,
    layout: "two-devices-connected-left-title-above",
    background: { type: "pattern", value: "grid" },
    titles: ["Enterprise Command", "Team Workspaces", "Advanced Security", "Custom Reports", "24/7 Priority"],
    subtitles: [
      "Manage operations from one hub",
      "Collaborate seamlessly across units",
      "Bank-grade encryption & compliance",
      "Automated PDF and Excel exports",
      "Dedicated account management"
    ]
  },
  {
    id: "professional-executive-dark",
    name: "Executive Dark Edition",
    category: "professional",
    description: "Subtle matte sphere radial gradient for executive analytics.",
    devices: [{ deviceId: "samsung-galaxy-s24", label: "Galaxy Phone" }],
    columnCount: 5,
    layout: "left-side-title-above",
    background: { type: "pattern", value: "matte-spheres" },
    titles: ["Executive Metrics", "Live Revenue", "Global Operations", "Risk Radar", "Board Reports"],
    subtitles: [
      "High-level KPIs on a single screen",
      "Track cashflow across currencies",
      "Monitor regional performance",
      "Early warnings and anomaly detection",
      "Generate presentation-ready slides"
    ]
  },
  {
    id: "fintech-crypto-pro",
    name: "Fintech & Crypto Portfolio",
    category: "fintech",
    description: "Cyberpunk blueprint HUD pattern layout for trading and crypto wallets.",
    devices: [{ deviceId: "apple-iphone-18-pro-max", label: "6.9 Inch Phone" }],
    columnCount: 5,
    layout: "tilted-right-title-above",
    background: { type: "pattern", value: "blueprint-hud" },
    titles: ["Trade Instantly", "Live Markets", "DeFi Staking", "Cold Vault", "Zero Slippage"],
    subtitles: [
      "Buy and sell 200+ crypto assets",
      "Realtime order book & candlestick charts",
      "Earn up to 12% APY on stablecoins",
      "Hardware key protection for funds",
      "Institutional grade execution speed"
    ]
  },
  {
    id: "health-fitness-trainer",
    name: "Health & Fitness Trainer",
    category: "health-and-fitness",
    description: "Energetic sunset gradient layout with dual overlapping devices for workout apps.",
    devices: [
      { deviceId: "samsung-galaxy-s24", label: "Galaxy Phone" },
      { deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }
    ],
    columnCount: 5,
    layout: "two-devices-connected-right-title-below",
    background: { type: "gradient", value: "sunset" },
    titles: ["Track Workouts", "Heart Rate Monitor", "Custom Routines", "Meal Planner", "Achieve Goals"],
    subtitles: [
      "Log sets, reps, and personal bests",
      "Sync with smartwatch sensors",
      "AI generated training programs",
      "Macro-counted delicious recipes",
      "Stay motivated with daily streaks"
    ]
  },
  {
    id: "shopping-luxury-boutique",
    name: "Shopping & E-Commerce Boutique",
    category: "shopping-and-e-commerce",
    description: "Warm cream solid layout with staggered luxury product showcase.",
    devices: [{ deviceId: "apple-iphone-16-pro-max", label: "6.7 Inch Phone" }],
    columnCount: 5,
    layout: "single-title-above",
    background: { type: "solid", value: "solid-cream" },
    textColor: "#1c1c1c",
    titles: ["Curated Fashion", "AR Try-On", "Express Checkout", "Track Delivery", "VIP Lounge"],
    subtitles: [
      "Discover exclusive designer drops",
      "See products in 3D before buying",
      "Pay securely with Apple Pay",
      "Live GPS tracking to your door",
      "Unlock rewards and early access"
    ]
  },
  {
    id: "ai-assistant-cyber",
    name: "AI Copilot & Assistant",
    category: "modern",
    description: "Aurora cyan-blue gradient with single rotated device.",
    devices: [{ deviceId: "google-pixel-9", label: "Pixel Phone" }],
    columnCount: 5,
    layout: "tilted-left-title-above",
    background: { type: "gradient", value: "aurora" },
    titles: ["AI Copilot", "Smart Voice", "Document Search", "Auto Workflow", "Infinite Possibilities"],
    subtitles: [
      "Ask questions and generate answers",
      "Natural speech-to-action engine",
      "Extract insights from any PDF",
      "Automate tedious daily tasks",
      "Powered by state-of-the-art LLMs"
    ]
  }
];

export async function ensureMockupTemplates() {
  if (mockupTemplates.length === 0) {
    try {
      const res = await api("/api/mockups/templates");
      const raw = res.templates || [];
      const ids = new Set(raw.map((t) => t.id));
      const merged = raw.concat(EXTRA_STARTER_TEMPLATES.filter((t) => !ids.has(t.id)));
      setMockupTemplates(merged);
    } catch (e) {
      setMockupTemplates(EXTRA_STARTER_TEMPLATES);
    }
  }
  return mockupTemplates;
}

export function templateCategoryCounts(templates) {
  const counts = {};
  for (const t of templates) {
    const cat = t.category || "modern";
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return Object.keys(counts)
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)))
    .map((id) => ({ id, label: categoryLabel(id), count: counts[id] }));
}

export function renderMockupTemplateFilters(templates) {
  const rail = document.getElementById("mockup-template-filters");
  if (!rail) return;
  const cats = templateCategoryCounts(templates);
  rail.innerHTML = [`<div class="filter-item ${mockupTemplateCategory === "all" ? "active" : ""}" data-cat="all">All <span class="count">${templates.length}</span></div>`]
    .concat(cats.map((c) => `<div class="filter-item ${mockupTemplateCategory === c.id ? "active" : ""}" data-cat="${c.id}">${c.label} <span class="count">${c.count}</span></div>`))
    .join("");
  rail.querySelectorAll(".filter-item").forEach((el) => {
    el.onclick = () => {
      setMockupTemplateCategory(el.dataset.cat);
      renderMockupTemplateFilters(templates);
      renderMockupTemplateCards(templates);
    };
  });
}

function getClientTemplateScreenHtml(t, screenIdx) {
  const bgType = t.background ? t.background.type : "gradient";
  const bgVal = t.background ? t.background.value : "sunset";
  let bgCss = "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)";
  if (bgType === "solid") {
    bgCss = bgVal === "solid-cream" ? "#faf5ef" : bgVal;
  } else if (bgVal === "sunset") {
    bgCss = "linear-gradient(135deg, #f05a28 0%, #e80a89 100%)";
  } else if (bgVal === "aurora") {
    bgCss = "linear-gradient(145deg, #09131d 0%, #0d2838 50%, #061a24 100%)";
  } else if (bgVal === "midnight") {
    bgCss = "linear-gradient(145deg, #110d24 0%, #201740 50%, #0d081c 100%)";
  } else if (bgVal === "oceanic") {
    bgCss = "linear-gradient(145deg, #0a1c24 0%, #0e3444 50%, #081720 100%)";
  } else if (bgVal === "obsidian") {
    bgCss = "linear-gradient(145deg, #0b0d14 0%, #151928 50%, #0d0f1a 100%)";
  } else if (bgVal === "emerald") {
    bgCss = "linear-gradient(145deg, #071c14 0%, #0d3826 50%, #061710 100%)";
  } else if (bgVal === "neon-purple") {
    bgCss = "linear-gradient(145deg, #180924 0%, #34124e 50%, #12051c 100%)";
  } else if (bgVal === "corporate-navy") {
    bgCss = "linear-gradient(145deg, #0f172a 0%, #1e3a8a 50%, #090d16 100%)";
  } else if (bgVal === "cyberpunk") {
    bgCss = "linear-gradient(145deg, #0d021a 0%, #2a0845 50%, #64157d 100%)";
  } else if (bgVal === "grid" || bgVal === "blueprint-hud") {
    bgCss = "radial-gradient(circle at 50% 30%, #1e293b 0%, #0f172a 100%)";
  }

  const title = (t.titles && t.titles[screenIdx]) || `Screen ${screenIdx + 1}`;
  const subtitle = (t.subtitles && t.subtitles[screenIdx]) || "";
  const isTitleBelow = (t.layout || "").includes("title-below") || (t.layout || "").includes("caption-below");
  const textColor = t.textColor || "#ffffff";
  const cat = t.category || "general";
  let appScreenContent = "";

  if (cat === "fintech") {
    appScreenContent = `
      <rect x="40" y="40" width="600" height="280" rx="36" fill="url(#cardGrad)" />
      <text x="80" y="100" fill="rgba(255,255,255,0.7)" font-size="24" font-weight="600">TOTAL BALANCE</text>
      <text x="80" y="170" fill="#ffffff" font-size="56" font-weight="800">$24,850.40</text>
      <rect x="80" y="210" width="140" height="44" rx="22" fill="#10b981" fill-opacity="0.25"/>
      <text x="150" y="238" fill="#10b981" font-size="22" font-weight="700" text-anchor="middle">+14.2%</text>

      <g transform="translate(40, 360)">
        <rect x="0" y="0" width="180" height="90" rx="24" fill="rgba(255,255,255,0.1)"/>
        <text x="90" y="54" fill="#ffffff" font-size="26" font-weight="700" text-anchor="middle">Send</text>
        <rect x="210" y="0" width="180" height="90" rx="24" fill="rgba(255,255,255,0.1)"/>
        <text x="300" y="54" fill="#ffffff" font-size="26" font-weight="700" text-anchor="middle">Receive</text>
        <rect x="420" y="0" width="180" height="90" rx="24" fill="rgba(255,255,255,0.1)"/>
        <text x="510" y="54" fill="#ffffff" font-size="26" font-weight="700" text-anchor="middle">Invest</text>
      </g>

      <text x="40" y="510" fill="#ffffff" font-size="30" font-weight="800">Recent Transactions</text>
      ${[0, 1, 2, 3].map((i) => `
        <g transform="translate(40, ${540 + i * 110})">
          <rect x="0" y="0" width="600" height="90" rx="24" fill="rgba(255,255,255,0.06)"/>
          <circle cx="50" cy="45" r="28" fill="${i === 0 ? '#3b82f6' : i === 1 ? '#10b981' : i === 2 ? '#ec4899' : '#f59e0b'}"/>
          <rect x="100" y="28" width="200" height="16" rx="8" fill="#ffffff" opacity="0.9"/>
          <rect x="100" y="52" width="130" height="12" rx="6" fill="#9ca3af"/>
          <text x="560" y="52" fill="${i === 1 ? '#10b981' : '#ffffff'}" font-size="26" font-weight="700" text-anchor="end">${i === 1 ? '+$1,200.00' : '-$64.50'}</text>
        </g>
      `).join('')}
    `;
  } else if (cat === "health-and-fitness") {
    appScreenContent = `
      <g transform="translate(340, 240)">
        <circle cx="0" cy="0" r="140" fill="none" stroke="rgba(239,68,68,0.2)" stroke-width="28"/>
        <circle cx="0" cy="0" r="140" fill="none" stroke="#ef4444" stroke-width="28" stroke-dasharray="880" stroke-dashoffset="200"/>
        <circle cx="0" cy="0" r="104" fill="none" stroke="rgba(16,185,129,0.2)" stroke-width="24"/>
        <circle cx="0" cy="0" r="104" fill="none" stroke="#10b981" stroke-width="24" stroke-dasharray="653" stroke-dashoffset="140"/>
        <circle cx="0" cy="0" r="72" fill="none" stroke="rgba(59,130,246,0.2)" stroke-width="20"/>
        <circle cx="0" cy="0" r="72" fill="none" stroke="#3b82f6" stroke-width="20" stroke-dasharray="452" stroke-dashoffset="80"/>
      </g>

      <g transform="translate(40, 440)">
        <rect x="0" y="0" width="285" height="170" rx="28" fill="rgba(255,255,255,0.08)"/>
        <text x="36" y="50" fill="#ef4444" font-size="22" font-weight="700">MOVE</text>
        <text x="36" y="115" fill="#ffffff" font-size="44" font-weight="800">640 <tspan font-size="24" font-weight="500">kcal</tspan></text>

        <rect x="315" y="0" width="285" height="170" rx="28" fill="rgba(255,255,255,0.08)"/>
        <text x="351" y="50" fill="#10b981" font-size="22" font-weight="700">EXERCISE</text>
        <text x="351" y="115" fill="#ffffff" font-size="44" font-weight="800">42 <tspan font-size="24" font-weight="500">min</tspan></text>
      </g>

      <g transform="translate(40, 640)">
        <rect x="0" y="0" width="600" height="240" rx="28" fill="rgba(255,255,255,0.06)"/>
        <text x="36" y="54" fill="#ffffff" font-size="28" font-weight="700">Heart Rate Activity</text>
        <path d="M 40 170 Q 140 80 220 150 T 380 110 T 500 170 T 560 90" fill="none" stroke="#ef4444" stroke-width="6"/>
      </g>
    `;
  } else if (cat === "shopping-and-e-commerce") {
    appScreenContent = `
      <rect x="40" y="40" width="600" height="420" rx="36" fill="rgba(255,255,255,0.12)"/>
      <circle cx="340" cy="220" r="110" fill="url(#cardGrad)"/>
      <rect x="70" y="390" width="300" height="24" rx="12" fill="#ffffff"/>
      <rect x="70" y="430" width="160" height="20" rx="10" fill="#ec4899"/>

      <g transform="translate(40, 500)">
        <text x="0" y="60" fill="#ffffff" font-size="48" font-weight="800">$149.00</text>
        <rect x="320" y="10" width="280" height="80" rx="24" fill="#ec4899"/>
        <text x="460" y="58" fill="#ffffff" font-size="26" font-weight="700" text-anchor="middle">Add to Cart</text>
      </g>

      <g transform="translate(40, 620)">
        <rect x="0" y="0" width="285" height="260" rx="28" fill="rgba(255,255,255,0.06)"/>
        <rect x="315" y="0" width="285" height="260" rx="28" fill="rgba(255,255,255,0.06)"/>
      </g>
    `;
  } else {
    appScreenContent = `
      <rect x="40" y="40" width="600" height="240" rx="36" fill="url(#cardGrad)"/>
      <rect x="80" y="80" width="240" height="20" rx="10" fill="#ffffff"/>
      <rect x="80" y="120" width="380" height="32" rx="16" fill="#ffffff" opacity="0.9"/>
      <rect x="80" y="180" width="160" height="44" rx="22" fill="rgba(255,255,255,0.2)"/>

      <g transform="translate(40, 320)">
        <rect x="0" y="0" width="285" height="200" rx="28" fill="rgba(255,255,255,0.07)"/>
        <rect x="315" y="0" width="285" height="200" rx="28" fill="rgba(255,255,255,0.07)"/>
      </g>

      <g transform="translate(40, 550)">
        <rect x="0" y="0" width="600" height="110" rx="24" fill="rgba(255,255,255,0.05)"/>
        <rect x="0" y="140" width="600" height="110" rx="24" fill="rgba(255,255,255,0.05)"/>
      </g>
    `;
  }

  const titleEscaped = escapeHtmlAttr(title);
  const subtitleEscaped = escapeHtmlAttr(subtitle);

  const textBlock = `
    <div style="padding: 60px 40px; text-align: center; color: ${textColor}; z-index: 10; width: 100%;">
      <h2 style="font-size: 52px; font-weight: 800; margin: 0; letter-spacing: -0.03em; line-height: 1.15; text-shadow: 0 4px 20px rgba(0,0,0,0.5);">${titleEscaped}</h2>
      ${subtitle ? `<p style="font-size: 26px; opacity: 0.85; margin: 16px 0 0 0; font-weight: 500; line-height: 1.3;">${subtitleEscaped}</p>` : ""}
    </div>
  `;

  const isTwoDevices = (t.layout || "").includes("two-devices") || (t.layout || "").includes("the-airbnb");
  const isTiltedLeft = (t.layout || "").includes("tilted-left") || (t.layout || "").includes("rotated-left");
  const isTiltedRight = (t.layout || "").includes("tilted-right") || (t.layout || "").includes("rotated-right");

  let mainTransform = "none";
  if (isTiltedLeft) mainTransform = "rotate(-10deg) translateY(40px)";
  if (isTiltedRight) mainTransform = "rotate(10deg) translateY(40px)";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    html, body { width: 1080px; height: 1920px; overflow: hidden; background: ${bgCss}; }
    body { display: flex; flex-direction: column; justify-content: space-between; align-items: center; position: relative; }

    .canvas-wrapper { width: 1080px; height: 1920px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; position: relative; padding: 40px 0; }

    .device-stage { position: relative; width: 1080px; height: 1350px; display: flex; justify-content: center; align-items: flex-end; }

    .device-frame {
      width: 720px;
      height: 1320px;
      background: #0f1117;
      border-radius: 56px;
      border: 12px solid #1e2230;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 40px 100px rgba(0,0,0,0.65);
      transform: ${mainTransform};
      transform-origin: bottom center;
      z-index: 2;
    }

    .device-frame.secondary {
      position: absolute;
      left: 480px;
      top: 80px;
      transform: rotate(6deg) scale(0.92);
      opacity: 0.9;
      z-index: 1;
    }

    .dynamic-island {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      width: 220px;
      height: 38px;
      background: #000000;
      border-radius: 19px;
      z-index: 20;
    }

    .screen-content {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      padding-top: 60px;
    }
  </style>
</head>
<body>
  <div class="canvas-wrapper">
    ${isTitleBelow ? "" : textBlock}
    <div class="device-stage">
      <div class="device-frame">
        <div class="dynamic-island"></div>
        <div class="screen-content">
          <svg width="680" height="1200" viewBox="0 0 680 1200">
            <defs>
              <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#3b82f6"/>
                <stop offset="100%" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
            ${appScreenContent}
          </svg>
        </div>
      </div>
      ${isTwoDevices ? `
        <div class="device-frame secondary">
          <div class="dynamic-island"></div>
          <div class="screen-content">
            <svg width="680" height="1200" viewBox="0 0 680 1200">
              ${appScreenContent}
            </svg>
          </div>
        </div>
      ` : ""}
    </div>
    ${isTitleBelow ? textBlock : ""}
  </div>
</body>
</html>`;
}

function escapeHtmlAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderMockupTemplateCards(templates) {
  const grid = document.getElementById("mockup-template-grid");
  if (!grid) return;
  const filtered = mockupTemplateCategory === "all" ? templates : templates.filter((t) => t.category === mockupTemplateCategory);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="template-empty" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #9aa0a6;">No templates found in this category.</div>`;
    return;
  }

  const CARD_BACKGROUND_TINTS = [
    "#181d2c",
    "#1c192b",
    "#162124",
    "#221c1a",
    "#1a221c",
    "#231a23",
    "#1c2028",
    "#242018",
  ];

  grid.innerHTML = filtered
    .map(
      (t, idx) => {
        const bgTint = CARD_BACKGROUND_TINTS[idx % CARD_BACKGROUND_TINTS.length];
        const isExtra = EXTRA_STARTER_TEMPLATES.some((e) => e.id === t.id);
        const screenCards = Array.from({ length: t.columnCount || 5 }, (_, screenIdx) => {
          const iframeAttr = isExtra
            ? `srcdoc="${escapeHtmlAttr(getClientTemplateScreenHtml(t, screenIdx))}"`
            : `src="/api/mockups/template-screen/${encodeURIComponent(t.id)}/${screenIdx}"`;
          return `
          <div class="filmstrip-card" data-screen="${screenIdx}" title="${(t.titles && t.titles[screenIdx]) || `Screen ${screenIdx + 1}`}">
            <iframe ${iframeAttr} loading="lazy" scrolling="no" tabindex="-1"></iframe>
          </div>
        `;
        }).join("");

        return `
    <div class="template-card" data-id="${t.id}" style="background:${bgTint};">
      <div class="template-card-top">
        <div class="template-card-header">
          <div class="template-card-title-row">
            <h4 class="template-name" title="${t.name}">${t.name}</h4>
            <button type="button" class="template-info-btn" title="View details" data-action="info" aria-label="View more">ℹ</button>
          </div>
          <div class="template-chips">
            <span class="chip-badge chip-free">Free</span>
            <span class="chip-badge">${categoryLabel(t.category)}</span>
            <span class="chip-badge">${t.columnCount || 5} screens</span>
          </div>
        </div>

        <div class="template-card-action-box">
          <button type="button" class="primary template-load-btn" data-action="load">Load Template</button>
          <div class="template-license-caption">Commercial license · Free to use</div>
        </div>
      </div>

      <div class="template-filmstrip" title="Swipe or scroll to view all screens">
        ${screenCards}
      </div>
    </div>`;
      }
    )
    .join("");

  grid.querySelectorAll(".template-card").forEach((card) => {
    const id = card.dataset.id;
    const loadBtn = card.querySelector('[data-action="load"]');
    if (loadBtn) {
      loadBtn.onclick = (e) => { e.stopPropagation(); loadMockupTemplateNow(id); };
    }
    const infoBtn = card.querySelector('[data-action="info"]');
    if (infoBtn) {
      infoBtn.onclick = (e) => { e.stopPropagation(); openMockupTemplateDetail(id); };
    }
    card.onclick = () => openMockupTemplateDetail(id);
  });
}

export function renderTemplateSkeletons(gridId, count = 8) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count })
    .map(
      () => `<div class="template-card skeleton">
        <div class="template-card-top">
          <div class="template-card-header">
            <div class="skeleton-line" style="width:50%; height:1.1rem;"></div>
            <div class="skeleton-line" style="width:70%;"></div>
          </div>
          <div class="template-card-action-box">
            <div class="skeleton-line" style="width:120px; height:2.2rem; border-radius:8px;"></div>
          </div>
        </div>
        <div class="template-filmstrip" style="gap:12px; overflow:hidden;">
          <div class="filmstrip-card skeleton-block"></div>
          <div class="filmstrip-card skeleton-block"></div>
          <div class="filmstrip-card skeleton-block"></div>
        </div>
      </div>`
    )
    .join("");
}

export async function renderMockupTemplateGrid() {
  renderTemplateSkeletons("mockup-template-grid");
  const templates = await ensureMockupTemplates();
  closeMockupTemplateDetail();
  renderMockupTemplateFilters(templates);
  renderMockupTemplateCards(templates);
}

export function openMockupTemplateDetail(id) {
  const t = mockupTemplates.find((x) => x.id === id);
  if (!t) return;
  setMockupTemplateDetailId(id);
  const browse = document.getElementById("mockup-template-browse");
  const detail = document.getElementById("mockup-template-detail");
  if (browse) browse.style.display = "none";
  if (!detail) return;
  detail.style.display = "block";

  const isExtra = EXTRA_STARTER_TEMPLATES.some((e) => e.id === t.id);
  const detailCards = Array.from({ length: t.columnCount || 5 }, (_, screenIdx) => {
    const iframeAttr = isExtra
      ? `srcdoc="${escapeHtmlAttr(getClientTemplateScreenHtml(t, screenIdx))}"`
      : `src="/api/mockups/template-screen/${encodeURIComponent(t.id)}/${screenIdx}"`;
    return `
    <div class="detail-filmstrip-card" title="${(t.titles && t.titles[screenIdx]) || `Screen ${screenIdx + 1}`}">
      <iframe ${iframeAttr} loading="lazy" scrolling="no" tabindex="-1"></iframe>
    </div>
  `;
  }).join("");

  detail.innerHTML = `
    <div class="detail-topbar">
      <button type="button" class="secondary small" id="mockup-detail-back">&larr; Back to templates</button>
      <button type="button" class="primary" id="mockup-detail-load-btn">Load Template</button>
    </div>
    <div class="template-detail template-detail-mockup">
      <div class="template-detail-thumb" style="background:transparent; border:none; box-shadow:none;">
        <div class="detail-filmstrip">
          ${detailCards}
        </div>
      </div>
      <div class="template-detail-side">
        <div class="template-cat">${categoryLabel(t.category)}</div>
        <h2 style="margin:.2rem 0;">${t.name}</h2>
        <p class="hint" style="margin:.3rem 0 1rem;">${t.description || ""}</p>
        <div class="detail-facts">
          <div><span>Screens</span><strong>${t.columnCount || 5}</strong></div>
          <div><span>Layout</span><strong>${(t.layout || "").replace("snapshot-", "Snapshot ").replace(/-/g, " ")}</strong></div>
          <div><span>Devices</span><strong>${(t.devices || []).map((d) => d.label).join(", ")}</strong></div>
        </div>
        ${t.titles && t.titles.length ? `<div class="detail-screens"><span>Screen titles</span><ul>${t.titles.map((x) => `<li>${x}</li>`).join("")}</ul></div>` : ""}
      </div>
    </div>
  `;
  const backBtn = document.getElementById("mockup-detail-back");
  const loadBtn = document.getElementById("mockup-detail-load-btn");
  if (backBtn) backBtn.onclick = closeMockupTemplateDetail;
  if (loadBtn) loadBtn.onclick = () => loadMockupTemplateNow(id);
}

export function closeMockupTemplateDetail() {
  setMockupTemplateDetailId(null);
  const browse = document.getElementById("mockup-template-browse");
  const detail = document.getElementById("mockup-template-detail");
  if (browse) browse.style.display = "";
  if (detail) {
    detail.style.display = "none";
    detail.innerHTML = "";
  }
}

export async function loadMockupTemplateNow(id) {
  if (!mockupId) {
    await showAlert("Start a mockup project first.");
    return;
  }
  const t = mockupTemplates.find((x) => x.id === id);
  if (mockupProject && (mockupProject.devices?.length > 0 || mockupProject.columns?.length > 0)) {
    const ok = await showConfirm("You have unsaved screenshots. Are you sure you want a new project?");
    if (!ok) return;
  }
  try {
    const updatedProj = await api(`/api/mockups/${mockupId}/apply-template`, { method: "POST", body: { templateId: id } });
    setMockupProject(updatedProj);
    pushMockupHistory();
    renderMockupCanvas();
    renderMockupMatrix();
    if (updatedProj.columns?.length > 0) selectMockupScreen(updatedProj.columns[0].id);
    closeMockupTemplateDetail();
    showToast(`Applied "${t ? t.name : id}" — ${updatedProj.devices?.length || 0} device row(s), ${updatedProj.columns?.length || 0} screen(s).`, "success");
  } catch (e) {
    showAlert("Failed to apply template: " + e.message, "error");
  }
}

export const applyTemplate = loadMockupTemplateNow;

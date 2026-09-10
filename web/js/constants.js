// Constants module — shared lookup tables and invariants used across modules.
// Imports from this module are pure data, no side effects.

/**
 * Background gradient fills mapped by value name (e.g. 'ocean', 'citrus', 'violet').
 * Mirrors src/render/shared.ts — each entry is [color0, color1] for a linear gradient
 * running 135° across the 1080×1920 canvas.
 */
export const BG_GRADIENTS = {
  ocean: ['#0f2027', '#203a43', '#2c5364'],
  royal: ['#1e3c72', '#2a5298'],
  sunset: ['#ff512f', '#dd2476'],
  mint: ['#134e5e', '#71b280'],
  graphite: ['#232526', '#414345'],
  light: ['#f8fafc', '#e2e8f0'],
  candy: ['#ee9ca7', '#ffdde1'],
  aurora: ['#00c6ff', '#0072ff'],
  citrus: ['#f7971e', '#ffd200'],
  violet: ['#654ea3', '#eaafc8'],
};

/**
 * Radial gradient fills mapped by value name (e.g. 'studio-spotlight').
 */
export const BG_RADIAL = {
  'studio-spotlight': ['#18181b', '#09090b'],
  'purple-yellow-studio': ['#2e1a47', '#0c0a0f'],
};

/**
 * Solid color fills mapped by value name.
 */
export const BG_SOLIDS = {
  'solid-navy': '#0f1115', 'solid-charcoal': '#1c1c1c', 'solid-white': '#f8fafc',
  'solid-cream': '#f5f0e6', 'solid-indigo': '#2a2a72', 'solid-forest': '#0b3d2e',
};

/**
 * Approximate pattern fills — fabric does not reproduce exact CSS patterns,
 * so we map to base hex colors. Upgrade to fabric.Pattern tiles if fidelity matters.
 */
export const BG_PATTERN_APPROX = {
  dots: '#1e3c72', grid: '#2a2a2a', diagonal: '#0f2027', mesh: '#14161c',
  waves: '#134e5e', 'blueprint-hud': '#0a1118', 'neon-rings': '#0d0d11',
  'matte-spheres': '#0a0a0d', 'split-curve': '#0088ff',
};

/**
 * Layout preset slugs — client-side grammar matches server-side
 * src/mockup/layouts.ts: `[snapshot-]<presentation>-<textPosition>`
 * Valid presentations: single, tilted-left, tilted-right, rotated-left-1/2,
 * rotated-right-1/2, left-side, right-side, two-devices, the-airbnb-left/right.
 * Text positions: title-above, title-below, caption-above, caption-below, no-text.
 */
export const LAYOUT_PRESENTATIONS = {
  single: 'single',
  tiltedLeft: 'tilted-left',
  tiltedRight: 'tilted-right',
  rotatedLeft1: 'rotated-left-1/2',
  rotatedLeft2: 'rotated-right-1/2', // Note: client maps 2 variants
  rotatedRight1: 'rotated-right-1/2',
  rotatedRight2: 'rotated-left-1/2', // client reverse mapping (same set)
  leftSide: 'left-side',
  rightSide: 'right-side',
  twoDevices: 'two-devices',
  twoDevicesConnectedLeft: 'two-devices-connected-left',
  twoDevicesConnectedRight: 'two-devices-connected-right',
  theAirbnbLeft1: 'the-airbnb-left-1',
  theAirbnbLeft2: 'the-airbnb-left-2',
  theAirbnbRight1: 'the-airbnb-right-1',
  theAirbnbRight2: 'the-airbnb-right-2',
};

/** Canonical text position values */
export const TEXT_POSITIONS = ['title-above', 'title-below', 'caption-above', 'caption-below', 'no-text'];

/**
 * Default column style values — applied when a template has no explicit style.
 * Keys match the shape expected by `syncFabricObjectToModel` / `loadColumnIntoFabric`.
 */
export const DEFAULT_STYLE = {
  layout: 'single-title-above',
  background: { type: 'gradient', value: 'ocean' },
  title: { text: '', color: '#ffffff', size: 58, align: 'center', rotation: 0, y: undefined, visible: true },
  subtitle: { text: '', color: '#94a3b8', size: 36, align: 'center', rotation: 0, y: undefined, visible: true },
  deviceOne: { size: 90, x: 0, y: 0, rotation: 0, brightness: 100, visible: true },
  deviceTwo: undefined,
  assetLayers: [],
};
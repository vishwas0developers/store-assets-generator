/** Code-drawn graphics for templates: a page asset layer with a `shape` spec is rendered from this
 *  generated SVG (no image file exists anywhere). Pure string code -- shared by render.ts (preview/export)
 *  and web/js/canvas.js (editor), so both draw the identical picture. */
export interface ShapeSpec {
  type: "roundRect" | "ellipse" | "path";
  /** Drawing box in the layer's own units (e.g. reference px); the layer's width/height % scale it. */
  w: number;
  h: number;
  /** Top-left of the viewBox (paths only) -- lets a path use page coordinates directly. */
  vx?: number;
  vy?: number;
  radius?: number;
  /** Draws rect/ellipse this far inside the box so a centered stroke isn't clipped. */
  inset?: number;
  path?: string;
  fill?: string;
  /** Vertical linear gradient stops: [offset 0-1, color]. Wins over `fill`. */
  gradient?: Array<[number, string]>;
  stroke?: string;
  strokeWidth?: number;
  strokeLinejoin?: "miter" | "round";
  /** Gaussian blur std-deviation (shape units) -- soft shadows/glows. Keep the box padded ~3x this. */
  blur?: number;
}

export function shapeSvg(s: ShapeSpec): string {
  const id = "g";
  const fill = s.gradient ? `url(#${id})` : s.fill ?? "none";
  const grad = s.gradient
    ? `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${s.gradient.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`
    : "";
  const blur = s.blur ? `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s.blur}"/></filter>` : "";
  const defs = grad || blur ? `<defs>${grad}${blur}</defs>` : "";
  const paint = `${s.blur ? 'filter="url(#b)" ' : ""}fill="${fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.strokeWidth ?? 1}" stroke-linejoin="${s.strokeLinejoin ?? "round"}" stroke-linecap="round"` : ""}`;
  const vx = s.vx ?? 0;
  const vy = s.vy ?? 0;
  const i = s.inset ?? 0;
  let el: string;
  if (s.type === "ellipse") el = `<ellipse cx="${vx + s.w / 2}" cy="${vy + s.h / 2}" rx="${s.w / 2 - i}" ry="${s.h / 2 - i}" ${paint}/>`;
  else if (s.type === "roundRect") el = `<rect x="${vx + i}" y="${vy + i}" width="${s.w - 2 * i}" height="${s.h - 2 * i}" rx="${Math.max(0, (s.radius ?? 0) - i)}" ${paint}/>`;
  else el = `<path d="${s.path ?? ""}" ${paint}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="${vx} ${vy} ${s.w} ${s.h}" preserveAspectRatio="none">${defs}${el}</svg>`;
}

export function shapeSvgUri(s: ShapeSpec): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(shapeSvg(s))}`;
}

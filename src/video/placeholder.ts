/** Synthetic placeholder screens for a scene with no uploaded source yet
 *  (e.g. previewing a template before applying it) -- a handful of visually
 *  distinct generic app-screen layouts so the device reads as populated, and
 *  a multi-screen swap is visible even before real screenshots exist. Kept
 *  in its own module (no deps) so both render.ts and slots.ts can import it
 *  without a circular dependency between them. */
const PLACEHOLDER_LAYOUTS = ["list", "grid", "detail", "profile"] as const;
export function placeholderScreenUri(index = 0): string {
  const layout = PLACEHOLDER_LAYOUTS[index % PLACEHOLDER_LAYOUTS.length];
  const header = `<rect width="1020" height="220" fill="#ffffff"/>
    <circle cx="90" cy="110" r="40" fill="#c7d0dc"/>
    <rect x="160" y="86" width="360" height="26" rx="13" fill="#c7d0dc"/>
    <rect x="160" y="128" width="230" height="20" rx="10" fill="#dbe1ea"/>`;
  let body = "";
  if (layout === "list") {
    body = [0, 1, 2, 3]
      .map((i) => `<rect x="60" y="${280 + i * 340}" width="900" height="290" rx="28" fill="#ffffff"/>
      <rect x="100" y="${330 + i * 340}" width="440" height="30" rx="15" fill="#c7d0dc"/>
      <rect x="100" y="${378 + i * 340}" width="600" height="22" rx="11" fill="#dbe1ea"/>
      <rect x="100" y="${418 + i * 340}" width="380" height="22" rx="11" fill="#dbe1ea"/>`)
      .join("");
  } else if (layout === "grid") {
    body = [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return `<rect x="${60 + col * 470}" y="${280 + row * 400}" width="430" height="360" rx="24" fill="#ffffff"/>
      <rect x="${100 + col * 470}" y="${610 + row * 400}" width="330" height="24" rx="12" fill="#c7d0dc"/>`;
      })
      .join("");
  } else if (layout === "detail") {
    body = `<rect x="60" y="280" width="900" height="620" rx="32" fill="#ffffff"/>
      <rect x="100" y="960" width="500" height="40" rx="18" fill="#c7d0dc"/>
      <rect x="100" y="1024" width="820" height="24" rx="11" fill="#dbe1ea"/>
      <rect x="100" y="1064" width="700" height="24" rx="11" fill="#dbe1ea"/>
      <rect x="100" y="1140" width="820" height="120" rx="20" fill="#e1e6ee"/>`;
  } else {
    body = `<circle cx="510" cy="480" r="160" fill="#c7d0dc"/>
      <rect x="260" y="700" width="500" height="34" rx="16" fill="#c7d0dc"/>
      <rect x="330" y="756" width="360" height="22" rx="11" fill="#dbe1ea"/>
      ${[0, 1, 2].map((i) => `<rect x="60" y="${880 + i * 220}" width="900" height="180" rx="24" fill="#ffffff"/>`).join("")}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1020 2340" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <rect width="1020" height="2340" fill="#eef1f6"/>
    ${header}
    ${body}
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export interface DeviceGeometry {
  width: number;
  height: number;
  screenInset: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  cornerRadius?: number;
}

export interface DeviceModel {
  id: string;
  name: string;
  vendor: string;
  platforms: ("google-play" | "apple-app-store")[];
  styles: ("default" | "clay")[];
  colorways: ("light" | "dark")[];
  geometry: DeviceGeometry;
  svgFrame: string; // inline SVG string or generated outline
}

export const DEVICE_REGISTRY: Record<string, DeviceModel> = {
  "apple-iphone-15-pro": {
    id: "apple-iphone-15-pro",
    name: "iPhone 15 Pro",
    vendor: "Apple",
    platforms: ["apple-app-store"],
    styles: ["default", "clay"],
    colorways: ["light", "dark"],
    geometry: {
      width: 1290,
      height: 2796,
      screenInset: { top: 40, left: 40, width: 1210, height: 2716 },
      cornerRadius: 40
    },
    svgFrame: `<svg viewBox="0 0 1290 2796" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="1270" height="2776" rx="100" fill="#1e1e1e" stroke="#444" stroke-width="20"/>
      <!-- Screen Aperture -->
      <rect x="40" y="40" width="1210" height="2716" rx="80" fill="none" stroke="#000" stroke-width="10"/>
      <!-- Dynamic Island -->
      <rect x="495" y="70" width="300" height="70" rx="35" fill="#000"/>
    </svg>`
  },
  "phone": {
    id: "phone",
    name: "Generic Android Phone",
    vendor: "Generic",
    platforms: ["google-play"],
    styles: ["default"],
    colorways: ["dark"],
    geometry: {
      width: 1080,
      height: 2400,
      screenInset: { top: 30, left: 30, width: 1020, height: 2340 },
      cornerRadius: 30
    },
    svgFrame: `<svg viewBox="0 0 1080 2400" xmlns="http://www.w3.org/2000/svg">
      <!-- Device Bezel -->
      <rect x="15" y="15" width="1050" height="2370" rx="60" fill="none" stroke="#222" stroke-width="30"/>
      <!-- Outer Border -->
      <rect x="5" y="5" width="1070" height="2390" rx="70" fill="none" stroke="#444" stroke-width="6"/>
      <!-- Camera Punch Hole -->
      <circle cx="540" cy="70" r="18" fill="#111" stroke="#333" stroke-width="2"/>
    </svg>`
  }
};

// Renders the PWA icon set from one SVG master. Run: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

/** A three-column kanban glyph on an indigo gradient. All glyph points sit inside the 80% maskable safe zone. */
const svg = ({ rounded }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#g)"/>
  <g fill="#fff">
    <rect x="112" y="128" width="80" height="256" rx="22" opacity=".22"/>
    <rect x="216" y="128" width="80" height="256" rx="22" opacity=".22"/>
    <rect x="320" y="128" width="80" height="256" rx="22" opacity=".22"/>
    <rect x="122" y="148" width="60" height="64" rx="12"/><rect x="122" y="224" width="60" height="64" rx="12"/>
    <rect x="226" y="148" width="60" height="96" rx="12"/>
    <rect x="330" y="148" width="60" height="64" rx="12"/><rect x="330" y="224" width="60" height="64" rx="12"/><rect x="330" y="300" width="60" height="64" rx="12"/>
  </g>
</svg>`;

const png = (markup, size, file) => sharp(Buffer.from(markup)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);

await mkdir("public/icons", { recursive: true });
await writeFile("public/icons/icon.svg", svg({ rounded: true }));
await Promise.all([
  png(svg({ rounded: true }), 192, "public/icons/icon-192.png"),
  png(svg({ rounded: true }), 512, "public/icons/icon-512.png"),
  png(svg({ rounded: false }), 512, "public/icons/icon-maskable-512.png"), // full bleed: the OS applies its own mask
  png(svg({ rounded: false }), 180, "public/icons/apple-touch-icon.png"), // iOS rounds it and needs no transparency
]);
console.log("icons generated");

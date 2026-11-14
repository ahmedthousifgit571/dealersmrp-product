// Generates the PWA / favicon icons from the brand mark. Run: node scripts/generate-icons.mjs
// Uses sharp (installed with Next.js). Output is committed, so this only re-runs when the mark changes.
import { writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const glyph = (size, offset) => `
  <g transform="translate(${offset} ${offset}) scale(${size / 24})" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
    <path stroke-width="1.8" d="M3.5 5.5A2 2 0 0 1 5.5 3.5h6.17a2 2 0 0 1 1.42.59l7.32 7.32a2 2 0 0 1 0 2.83l-6.17 6.17a2 2 0 0 1-2.83 0L4.09 13.09a2 2 0 0 1-.59-1.42V5.5Z"/>
    <circle cx="8" cy="8" r="1.5" fill="#ffffff" stroke="none"/>
    <path stroke-width="1.6" d="M10.5 13.5v3M12.75 11.25v4.5M15 12.5v1.5"/>
  </g>`;

// Rounded tile for favicons / iOS; full-bleed with a smaller glyph for Android maskable icons.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>${glyph(320, 96)}
</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>${glyph(240, 136)}
</svg>`;

await mkdir("public/icons", { recursive: true });
await writeFile("src/app/icon.svg", rounded);
const png = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
await png(rounded, 192, "public/icons/icon-192.png");
await png(rounded, 512, "public/icons/icon-512.png");
await png(maskable, 512, "public/icons/maskable-512.png");
await png(rounded, 180, "src/app/apple-icon.png");
console.log("Icons written: src/app/icon.svg, src/app/apple-icon.png, public/icons/*.png");

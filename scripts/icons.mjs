// Renders the app icons the web manifest and iOS need from the SVG mark, so
// they never drift from it: `npm run icons`, then commit public/icons/.
//
//   icon-192.png, icon-512.png   the mark as drawn (rounded square, transparent corners)
//   maskable-512.png             full bleed; the mark sits inside the 80% safe zone
//                                that Android may crop to a circle or squircle
//   apple-touch-icon.png (180)   full bleed and opaque; iOS applies its own mask
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const svg = await readFile(new URL("../public/solvik-favicon.svg", import.meta.url), "utf8");
const out = new URL("../public/icons/", import.meta.url);
await mkdir(out, { recursive: true });

// The mark's own gradient, extended to the edges for the full-bleed variants,
// which then drop the mark's rounded square and keep only the route glyph.
const BLEED = "linear-gradient(135deg, #628f72, #315b43)";

const page = await (await chromium.launch()).newPage();

async function render(file, size, { bleed = false, scale = 1 } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`
    <style>
      html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${bleed ? BLEED : "transparent"}; }
      body { display: flex; align-items: center; justify-content: center; }
      svg { width: ${size * scale}px; height: ${size * scale}px; display: block; }
    </style>${bleed ? svg.replace(/<rect[^>]*\/>/, "") : svg}`);
  await page.screenshot({ path: fileURLToPath(new URL(file, out)), omitBackground: !bleed });
  console.log(`wrote public/icons/${file}`);
}

await render("icon-192.png", 192);
await render("icon-512.png", 512);
// The mark's rounded square is 60/64 of its box; at 0.8 it fits the safe zone.
await render("maskable-512.png", 512, { bleed: true, scale: 0.8 });
await render("apple-touch-icon.png", 180, { bleed: true, scale: 0.84 });

await page.context().browser().close();

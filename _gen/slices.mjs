/* Capture readable viewport-sized slices at a given width, anchored on selectors. */
import { newTab, closeTab, Session, sleep } from "./cdp.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:8765";
const [, , url, widthArg, heightArg, outDir, prefix, ...selectors] = process.argv;
const width = +widthArg, height = +heightArg;
mkdirSync(outDir, { recursive: true });

const tab = await newTab();
const s = await Session.connect(tab.webSocketDebuggerUrl);
await s.send("Page.enable");
await s.send("Runtime.enable");
await s.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
const loaded = s.once("Page.loadEventFired");
await s.send("Page.navigate", { url: BASE + url });
await loaded;
await sleep(800);

// settle reveal animations across the whole document
await s.eval(`(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
  // The observer is async; for a static capture just settle every target.
  document.querySelectorAll("[data-reveal]").forEach(e => e.classList.add("is-visible"));
})()`);
await sleep(1000);

for (const sel of selectors) {
  const [name, css, offsetRaw] = sel.split("::");
  const offset = +(offsetRaw || 0);
  const top = await s.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(css)});
    if (!el) return null;
    return Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY + ${offset}));
  })()`);
  if (top === null) { console.log("MISSING selector:", css); continue; }
  const maxTop = await s.eval(`document.body.scrollHeight - window.innerHeight`);
  const y = Math.min(top, Math.max(0, maxTop));
  const shot = await s.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y, width, height, scale: 1 },
  });
  writeFileSync(`${outDir}/${prefix}-${name}.png`, Buffer.from(shot.data, "base64"));
  console.log("captured", `${prefix}-${name}`, "at y=" + y);
}

s.close();
await closeTab(tab.id);

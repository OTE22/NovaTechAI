import { newTab, Session, sleep, closeTab } from "./cdp.mjs";
const checks = [
  ["/", ".panel-label", "font-size", "11px"],
  ["/", ".training-panel__headline", "font-size", ">=36px"],
  ["/", ".insight-preview__meta", "font-size", "11px"],
  ["/", ".insight-preview__link", "color", "accent"],
  ["/", ".footer-owns", "color", "on-ink-2"],
  ["/", ".cta-band__alt", "margin-bottom", "0px"],
  ["/contact/", ".contact-card__address", "font-size", "28px"],
  ["/research/", ".research-method .training-list__num", "color", "cyan"],
];
const t = await newTab(); const s = await Session.connect(t.webSocketDebuggerUrl);
await s.send("Page.enable"); await s.send("Runtime.enable");
await s.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
let last = null;
for (const [page, sel, prop, expect] of checks) {
  if (page !== last) {
    const l = s.once("Page.loadEventFired");
    await s.send("Page.navigate", { url: "http://127.0.0.1:8765" + page });
    await l; await sleep(700); last = page;
  }
  const got = await s.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return e?getComputedStyle(e).getPropertyValue(${JSON.stringify(prop)}):"MISSING"})()`);
  console.log(`${page.padEnd(12)} ${sel.padEnd(38)} ${prop.padEnd(14)} got=${String(got).padEnd(22)} want=${expect}`);
}
s.close(); await closeTab(t.id);

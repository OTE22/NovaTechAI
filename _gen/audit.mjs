/* Verification run: console/network errors, metadata, heading order, horizontal
   overflow at four breakpoints, mobile-menu pointer + keyboard behaviour, and
   reduced-motion handling. Local tooling only. */

import { newTab, closeTab, Session, sleep } from "./cdp.mjs";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:8765";
const PAGES = [
  "/",
  "/solutions/",
  "/platforms/",
  "/work/",
  "/training/",
  "/research/",
  "/contact/",
  "/blogs/",
  "/blogs/agentic-ai-revenue.html",
  "/404.html",
];
const WIDTHS = [375, 768, 1024, 1440];

const report = { console: [], failed: [], pages: {}, overflow: [] };

async function withPage(fn) {
  const tab = await newTab();
  const s = await Session.connect(tab.webSocketDebuggerUrl);
  await s.send("Page.enable");
  await s.send("Runtime.enable");
  await s.send("Log.enable");
  await s.send("Network.enable");
  try {
    return await fn(s);
  } finally {
    s.close();
    await closeTab(tab.id);
  }
}

async function navigate(s, url, width, height = 900) {
  await s.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 700,
  });
  const loaded = s.once("Page.loadEventFired");
  await s.send("Page.navigate", { url });
  await loaded;
  await sleep(700);
}

/* 1. Console + network + page metadata --------------------------------- */
for (const path of PAGES) {
  await withPage(async (s) => {
    s.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error" || p.type === "warning")
        report.console.push({ path, type: p.type, text: JSON.stringify(p.args?.[0]?.value ?? "") });
    });
    s.on("Runtime.exceptionThrown", (p) =>
      report.console.push({ path, type: "exception", text: p.exceptionDetails?.text }));
    s.on("Log.entryAdded", (p) => {
      if (p.entry.level === "error" || p.entry.level === "warning")
        report.console.push({ path, type: "log:" + p.entry.level, text: p.entry.text });
    });
    s.on("Network.loadingFailed", (p) => report.failed.push({ path, error: p.errorText }));
    s.on("Network.responseReceived", (p) => {
      if (p.response.status >= 400) report.failed.push({ path, status: p.response.status, url: p.response.url });
    });

    await navigate(s, BASE + path, 1440, 1000);
    await sleep(500);

    report.pages[path] = await s.eval(`(() => {
      const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(h => ({ l:+h.tagName[1], t:h.textContent.trim().slice(0,60) }));
      const links = [...document.querySelectorAll("a[href]")].map(a => ({
        href: a.getAttribute("href"),
        text: (a.textContent||"").replace(/\\s+/g," ").trim().slice(0,60),
        target: a.getAttribute("target"), rel: a.getAttribute("rel")
      }));
      let prev = 0, jumps = [];
      headings.forEach(h => { if (prev && h.l > prev + 1) jumps.push("h"+prev+"->h"+h.l+' @ "'+h.t+'"'); prev = h.l; });
      const landmarks = {
        main: document.querySelectorAll("main").length,
        header: document.querySelectorAll("body > header").length,
        footer: document.querySelectorAll("body > footer").length,
        navsLabelled: [...document.querySelectorAll("nav")].every(n => n.hasAttribute("aria-label") || n.hasAttribute("aria-labelledby"))
      };
      return {
        title: document.title, titleLen: document.title.length,
        descLen: (document.querySelector('meta[name=description]')?.content || "").length,
        canonical: document.querySelector('link[rel=canonical]')?.href || null,
        robots: document.querySelector('meta[name=robots]')?.content || null,
        og: !!document.querySelector('meta[property="og:image"]'),
        lang: document.documentElement.lang,
        h1Count: document.querySelectorAll("h1").length,
        h1: document.querySelector("h1")?.textContent.trim().slice(0,70) || null,
        jumps, landmarks,
        imgs: document.images.length,
        dupIds: (() => { const seen={},d=[]; document.querySelectorAll("[id]").forEach(e => { if (seen[e.id]) d.push(e.id); seen[e.id]=1; }); return d; })(),
        inlineStyle: document.querySelectorAll("[style]").length,
        hashLinks: links.filter(l => (l.href||"").includes("#") && !(l.href||"").startsWith("#i-")).map(l => l.href),
        blankNoRel: links.filter(l => l.target === "_blank" && !(/noopener/.test(l.rel||"") && /noreferrer/.test(l.rel||""))).length,
        vagueText: links.filter(l => /^(here|read more|click here|more|link|this)$/i.test(l.text)).map(l=>l.text),
        emptyLinks: links.filter(l => !l.text).length,
        mailtos: [...new Set(links.filter(l=>(l.href||"").startsWith("mailto:")).map(l=>l.href.split("?")[0]))],
        ownership: /You own the data\\. We turn it into intelligence that drives your business\\./.test(document.body.innerText)
      };
    })()`);
  });
}

/* 2. Horizontal overflow at each breakpoint ---------------------------- */
for (const path of PAGES) {
  for (const w of WIDTHS) {
    await withPage(async (s) => {
      await navigate(s, BASE + path, w, w < 700 ? 812 : 900);
      const o = await s.eval(`(() => {
        const vw = document.documentElement.clientWidth;
        const bad = [];
        document.querySelectorAll("body *").forEach(el => {
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) return;
          if (r.right > vw + 1.5 || r.left < -1.5) {
            let p = el, clipped = false;
            while (p && p !== document.body) {
              const ov = getComputedStyle(p).overflowX;
              if (ov === "auto" || ov === "scroll" || ov === "hidden" || ov === "clip") { clipped = true; break; }
              p = p.parentElement;
            }
            if (!clipped) bad.push(el.tagName.toLowerCase() + "." + String(el.className.baseVal ?? el.className ?? "").split(" ")[0]);
          }
        });
        return { scrollW: document.documentElement.scrollWidth, clientW: vw, bad: [...new Set(bad)].slice(0,6) };
      })()`);
      if (o.scrollW > o.clientW + 1 || o.bad.length) report.overflow.push({ path, w, ...o });
    });
  }
}

/* 3. Mobile menu: pointer, keyboard, focus ----------------------------- */
report.menu = await withPage(async (s) => {
  await navigate(s, BASE + "/", 375, 812);
  const out = {};
  const q = (js) => s.eval(js);
  out.toggleVisible = await q(`getComputedStyle(document.querySelector(".nav-toggle")).display !== "none"`);
  out.navHiddenInitially = await q(`getComputedStyle(document.querySelector("#primary-nav")).display === "none"`);
  out.ariaExpandedBefore = await q(`document.querySelector(".nav-toggle").getAttribute("aria-expanded")`);
  out.ariaControlsResolves = await q(`!!document.getElementById(document.querySelector(".nav-toggle").getAttribute("aria-controls"))`);

  await q(`document.querySelector(".nav-toggle").click()`);
  await sleep(320);
  out.ariaExpandedAfter = await q(`document.querySelector(".nav-toggle").getAttribute("aria-expanded")`);
  out.navVisible = await q(`getComputedStyle(document.querySelector("#primary-nav")).display !== "none"`);
  out.bodyScrollLocked = await q(`document.body.classList.contains("is-locked")`);
  out.focusMovedIntoNav = await q(`document.querySelector("#primary-nav").contains(document.activeElement)`);
  out.labelWhenOpen = await q(`document.querySelector(".nav-toggle").getAttribute("aria-label")`);

  // Tab from the last item should wrap back to the toggle (focus stays trapped)
  await q(`(()=>{const n=document.querySelector("#primary-nav");const f=[...n.querySelectorAll("a")];f[f.length-1].focus();})()`);
  for (const type of ["keyDown", "keyUp"])
    await s.send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await sleep(200);
  out.tabWrapsToToggle = await q(`document.activeElement === document.querySelector(".nav-toggle")`);

  for (const type of ["keyDown", "keyUp"])
    await s.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  out.escapeCloses = (await q(`document.querySelector(".nav-toggle").getAttribute("aria-expanded")`)) === "false";
  out.focusReturnedToToggle = await q(`document.activeElement === document.querySelector(".nav-toggle")`);
  out.scrollUnlocked = await q(`!document.body.classList.contains("is-locked")`);

  // Touch: tap to open, tap a link to close
  await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 350, y: 33 }] });
  await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(320);
  out.touchOpens = (await q(`document.querySelector(".nav-toggle").getAttribute("aria-expanded")`)) === "true";
  await q(`document.querySelector("#primary-nav .nav__link").click()`);
  await sleep(250);
  out.closesOnLinkTap = (await q(`document.querySelector(".nav-toggle").getAttribute("aria-expanded")`)) === "false";

  out.focusRingVisible = await q(`(()=>{const a=document.querySelector(".nav__cta");a.focus();const c=getComputedStyle(a);return c.outlineStyle+" "+c.outlineWidth})()`);
  out.skipLinkFirst = await q(`document.body.querySelector("a").classList.contains("skip-link")`);
  return out;
});

/* 4. Reduced motion ----------------------------------------------------- */
report.reducedMotion = await withPage(async (s) => {
  await s.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate(s, BASE + "/", 1440);
  await sleep(500);
  return await s.eval(`(() => {
    const els = [...document.querySelectorAll("[data-reveal]")];
    return {
      revealTargets: els.length,
      stillInvisible: els.filter(e => parseFloat(getComputedStyle(e).opacity) < 0.99).length,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
    };
  })()`);
});

writeFileSync("./_gen/report.json", JSON.stringify(report, null, 2));

/* Summary --------------------------------------------------------------- */
const L = (k, v) => console.log(String(k).padEnd(30) + v);
console.log("\n════ CONSOLE / NETWORK ════");
L("console errors+warnings", report.console.length);
report.console.slice(0, 10).forEach((c) => console.log("   ", c.path, c.type, (c.text || "").slice(0, 130)));
L("failed / 4xx requests", report.failed.length);
report.failed.slice(0, 10).forEach((f) => console.log("   ", JSON.stringify(f)));

console.log("\n════ HORIZONTAL OVERFLOW (375/768/1024/1440) ════");
L("pages with overflow", report.overflow.length);
report.overflow.forEach((o) => console.log("   ", o.path, o.w + "px", "scrollW=" + o.scrollW, o.bad.join(" | ")));

console.log("\n════ PER PAGE ════");
for (const [p, i] of Object.entries(report.pages)) {
  const issues = [];
  if (i.h1Count !== 1) issues.push("h1Count=" + i.h1Count);
  if (i.jumps.length) issues.push("headingJumps: " + i.jumps.join(" ; "));
  if (i.dupIds.length) issues.push("dupIds: " + i.dupIds.join(","));
  if (i.inlineStyle) issues.push("inlineStyle=" + i.inlineStyle);
  if (i.blankNoRel) issues.push("blank w/o rel=" + i.blankNoRel);
  if (i.vagueText.length) issues.push("vagueLinkText: " + i.vagueText.join(","));
  if (i.emptyLinks) issues.push("emptyLinkText=" + i.emptyLinks);
  if (!i.landmarks.navsLabelled) issues.push("unlabelled <nav>");
  if (i.landmarks.main !== 1) issues.push("main=" + i.landmarks.main);
  if (i.titleLen > 70) issues.push("title " + i.titleLen + " chars");
  if (i.descLen > 165 || i.descLen < 50) issues.push("desc " + i.descLen + " chars");
  if (!i.robots && !i.canonical) issues.push("no canonical");
  const nav = i.hashLinks.filter((h) => h !== "#main");
  console.log(
    `\n  ${p}\n    title(${i.titleLen}) ${i.title}\n    desc ${i.descLen} | h1 "${i.h1}" | lang=${i.lang} | og=${i.og} | imgs=${i.imgs}` +
      `\n    mailto: ${i.mailtos.join(", ") || "none"} | ownership: ${i.ownership ? "present" : "-"}` +
      `\n    non-skip # links: ${nav.length ? nav.join(", ") : "none"}` +
      `\n    ${issues.length ? "ISSUES: " + issues.join(" | ") : "clean"}`
  );
}

console.log("\n════ MOBILE MENU (375px) ════");
Object.entries(report.menu).forEach(([k, v]) => L("  " + k, JSON.stringify(v)));

console.log("\n════ REDUCED MOTION ════");
Object.entries(report.reducedMotion).forEach(([k, v]) => L("  " + k, JSON.stringify(v)));
console.log("");

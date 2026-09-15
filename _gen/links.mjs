/* Static link + asset integrity check.
   Resolves every internal href/src exactly the way an S3 website endpoint would,
   against the real files on disk. No network, no browser. */

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve("./");
const PAGES = [
  "index.html",
  "solutions/index.html",
  "platforms/index.html",
  "work/index.html",
  "training/index.html",
  "research/index.html",
  "contact/index.html",
  "blogs/index.html",
  "blogs/agentic-ai-revenue.html",
  "404.html",
];

const problems = [];
const stats = { links: 0, assets: 0, anchors: 0, external: 0, mailto: 0 };

// url path -> file on disk, following S3 website-hosting index-document rules
function toFile(urlPath, fromFile) {
  let p = urlPath.split("#")[0].split("?")[0];
  if (p === "") return null;
  let abs = p.startsWith("/") ? join(ROOT, p) : resolve(dirname(join(ROOT, fromFile)), p);
  if (existsSync(abs) && statSync(abs).isDirectory()) abs = join(abs, "index.html");
  else if (p.endsWith("/")) abs = join(abs, "index.html");
  return abs;
}

function idsIn(file) {
  if (!existsSync(file)) return new Set();
  const html = readFileSync(file, "utf8");
  return new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]));
}

const idCache = new Map();
function getIds(file) {
  if (!idCache.has(file)) idCache.set(file, idsIn(file));
  return idCache.get(file);
}

for (const page of PAGES) {
  // Strip HTML comments: commented-out markup is documentation, not live links.
  const html = readFileSync(join(ROOT, page), "utf8").replace(/<!--[\s\S]*?-->/g, "");

  // <a href>
  for (const m of html.matchAll(/<a\b[^>]*\shref=["']([^"']+)["'][^>]*>/g)) {
    const href = m[1];
    if (href.startsWith("tel:") || href.startsWith("sms:")) {
      stats.tel = (stats.tel || 0) + 1;
      if (!/^tel:\+?[0-9]+$/.test(href)) problems.push(`${page}: malformed tel: URI -> ${href}`);
      continue;
    }
    if (href.startsWith("mailto:")) {
      stats.mailto++;
      if (!href.startsWith("mailto:experts@novatechai.com")) {
        problems.push(`${page}: unexpected mailto target -> ${href}`);
      }
      continue;
    }
    if (/^https?:/.test(href)) {
      stats.external++;
      const tag = m[0];
      if (/target=["']_blank["']/.test(tag) && !(/noopener/.test(tag) && /noreferrer/.test(tag))) {
        problems.push(`${page}: external _blank link missing rel=noopener noreferrer -> ${href}`);
      }
      if (href.startsWith("http://")) problems.push(`${page}: insecure http:// link -> ${href}`);
      continue;
    }
    stats.links++;

    if (href.startsWith("#")) {
      stats.anchors++;
      if (href.length > 1 && !getIds(join(ROOT, page)).has(href.slice(1))) {
        problems.push(`${page}: same-page anchor has no target -> ${href}`);
      }
      continue;
    }

    const file = toFile(href, page);
    if (!file || !existsSync(file)) {
      problems.push(`${page}: broken internal link -> ${href}  (resolved: ${file})`);
      continue;
    }
    const hash = href.split("#")[1];
    if (hash && !getIds(file).has(hash)) {
      problems.push(`${page}: cross-page anchor has no target -> ${href}`);
    }
  }

  // href/src on assets (css, js, icons, manifest, preloads)
  for (const m of html.matchAll(/<(?:link|script|img|source)\b[^>]*?\s(?:href|src)=["']([^"']+)["']/g)) {
    const url = m[1];
    if (/^(https?:|data:|mailto:|#)/.test(url)) continue;
    stats.assets++;
    const file = toFile(url, page);
    if (!file || !existsSync(file)) problems.push(`${page}: missing asset -> ${url}`);
  }

  // <use href="#id"> must resolve within the same document
  for (const m of html.matchAll(/<use\b[^>]*\shref=["']#([^"']+)["']/g)) {
    if (!getIds(join(ROOT, page)).has(m[1])) {
      problems.push(`${page}: <use> references missing symbol -> #${m[1]}`);
    }
  }

  // duplicate ids
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) problems.push(`${page}: duplicate id(s) -> ${[...new Set(dup)].join(", ")}`);

  // inline style attributes / inline scripts (must stay zero for the strict CSP)
  const styleAttrs = (html.match(/\sstyle=["']/g) || []).length;
  if (styleAttrs) problems.push(`${page}: ${styleAttrs} inline style attribute(s) — breaks style-src 'self'`);
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/g)].filter(
    (m) => !/\ssrc=/.test(m[1]) && !/application\/ld\+json/.test(m[1])
  ).length;
  if (inlineScripts) problems.push(`${page}: ${inlineScripts} inline <script> — breaks script-src 'self'`);

  // no third-party origins at all
  for (const m of html.matchAll(/(?:href|src)=["']https?:\/\/([^/"']+)/g)) {
    const host = m[1];
    if (host !== "novatechai.com") {
      const ctx = html.slice(Math.max(0, m.index - 60), m.index);
      if (!/<a\b[^>]*$/.test(ctx)) problems.push(`${page}: third-party subresource host -> ${host}`);
    }
  }
}

// sitemap entries must exist
const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
for (const m of sitemap.matchAll(/<loc>https:\/\/novatechai\.com([^<]*)<\/loc>/g)) {
  const f = toFile(m[1] || "/", "index.html");
  if (!existsSync(f)) problems.push(`sitemap.xml: lists a URL with no file -> ${m[1]}`);
}

// manifest icons must exist
const mf = JSON.parse(readFileSync(join(ROOT, "site.webmanifest"), "utf8"));
for (const icon of mf.icons) {
  if (!existsSync(join(ROOT, icon.src))) problems.push(`site.webmanifest: missing icon -> ${icon.src}`);
}

console.log("checked:", JSON.stringify(stats));
if (problems.length === 0) {
  console.log("\nNo link, asset, anchor, duplicate-id or CSP-compatibility problems found.");
} else {
  console.log(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.log("  - " + p));
}

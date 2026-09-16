/* Assembles the static pages from one shared shell + one body file per page.
   Run:  node _gen/build.mjs
   Output is plain static HTML. The live site does not depend on this script —
   it exists so the header, footer and <head> stay identical across every page. */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const SITE = "https://novatechai.com";
const MAIL = "mailto:experts@novatechai.com";

/* ═══════════════════════════════════════════════════════════════════════════
   FILL THESE IN — the two blocks below are the only things standing between
   the site and (a) the partner strip and (b) local search visibility.
   Both are inert while empty: nothing renders and no schema is emitted, so
   the site stays truthful until you supply real data. Re-run `node
   _gen/build.mjs` after editing.
   ═══════════════════════════════════════════════════════════════════════════ */

/* (a) Partner logos.
   Drop each logo into assets/img/partners/ — SVG preferred, otherwise a PNG
   at roughly 2x its display height (72px tall) with a transparent background.
   `name` becomes the image's alt text, so write the partner's real name.
   `url` is optional; omit it and the logo renders unlinked.
   The strip only appears once there are at least 4 entries — below that a
   moving row looks broken rather than established. */
const PARTNERS = [
  // ⚠ PLACEHOLDERS — invented companies, for previewing the strip only.
  // Replace every entry with a real partner (and their written permission)
  // before this site goes public, or delete the array to hide the section.
  { name: "Northbridge", logo: "/assets/img/partners/placeholder-northbridge.svg" },
  { name: "Cedarline Engineering", logo: "/assets/img/partners/placeholder-cedarline.svg" },
  { name: "AtlasData", logo: "/assets/img/partners/placeholder-atlasdata.svg" },
  { name: "Meridian Systems", logo: "/assets/img/partners/placeholder-meridian.svg" },
  { name: "Helix Labs", logo: "/assets/img/partners/placeholder-helixlabs.svg" },
  { name: "Kontor", logo: "/assets/img/partners/placeholder-kontor.svg" },
];

/* Scroll speed lives in assets/css/site.css — change --marquee-duration
   on .marquee__row. It is not set here because applying it per-page would
   require an inline style, which the site's Content-Security-Policy forbids. */

/* (b) Name, address and phone.
   These must match your Google Business Profile character for character —
   inconsistent NAP data is the most common reason a local listing
   underperforms. Leave blank and no address is published anywhere.
   Use the international phone format, e.g. "+961 1 234 567". */
const BUSINESS = {
  streetAddress: "Beirut Digital District, Bechara El Khoury Street",
  addressLocality: "Beirut",
  addressRegion: "Beirut Governorate",
  postalCode: "",   // add yours if you have one
  // TIP: prepend your BDD building and floor to streetAddress once you have it,
  // e.g. "BDD 1294, 3rd floor, Bechara El Khoury Street".
  addressCountry: "LB",
  telephone: "",
};

const HAS_ADDRESS = Boolean(BUSINESS.streetAddress && BUSINESS.addressLocality);
const HAS_PHONE = Boolean(BUSINESS.telephone);

/* ---------------------------------------------------------------- nav model */

const NAV = [
  { href: "/", label: "Home" },
  { href: "/solutions/", label: "Services" },
  { href: "/platforms/", label: "Platforms" },
  { href: "/work/", label: "Our work" },
  { href: "/training/", label: "Training" },
  { href: "/research/", label: "Research" },
  { href: "/blogs/", label: "Insights" },
];

const FOOTER = [
  {
    title: "What we do",
    links: [
      ["/solutions/", "Services"],
      ["/platforms/", "Enterprise platforms"],
      ["/research/", "Applied AI research"],
      ["/training/", "Free client training"],
    ],
  },
  {
    title: "Company",
    links: [
      ["/work/", "Our work"],
      ["/blogs/", "Blogs and insights"],
      ["/contact/", "Contact"],
    ],
  },
  {
    title: "Get in touch",
    links: [
      [`${MAIL}?subject=Project%20enquiry%20for%20NovaTechAI`, "experts@novatechai.com"],
      ["/blogs/agentic-ai-revenue.html", "Latest research briefing"],
    ],
  },
];

/* ------------------------------------------------------------------- icons */

const ICONS = {
  "i-arrow-ur": '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
  "i-arrow-r": '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  "i-arrow-d": '<path d="M12 4v15"/><path d="m6 13 6 6 6-6"/>',
  "i-arrow-l": '<path d="M20 12H5"/><path d="m11 18-6-6 6-6"/>',
  "i-data": '<path d="M4 4h16v16H4z"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',
  "i-ai":
    '<circle cx="6" cy="17.5" r="2.4"/><circle cx="12" cy="5.5" r="2.4"/><circle cx="18.5" cy="15" r="2.4"/><path d="m7.4 15.4 3.3-7.6M13.9 7.2l3.5 5.7M8.4 17.9l7.7-1.8"/>',
  "i-auto":
    '<path d="M4.2 12a7.8 7.8 0 0 1 13.4-5.4"/><path d="M19.8 12a7.8 7.8 0 0 1-13.4 5.4"/><path d="M18 2.6v4.4h-4.4"/><path d="M6 21.4V17h4.4"/>',
  "i-research":
    '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="2.2"/><path d="M12 1.6v4M12 18.4v4M1.6 12h4M18.4 12h4"/>',
  "i-mail": '<path d="M3 5h18v14H3z"/><path d="m3 6 9 7 9-7"/>',
  "i-shield":
    '<path d="m12 2.8 7.4 3.1v5.6c0 4.4-3 8.2-7.4 9.7-4.4-1.5-7.4-5.3-7.4-9.7V5.9z"/><path d="m8.9 11.8 2.3 2.3 4-4.4"/>',
};

function iconDefs(used) {
  const symbols = used
    .map((id) => `    <symbol id="${id}" viewBox="0 0 24 24">${ICONS[id]}</symbol>`)
    .join("\n");
  return `<svg class="icon-defs" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brand-gradient" x1="14" y1="15" x2="51" y2="49" gradientUnits="userSpaceOnUse">
      <stop stop-color="#45d6f2"/>
      <stop offset="1" stop-color="#a98bff"/>
    </linearGradient>
    <symbol id="i-mark" viewBox="13 14 38 36">
      <path d="M14 43V27l9-5v16l9-6v13l9-6V20l9-5v29l-9 5V36l-9 6V29l-9 5v14z" fill="url(#brand-gradient)" stroke="none"/>
    </symbol>
${symbols}
  </defs>
</svg>`;
}

const icon = (id) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------- partner marquee */

function partnersSection() {
  // Fewer than four logos: a moving strip reads as broken, so render nothing.
  if (PARTNERS.length < 4) return "";

  const item = (p) => {
    const img = `<img src="${p.logo}" alt="${esc(p.name)}" height="36" loading="lazy" decoding="async">`;
    return `        <li class="marquee__item">${
      p.url
        ? `<a href="${p.url}" target="_blank" rel="noopener noreferrer">${img}</a>`
        : img
    }</li>`;
  };

  // The second group is a visual duplicate only — hidden from assistive tech
  // so each partner is announced once.
  const group = (hidden) =>
    `      <ul class="marquee__group"${hidden ? ' aria-hidden="true"' : ""}>
${PARTNERS.map(item).join("\n")}
      </ul>`;

  return `
  <section class="partners" aria-labelledby="partners-title">
    <div class="container">
      <h2 class="partners__label" id="partners-title">Delivery and technology partners</h2>
      <div class="marquee">
        <div class="marquee__row">
${group(false)}
${group(true)}
        </div>
      </div>
    </div>
  </section>
`;
}

/* ------------------------------------------------- name, address, phone */

function napBlock(onInk) {
  if (!HAS_ADDRESS && !HAS_PHONE) return "";
  const lines = [];
  if (HAS_ADDRESS) {
    lines.push(`        <span class="nap__line">${esc(BUSINESS.streetAddress)}</span>`);
    lines.push(
      `        <span class="nap__line">${esc(
        [BUSINESS.addressLocality, BUSINESS.postalCode, BUSINESS.addressRegion].filter(Boolean).join(", ")
      )}</span>`
    );
    lines.push(`        <span class="nap__line">Lebanon</span>`);
  }
  if (HAS_PHONE) {
    const tel = BUSINESS.telephone.replace(/[^\d+]/g, "");
    lines.push(`        <span class="nap__line"><a href="tel:${tel}">${esc(BUSINESS.telephone)}</a></span>`);
  }
  return `      <address class="nap"${onInk ? "" : ""}>
${lines.join("\n")}
      </address>`;
}

/* ------------------------------------------------------------------ shell */

const brand = `<a class="brand" href="/" aria-label="NovaTechAI — home">
      <svg class="brand__mark" aria-hidden="true" focusable="false"><use href="#i-mark"/></svg>
      <span>NovaTech<span class="brand__ai">AI</span></span>
    </a>`;

function header(current) {
  const links = NAV.map((n) => {
    const isCurrent = current === n.href || (n.href !== "/" && current.startsWith(n.href));
    return `      <a class="nav__link" href="${n.href}"${isCurrent ? ' aria-current="page"' : ""}>${n.label}</a>`;
  }).join("\n");

  return `<header class="site-header">
  <div class="container nav-bar">
    ${brand}

    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Open menu">
      <span class="nav-toggle__bars" aria-hidden="true"><span></span><span></span><span></span></span>
    </button>

    <nav class="nav" id="primary-nav" aria-label="Primary">
${links}
      <a class="nav__cta" href="/contact/"${current === "/contact/" ? ' aria-current="page"' : ""}>Contact us
        ${icon("i-arrow-r")}
      </a>
    </nav>
  </div>
</header>`;
}

function footer() {
  const cols = FOOTER.map((c, i) => {
    const id = "footer-col-" + (i + 1);
    const items = c.links
      .map(([href, label]) => `          <li><a href="${href}">${label}</a></li>`)
      .join("\n");
    return `      <nav class="footer-col" aria-labelledby="${id}">
        <h2 id="${id}">${c.title}</h2>
        <ul>
${items}
        </ul>
      </nav>`;
  }).join("\n\n");

  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-top">
      <div class="footer-brand">
        ${brand}
        <p>Data, artificial intelligence, intelligent agents and automation — applied to the work your organization already does.</p>
        <p class="footer-owns"><b>You own the data.</b> We turn it into intelligence that drives your business.</p>
${napBlock(true)}
      </div>

${cols}
    </div>

    <div class="footer-bottom">
      <p>© <span data-year>2026</span> NovaTechAI. NovaTechAI is an independent consultancy. Microsoft product names referenced on this site are trademarks of Microsoft Corporation and their use does not imply partnership or endorsement.</p>
    </div>
  </div>
</footer>`;
}

/* ------------------------------------------------------------------ pages */

const PAGES = [
  {
    out: "index.html",
    url: "/",
    title: "Enterprise AI embedded in work | NovaTechAI",
    description:
      "NovaTechAI embeds Microsoft 365 Copilot, enterprise AI agents and secure automation into everyday work, from strategy through continuous adoption.",
    ogTitle: "Enterprise AI, embedded in the way you work — NovaTechAI",
    ogDescription:
      "Microsoft 365 Copilot enablement, enterprise AI agents, secure integration and continuous adoption for organizations already using Microsoft.",
    ogImage: "/assets/img/og-home.jpg",
    ogAlt: "NovaTechAI — intelligence that earns its place in your operations.",
    icons: ["i-arrow-ur", "i-arrow-r", "i-arrow-d", "i-data", "i-ai", "i-auto", "i-research", "i-mail"],
    organizationSchema: true,
  },
  {
    out: "solutions/index.html",
    url: "/solutions/",
    crumb: "Services",
    title: "Enterprise AI services | NovaTechAI",
    description:
      "Explore NovaTechAI services: AI strategy, Microsoft 365 Copilot enablement, enterprise agents, secure integration and continuous adoption.",
    ogTitle: "Enterprise AI services — NovaTechAI",
    ogDescription:
      "From Microsoft 365 Copilot in daily work to enterprise agents, governance and ongoing optimization.",
    ogImage: "/assets/img/og-home.jpg",
    ogAlt: "NovaTechAI — intelligence that earns its place in your operations.",
    icons: ["i-arrow-ur", "i-arrow-r", "i-data", "i-ai", "i-auto", "i-research", "i-mail", "i-shield"],
  },
  {
    out: "platforms/index.html",
    url: "/platforms/",
    crumb: "Platforms",
    title: "Enterprise platforms — Azure, Copilot Studio, Fabric | NovaTechAI",
    description:
      "AI, data and automation across Azure, Microsoft 365, Copilot Studio, Power Platform, Fabric and Dynamics 365 — inside your existing security model.",
    ogTitle: "Enterprise platforms — NovaTechAI",
    ogDescription:
      "Azure, Microsoft 365, Copilot Studio, Power Platform, Fabric and Dynamics 365 — more value from the platform your teams already use.",
    ogImage: "/assets/img/og-home.jpg",
    ogAlt: "NovaTechAI enterprise platform solutions.",
    icons: ["i-arrow-ur", "i-arrow-r", "i-mail", "i-shield"],
  },
  {
    out: "work/index.html",
    url: "/work/",
    crumb: "Our work",
    title: "Representative client work | NovaTechAI",
    description:
      "NovaTechAI delivery experience described at capability level: secure video analytics, document automation and natural-language business analytics.",
    ogTitle: "Representative client work — NovaTechAI",
    ogDescription:
      "Delivery experience described at capability level, with client confidentiality preserved. No names, logos or figures.",
    ogImage: "/assets/img/og-home.jpg",
    ogAlt: "NovaTechAI representative client work.",
    icons: ["i-arrow-ur", "i-arrow-r", "i-mail"],
  },
  {
    out: "training/index.html",
    url: "/training/",
    crumb: "Training",
    title: "Free training with every AI solution | NovaTechAI",
    description:
      "Every AI solution or agent NovaTechAI delivers includes free hands-on training: sessions on your own workflows, responsible AI guidance and documentation.",
    ogTitle: "Free client training — NovaTechAI",
    ogDescription:
      "Practical, hands-on training included at no extra cost with every AI solution or agent we deliver.",
    ogImage: "/assets/img/og-home.jpg",
    ogAlt: "NovaTechAI free client training.",
    icons: ["i-arrow-ur", "i-arrow-r", "i-mail", "i-shield"],
  },
  {
    out: "research/index.html",
    url: "/research/",
    crumb: "Applied research",
    title: "Applied AI research | NovaTechAI",
    description:
      "NovaTechAI's applied research practice evaluates new AI models, tools and methods against real operational needs, and publishes what it finds.",
    ogTitle: "Applied AI research — NovaTechAI",
    ogDescription:
      "We test what is next before we recommend it: scan, prototype, evaluate, then publish or apply.",
    ogImage: "/assets/img/og-insights.jpg",
    ogAlt: "NovaTechAI applied AI research.",
    icons: ["i-arrow-ur", "i-arrow-r", "i-research", "i-mail"],
  },
  {
    out: "contact/index.html",
    url: "/contact/",
    crumb: "Contact",
    title: "Contact NovaTechAI | experts@novatechai.com",
    description:
      "Bring us the problem, even if the solution is not clear yet. Email experts@novatechai.com and we will help you find the most valuable next step.",
    ogTitle: "Contact NovaTechAI",
    ogDescription:
      "Bring us the problem, even if the solution is not clear yet. We will tell you plainly if AI is not the right answer.",
    ogImage: "/assets/img/og-home.jpg",
    ogAlt: "Contact NovaTechAI at experts@novatechai.com.",
    icons: ["i-arrow-ur", "i-arrow-r", "i-mail", "i-shield"],
  },
  {
    out: "blogs/index.html",
    url: "/blogs/",
    crumb: "Blogs and insights",
    title: "Blogs and insights | NovaTechAI research briefings",
    description:
      "Evidence-led NovaTechAI briefings on AI agents, data and automation. Every claim is labelled by type and every source is cited and linked.",
    ogTitle: "Blogs and insights — NovaTechAI research briefings",
    ogDescription:
      "Evidence-led briefings on AI agents, data and automation, written for people who have to make the decision.",
    ogImage: "/assets/img/og-insights.jpg",
    ogAlt: "NovaTechAI blogs and insights — research briefings on applied AI.",
    icons: ["i-arrow-ur", "i-arrow-r", "i-mail"],
    editorial: true,
  },
  {
    out: "blogs/agentic-ai-revenue.html",
    url: "/blogs/agentic-ai-revenue.html",
    crumb: "Agentic AI and revenue",
    crumbParent: ["Blogs and insights", "/blogs/"],
    title: "How agentic work can help companies grow revenue | NovaTechAI",
    description:
      "A NovaTechAI briefing on agentic AI and revenue: what the Capgemini, PwC and Google Cloud research measured, what is only a forecast, and where to start.",
    ogType: "article",
    ogTitle: "How agentic work can help companies grow revenue",
    ogDescription:
      "What the published research on AI agents actually measured, what is only a forecast, and how to connect agentic workflows to revenue you can verify.",
    ogImage: "/assets/img/og-agentic-ai-revenue.jpg",
    ogAlt: "NovaTechAI research briefing — how agentic work can help companies grow revenue.",
    articleMeta:
      '<meta property="article:published_time" content="2026-09-12">\n<meta property="article:section" content="Agentic AI">\n',
    extraPreload:
      '<link rel="preload" href="/assets/fonts/novatech-serif-text.woff2" as="font" type="font/woff2" crossorigin>\n',
    preBody: '\n<div class="reading-progress" aria-hidden="true"><div class="reading-progress__bar"></div></div>',
    extraHead: `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How agentic work can help companies grow revenue",
  "description": "A NovaTechAI research briefing separating what the published research on AI agents measured from what is forecast, with practical guidance on connecting agentic workflows to revenue.",
  "datePublished": "2026-09-12",
  "dateModified": "2026-09-12",
  "inLanguage": "en",
  "mainEntityOfPage": "${SITE}/blogs/agentic-ai-revenue.html",
  "image": "${SITE}/assets/img/og-agentic-ai-revenue.jpg",
  "author": { "@type": "Organization", "name": "NovaTechAI", "url": "${SITE}/" },
  "publisher": { "@type": "Organization", "name": "NovaTechAI", "url": "${SITE}/" }
}
</script>
`,
    icons: ["i-arrow-ur", "i-arrow-r", "i-arrow-l", "i-mail"],
    editorial: true,
  },
  {
    out: "404.html",
    url: "/404.html",
    title: "Page not found | NovaTechAI",
    description:
      "That page could not be found. Continue to the NovaTechAI homepage, our solutions, our research briefings, or contact our team.",
    noindex: true,
    icons: ["i-arrow-ur", "i-arrow-r", "i-mail"],
  },
];

/* ------------------------------------------------------------------ render */

function head(p) {
  const canonical = p.noindex ? "" : `<link rel="canonical" href="${SITE}${p.url}">\n`;
  const robots = p.noindex ? `<meta name="robots" content="noindex, follow">\n` : "";
  const social = p.noindex
    ? ""
    : `
<meta property="og:type" content="${p.ogType || "website"}">
<meta property="og:site_name" content="NovaTechAI">
<meta property="og:locale" content="en">
<meta property="og:url" content="${SITE}${p.url}">
<meta property="og:title" content="${p.ogTitle}">
<meta property="og:description" content="${p.ogDescription}">
<meta property="og:image" content="${SITE}${p.ogImage}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${p.ogAlt}">
${p.articleMeta || ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${p.ogTitle}">
<meta name="twitter:description" content="${p.ogDescription}">
<meta name="twitter:image" content="${SITE}${p.ogImage}">
`;

  // Breadcrumb structured data, generated from the same trail the page shows.
  let crumbSchema = "";
  if (p.crumb) {
    const items = [{ name: "NovaTechAI", item: SITE + "/" }];
    if (p.crumbParent) items.push({ name: p.crumbParent[0], item: SITE + p.crumbParent[1] });
    items.push({ name: p.crumb, item: SITE + p.url });
    crumbSchema = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
${items
  .map((it, i) => `    { "@type": "ListItem", "position": ${i + 1}, "name": ${JSON.stringify(it.name)}, "item": ${JSON.stringify(it.item)} }`)
  .join(",\n")}
  ]
}
</script>
`;
  }

  const websiteSchema = p.organizationSchema
    ? `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "NovaTechAI",
  "url": "${SITE}/",
  "inLanguage": "en"
}
</script>
`
    : "";

  // With a verified street address this becomes a ProfessionalService — a
  // subtype of LocalBusiness — which is what makes the listing eligible for
  // Google's local pack and Maps. Without one it stays a plain Organization.
  let orgSchema = null;
  if (p.organizationSchema) {
    orgSchema = {
      "@context": "https://schema.org",
      "@type": HAS_ADDRESS ? "ProfessionalService" : "Organization",
      name: "NovaTechAI",
      url: SITE + "/",
      email: "experts@novatechai.com",
      logo: SITE + "/assets/img/icon-512.png",
      image: SITE + "/assets/img/og-home.jpg",
      description:
        "NovaTechAI helps organizations embed Microsoft 365 Copilot, enterprise AI agents and secure automation into everyday work.",
      knowsAbout: [
        "Microsoft 365 Copilot",
        "AI adoption",
        "Enterprise AI agents",
        "Intelligent automation",
        "AI governance",
        "Microsoft Copilot Studio",
        "Microsoft Entra",
        "Microsoft Purview",
      ],
    };
    if (HAS_PHONE) orgSchema.telephone = BUSINESS.telephone;
    if (HAS_ADDRESS) {
      orgSchema.address = {
        "@type": "PostalAddress",
        streetAddress: BUSINESS.streetAddress,
        addressLocality: BUSINESS.addressLocality,
        ...(BUSINESS.addressRegion ? { addressRegion: BUSINESS.addressRegion } : {}),
        ...(BUSINESS.postalCode ? { postalCode: BUSINESS.postalCode } : {}),
        addressCountry: BUSINESS.addressCountry,
      };
      orgSchema.areaServed = [
        { "@type": "Country", name: "Lebanon" },
        { "@type": "AdministrativeArea", name: "Middle East" },
      ];
    }
  }

  const schema = orgSchema
    ? `
<script type="application/ld+json">
${JSON.stringify(orgSchema, null, 2)}
</script>
`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title}</title>
<meta name="description" content="${p.description}">
${canonical}${robots}<meta name="theme-color" content="#070d18">
<meta name="color-scheme" content="light dark">
${social}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<link rel="preload" href="/assets/fonts/novatech-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/novatech-serif-display.woff2" as="font" type="font/woff2" crossorigin>
${p.extraPreload || ""}<link rel="stylesheet" href="/assets/css/site.css">
${p.editorial ? '<link rel="stylesheet" href="/assets/css/editorial.css">\n' : ""}<script src="/assets/js/site.js" defer></script>
${schema}${websiteSchema}${crumbSchema}${p.extraHead || ""}</head>`;
}

function render(p) {
  let body = readFileSync(join(ROOT, "_gen/bodies", p.out.replace(/\//g, "__")), "utf8").trim();
  body = body
    .replace("<!--ADOPTION-->", readFileSync(join(ROOT, "_gen/partials/adoption.html"), "utf8"))
    .replace("<!--SERVICES-->", readFileSync(join(ROOT, "_gen/partials/services.html"), "utf8"))
    .replace("<!--ECOSYSTEM-->", readFileSync(join(ROOT, "_gen/partials/ecosystem.html"), "utf8"))
    .replace("<!--PARTNERS-->", partnersSection())
    .replace("<!--NAP-->", napBlock(true));
  return `${head(p)}
<body>
<a class="skip-link" href="#main">Skip to content</a>
${p.preBody || ""}
${iconDefs(p.icons)}

${header(p.url)}

${body}

${footer()}

</body>
</html>
`;
}

let written = 0;
for (const p of PAGES) {
  const outPath = join(ROOT, p.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, render(p));
  written++;
  console.log("wrote", p.out);
}
console.log(`\n${written} pages built.`);

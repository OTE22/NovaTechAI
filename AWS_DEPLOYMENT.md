# AWS deployment — NovaTechAI website

A static, dependency-free site. No build step, no backend, no database, no secrets.
Upload the files and serve them.

Replace the placeholders below with your own values:

| Placeholder | Meaning |
| --- | --- |
| `BUCKET` | S3 bucket name, e.g. `novatechai-site` |
| `REGION` | Bucket region, e.g. `eu-west-1` |
| `DIST_ID` | CloudFront distribution ID |
| `example.com` | Your production domain (the site is currently configured for `novatechai.site`) |

Do not commit account IDs, access keys or distribution IDs to source control.

---

## ⚠ Before you go live — two items need real data

The site is deployable today, but these two are currently filled with preview
data. Both live at the top of `_gen/build.mjs`; run `node _gen/build.mjs` after
editing either.

**1. Partner logos are placeholders.** `Northbridge`, `Cedarline Engineering`,
`AtlasData`, `Meridian Systems`, `Helix Labs` and `Kontor` are invented
companies with logos drawn to preview the strip. They must be replaced with
real partners — with written permission to use each mark — or the section must
be removed. Publishing invented partners misrepresents the business, and an
invented name can collide with a real trademark. To remove the strip entirely,
empty the `PARTNERS` array; it renders nothing below four entries.

**2. Confirm the address and add a phone number if available.** The address is
currently set to:

> Bechara El Khoury Street
> Beirut, Beirut Governorate, Lebanon

Add a building or floor to the street address only if it applies. `telephone`
is deliberately **empty** — an invented number can route real callers to a
stranger, and it will fail Google Business Profile verification. Add the real
one and the site publishes it automatically in the schema, the homepage contact
band, the contact page and the footer.

Whatever you enter must match your Google Business Profile character for
character. See §14.

---

## 0. What gets deployed

Upload everything **except** `_legacy/` and `_gen/`:

```
index.html                        homepage
solutions/index.html              enterprise AI services and adoption journey
platforms/index.html              enterprise platforms (Azure, Copilot Studio, Fabric)
work/index.html                   representative (anonymized) client work
training/index.html               free client training
research/index.html               applied AI research
contact/index.html                contact
blogs/index.html                  blogs and insights index
blogs/agentic-ai-revenue.html     research briefing
404.html                          custom error page

favicon.svg                       modern SVG favicon
favicon.ico                       legacy / browser-tab fallback
apple-touch-icon.png              iOS home-screen icon
robots.txt
site.webmanifest
sitemap.xml

assets/css/site.css               design system + shared page shell
assets/css/editorial.css          insights index + article layer (2 pages only)
assets/js/site.js                 ~7.5 KB raw / ~2.3 KB gzipped, no dependencies
assets/fonts/*.woff2              self-hosted, subset (no Google Fonts request)
assets/img/*.png                  app icons (192, 512, maskable)
assets/img/og-*.jpg               social share images (1200x630)
assets/img/partners/*.svg         partner logos (6 placeholders - see the warning above)
```

`serve.py` (the local preview server) and `AWS_DEPLOYMENT.md` sit in the project
root but are **not** part of the site — the upload commands in §2 exclude them.

Total deployed weight is roughly **638 KB**, of which ~121 KB is fonts and
~275 KB is icons and social share images that browsers never request on a page
view. A first visit to the homepage transfers about **55 KB** over the wire once
CloudFront compression is enabled (HTML 8 KB + CSS 9 KB + JS 2 KB + 2 fonts).

### URL structure

Every primary navigation target is a real URL, so each page can be linked,
shared and indexed on its own. The homepage also links directly to individual
service rows on `/solutions/`:

```
/            /solutions/   /platforms/   /work/
/training/   /research/    /contact/     /blogs/
/blogs/agentic-ai-revenue.html
```

The primary navigation is: **Home · Services · Platforms · Our work · Training ·
Research · Insights**, with *Contact us* as the call-to-action button. The
wordmark also links home, so visitors have both routes. Nav items are declared
once in `NAV` at the top of `_gen/build.mjs` and propagate to all ten pages.

The `#` links are the keyboard skip link (`#main`), the homepage service links,
and the article's table of contents.

Because `/solutions/` and friends are directories, **the origin must resolve
directory indexes** — see Option A or the CloudFront Function in Option B.

`_legacy/` holds the superseded files from the previous version of the site
(including the 1.77 MB hero PNG). `_gen/` holds the page assembler and the local
verification tooling. Neither is referenced by any page, and neither is needed at
runtime. Delete both folders once you are satisfied, or keep them locally and
exclude them from every upload as shown below.

**Domain assumption.** Every canonical URL, the Open Graph URLs, `sitemap.xml`
and `robots.txt` use `https://novatechai.site/` (apex, no `www`). The page source
of truth is `SITE` in `_gen/build.mjs`; rebuild the pages after changing it.
The contact address is `experts@novatechai.site` in the page bodies and build
script. The social images are generated from `_gen/og.html`.

---

## 1. S3 bucket configuration

Two supported setups. **Option A** is the fastest and is what the site is written
for. **Option B** keeps the bucket private and is the stronger production choice.

### Option A — S3 static website hosting behind CloudFront (recommended start)

The website endpoint resolves directory indexes (`/blogs/` → `/blogs/index.html`)
and serves the error document automatically, which is exactly what this site needs.

```bash
aws s3api create-bucket \
  --bucket BUCKET \
  --region REGION \
  --create-bucket-configuration LocationConstraint=REGION

aws s3 website s3://BUCKET/ \
  --index-document index.html \
  --error-document 404.html
```

The website endpoint must be publicly readable. Turn off the "Block all public
access" setting for this bucket, then apply a read-only policy:

```bash
aws s3api put-public-access-block --bucket BUCKET \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

`bucket-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadForWebsiteEndpoint",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET/*"
    }
  ]
}
```

```bash
aws s3api put-bucket-policy --bucket BUCKET --policy file://bucket-policy.json
```

To stop anyone bypassing CloudFront by hitting the website endpoint directly, add
a shared secret header on the CloudFront origin (Origin custom header
`X-Origin-Verify: <random value>`) and extend the bucket policy with a
`Condition` on `aws:UserAgent`/`aws:Referer`, or move to Option B.

### Option B — private bucket + Origin Access Control (hardened)

Keep "Block all public access" **on** and add no bucket policy of your own.
Create the distribution with an S3 (REST) origin and an Origin Access Control;
CloudFront then writes the required `s3:GetObject` policy for you.

Because a REST origin has no notion of a directory index, add a **CloudFront
Function** on the *viewer request* event of the default behaviour:

```js
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (!uri.includes('.')) {
    request.uri = uri + '/index.html';
  }
  return request;
}
```

Everything else in this document applies unchanged.

---

## 2. File upload

Run from the project root. The uploads are split so each file type gets the
right `Cache-Control` (see section 9).

```bash
# 1. Long-lived, content-stable assets: fonts and images
aws s3 sync . s3://BUCKET/ --delete \
  --exclude "*" \
  --include "assets/fonts/*" \
  --cache-control "public, max-age=31536000, immutable"

aws s3 sync . s3://BUCKET/ --delete \
  --exclude "*" \
  --include "assets/img/*" \
  --include "apple-touch-icon.png" \
  --cache-control "public, max-age=2592000"

# 2. CSS and JS — filenames are not content-hashed, so cache for an hour
#    and invalidate on deploy
aws s3 sync . s3://BUCKET/ --delete \
  --exclude "*" \
  --include "assets/css/*" \
  --include "assets/js/*" \
  --cache-control "public, max-age=3600, stale-while-revalidate=86400"

# 3. HTML and small metadata files — always revalidate.
#    Note the exclusions: the tooling folders and this document must never be
#    published to a public bucket.
aws s3 sync . s3://BUCKET/ --delete \
  --exclude "_legacy/*" --exclude "_gen/*" \
  --exclude "*.md" --exclude "*.py" --exclude ".git/*" --exclude ".DS_Store" \
  --exclude "assets/fonts/*" --exclude "assets/img/*" \
  --exclude "assets/css/*" --exclude "assets/js/*" \
  --exclude "apple-touch-icon.png" \
  --cache-control "public, max-age=0, must-revalidate"
```

Verify nothing unwanted was uploaded — the listing should contain **35 objects**
and no `.md`, `_gen/` or `_legacy/` entries:

```bash
aws s3 ls s3://BUCKET/ --recursive --human-readable --summarize
aws s3 ls s3://BUCKET/ --recursive | grep -E '\.md$|\.py$|_gen/|_legacy/' \
  && echo "REMOVE THESE" || echo "clean"
```

`favicon.ico` and `.woff2` are not in the AWS CLI's default MIME table on every
version. Confirm the content types and fix them if needed:

```bash
aws s3 cp s3://BUCKET/favicon.ico s3://BUCKET/favicon.ico \
  --metadata-directive REPLACE --content-type "image/x-icon" \
  --cache-control "public, max-age=86400"

aws s3 cp s3://BUCKET/assets/fonts/ s3://BUCKET/assets/fonts/ --recursive \
  --metadata-directive REPLACE --content-type "font/woff2" \
  --cache-control "public, max-age=31536000, immutable"

aws s3 cp s3://BUCKET/site.webmanifest s3://BUCKET/site.webmanifest \
  --metadata-directive REPLACE --content-type "application/manifest+json" \
  --cache-control "public, max-age=86400"
```

---

## 3. CloudFront configuration

| Setting | Value |
| --- | --- |
| Origin domain | **Option A:** `BUCKET.s3-website-REGION.amazonaws.com` (the *website* endpoint — type it in; it is not offered in the dropdown). **Option B:** `BUCKET.s3.REGION.amazonaws.com` with Origin Access Control. |
| Origin protocol policy | **Option A:** HTTP only (S3 website endpoints do not serve HTTPS). **Option B:** n/a |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Allowed HTTP methods | GET, HEAD |
| Compress objects automatically | **Yes** — this is what gzip/Brotli-compresses the HTML, CSS, JS and SVG |
| Cache policy | `Managed-CachingOptimized` |
| Origin request policy | None |
| Response headers policy | The custom policy from section 10 |
| Price class | Your choice; `PriceClass_All` for a genuinely international audience |
| Alternate domain names (CNAMEs) | `example.com`, `www.example.com` |
| Custom SSL certificate | The ACM certificate from section 6 |
| Security policy | `TLSv1.2_2021` or newer |
| HTTP/3 | Enabled |
| Standard logging | Optional; if enabled, send it to a separate private bucket |

Fonts are served from the same origin, so no CORS configuration is required.

---

## 4. Default root object

Set **Default root object** to `index.html` on the distribution.

```bash
# visible under DistributionConfig.DefaultRootObject
aws cloudfront get-distribution-config --id DIST_ID
```

This covers `https://example.com/`. Directory paths such as `/blogs/` are
resolved by the S3 website endpoint (Option A) or the CloudFront Function
(Option B) — the default root object alone does **not** handle them.

---

## 5. Custom 404 handling

`404.html` is a fully styled page with working navigation and onward links, and
carries `<meta name="robots" content="noindex, follow">`.

**Option A:** already wired up by `--error-document 404.html`. Also add the
CloudFront custom error response below so the correct status code survives.

**Option B:** the custom error response is the only mechanism, so it is required.

Distribution → **Error pages** → Create custom error response:

| Field | Value |
| --- | --- |
| HTTP error code | `404: Not Found` |
| Customize error response | Yes |
| Response page path | `/404.html` |
| HTTP Response code | `404` |
| Error caching minimum TTL | `60` |

Repeat for `403: Forbidden` → `/404.html` → `404`. Option B returns 403 for
missing objects in a private bucket, so without this rule a mistyped URL shows an
XML access-denied page instead of your 404.

Keep the response code as **404**, not 200 — returning 200 for a missing page
causes search engines to index soft 404s.

---

## 6. HTTPS certificate (AWS Certificate Manager)

The certificate **must be requested in `us-east-1`** regardless of where the
bucket lives. CloudFront reads certificates only from that region.

```bash
aws acm request-certificate \
  --region us-east-1 \
  --domain-name example.com \
  --subject-alternative-names www.example.com \
  --validation-method DNS \
  --key-algorithm RSA_2048
```

Then:

1. Open the certificate in the ACM console and copy the CNAME validation records.
2. Create those CNAME records in your DNS zone (Route 53 offers a one-click
   "Create records in Route 53" button).
3. Wait for status **Issued** — usually minutes, occasionally up to a few hours.
4. Attach the certificate to the distribution and add both domains under
   *Alternate domain names*.

ACM renews DNS-validated certificates automatically as long as the validation
CNAME records remain in place. Do not delete them.

---

## 7. DNS configuration

### Route 53

Create two **A records, Alias = Yes**, both pointing at the CloudFront
distribution (`dxxxxxxxxxxxxx.cloudfront.net`):

| Name | Type | Alias target |
| --- | --- | --- |
| `example.com` | A (alias) | CloudFront distribution |
| `www.example.com` | A (alias) | CloudFront distribution |

Add the matching `AAAA` alias records too if IPv6 is enabled on the
distribution (it is by default).

An alias record is required for the apex domain — a CNAME is not legal there.

### DNS hosted elsewhere

- `www.example.com` → `CNAME` → `dxxxxxxxxxxxxx.cloudfront.net`
- Apex `example.com` → use your provider's ALIAS/ANAME/flattened-CNAME feature,
  or move the zone to Route 53.

### Canonical host

The pages declare `https://novatechai.site/` as canonical (apex). Pick one host
and redirect the other so you do not split ranking signals. The simplest way is a
second CloudFront distribution, or a CloudFront Function on the `www` behaviour:

```js
function handler(event) {
  var host = event.request.headers.host.value;
  if (host.startsWith('www.')) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://example.com' + event.request.uri } }
    };
  }
  return event.request;
}
```

---

## 8. Post-deploy checks

```bash
# every page must return 200 — this is the directory-index check
for p in / /solutions/ /platforms/ /work/ /training/ /research/ /contact/ \
         /blogs/ /blogs/agentic-ai-revenue.html ; do
  printf '%-34s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://example.com$p)"
done

curl -I https://example.com/assets/fonts/novatech-sans.woff2  # 200, font/woff2
curl -I https://example.com/this-page-does-not-exist          # 404 + your 404 page
curl -I https://example.com/robots.txt                        # 200, text/plain

# compression and security headers must be present
curl -sI -H 'Accept-Encoding: gzip' https://example.com/ \
  | grep -i "content-encoding\|strict-transport\|content-security\|x-content-type"
```

If any of `/solutions/`, `/platforms/`, `/work/`, `/training/`, `/research/`,
`/contact/` or `/blogs/` returns 404 or 403, the origin is not resolving
directory indexes. Re-check the S3 website endpoint (Option A) or the CloudFront
Function (Option B).

Then submit `https://example.com/sitemap.xml` in Google Search Console and Bing
Webmaster Tools.

---

## 9. Cache-Control recommendations

| Path | Header | Why |
| --- | --- | --- |
| `*.html` | `public, max-age=0, must-revalidate` | Content changes; CloudFront still serves from edge after a cheap revalidation |
| `assets/fonts/*.woff2` | `public, max-age=31536000, immutable` | Subset fonts never change without a new filename |
| `assets/css/*`, `assets/js/*` | `public, max-age=3600, stale-while-revalidate=86400` | Filenames are **not** content-hashed, so a long TTL would strand visitors on stale styles |
| `assets/img/*`, `apple-touch-icon.png` | `public, max-age=2592000` | Icons and social images change rarely |
| `favicon.ico`, `favicon.svg`, `site.webmanifest` | `public, max-age=86400` | |
| `robots.txt`, `sitemap.xml` | `public, max-age=3600` | Crawlers should pick up changes quickly |

If you later add content hashes to the CSS and JS filenames
(`site.a1b2c3.css`), move them to `max-age=31536000, immutable` and you can stop
invalidating them on every deploy.

---

## 10. Cache invalidation

After every upload:

```bash
aws cloudfront create-invalidation --distribution-id DIST_ID --paths "/*"
```

Narrower and cheaper when only content changed:

```bash
aws cloudfront create-invalidation --distribution-id DIST_ID \
  --paths "/" "/index.html" "/404.html" "/sitemap.xml" \
          "/solutions/*" "/platforms/*" "/work/*" "/training/*" \
          "/research/*" "/contact/*" "/blogs/*" \
          "/assets/css/*" "/assets/js/*"
```

The first 1,000 invalidation paths per month are free; after that each path is
billed. `"/*"` counts as a single path, so for a site this size it is usually the
cheapest and simplest option.

---

## 11. Security headers

Create a CloudFront **response headers policy** and attach it to the default
behaviour. `security-headers.json`:

```json
{
  "Name": "novatechai-security-headers",
  "SecurityHeadersConfig": {
    "StrictTransportSecurity": {
      "Override": true,
      "AccessControlMaxAgeSec": 63072000,
      "IncludeSubdomains": true,
      "Preload": true
    },
    "ContentTypeOptions": { "Override": true },
    "FrameOptions": { "Override": true, "FrameOption": "DENY" },
    "ReferrerPolicy": { "Override": true, "ReferrerPolicy": "strict-origin-when-cross-origin" },
    "XSSProtection": { "Override": true, "Protection": false, "ModeBlock": false },
    "ContentSecurityPolicy": {
      "Override": true,
      "ContentSecurityPolicy": "default-src 'none'; base-uri 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests"
    }
  },
  "CustomHeadersConfig": {
    "Quantity": 2,
    "Items": [
      {
        "Header": "Permissions-Policy",
        "Value": "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()",
        "Override": true
      },
      {
        "Header": "Cross-Origin-Opener-Policy",
        "Value": "same-origin",
        "Override": true
      }
    ]
  }
}
```

```bash
aws cloudfront create-response-headers-policy \
  --response-headers-policy-config file://security-headers.json
```

### About that Content-Security-Policy

The policy is deliberately strict and the site is built to satisfy it:

- **`script-src 'self'`** — there are no inline `<script>` blocks and no
  `eval`. The only JavaScript is `/assets/js/site.js`. The JSON-LD block on the
  article page is `type="application/ld+json"`, which browsers treat as data, not
  as an executable script, so CSP does not block it.
- **`style-src 'self'`** — there are no `<style>` blocks and no `style="…"`
  attributes anywhere in the markup, so `'unsafe-inline'` is not needed. The
  reading-progress bar is driven through the CSSOM from JavaScript, which CSP
  permits.
- **`font-src 'self'`** — fonts are self-hosted. There is no request to
  `fonts.googleapis.com` or `fonts.gstatic.com`.
- **`img-src 'self' data:`** — `data:` is kept because it is the normal escape
  hatch for a future inlined asset; drop it if you never add one.
- **`default-src 'none'`** forces everything else (frames, media, workers,
  websockets) to be declared explicitly. Nothing on the site needs them.
- **`frame-ancestors 'none'`** replaces `X-Frame-Options` for modern browsers;
  both are sent for older ones.

Deploy the CSP in report-only mode first if you want a safety net — add a
`Content-Security-Policy-Report-Only` custom header with the same value, watch
for violations, then switch it to the enforcing header.

### Other hardening

- Enable **AWS WAF** on the distribution if you expect scraping or bot traffic.
  The site has no forms or authentication, so the exposure is low.
- Enable **S3 server-side encryption (SSE-S3)** and **versioning** on the bucket —
  versioning makes an accidental `--delete` sync recoverable.
- Do not enable S3 Transfer Acceleration; CloudFront already handles delivery.
- There are no credentials, API keys or environment configuration anywhere in
  this repository, and none are required at runtime.

---

## 12. Editing the site

### Editing content

Every `.html` file in the repository is plain, complete, static HTML. You can
open any of them, change the copy and re-upload. Nothing has to be compiled and
there is no runtime dependency on any tooling.

### Changing something shared (nav, footer, `<head>`)

Because the header and footer are repeated in ten files, `_gen/build.mjs` exists
to keep them identical. It is a convenience, not a build step:

```bash
node _gen/build.mjs      # rewrites the 10 pages from _gen/bodies/*.html
node _gen/links.mjs      # verifies links, anchors, assets, duplicate ids, CSP fitness
```

The nav items, footer columns, icon set and per-page metadata are all declared at
the top of `_gen/build.mjs`; the body of each page lives in `_gen/bodies/`.

If you would rather not keep the assembler, delete `_gen/` — the generated HTML
is self-contained and will keep working. From then on, a shared change means
editing each file.

### Adding a new article

1. Copy `blogs/agentic-ai-revenue.html` to `blogs/<slug>.html`, or add an entry
   to `PAGES` in `_gen/build.mjs` with a matching body in `_gen/bodies/`.
2. Rewrite the content, `<title>`, meta description, canonical URL, Open Graph
   tags and the JSON-LD block.
3. In `blogs/index.html`, move the currently featured article into a
   `.post-grid` (the markup pattern is in an HTML comment in that file) and
   feature the new one.
4. Add the new URL to `sitemap.xml` with today's date.
5. Update the insights preview on `/` and `/research/` if it should be surfaced
   there.
6. Upload and invalidate.

### Keeping the claim labels honest

The article uses four labels — `claim-label--finding`, `--forecast`,
`--analysis` and `--action` — to separate what a study measured from what is
projected and from NovaTechAI's own opinion. If you add material to a briefing,
label it the same way. The legend at the top of the article explains the
distinction to readers, and the disclosure block at the end states that survey
results and projections are not guarantees of financial return. Please keep both.

---

## 13. Partner logos

The partner strip is a CSS-only continuous marquee — no JavaScript, no library.
It pauses on hover and on keyboard focus, and collapses to a static wrapped row
for visitors who prefer reduced motion. The duplicated logo group is
`aria-hidden`, so a screen reader announces each partner once.

**It renders nothing until you add at least four partners.** Below four, a
moving row reads as broken rather than established.

1. Put each logo in `assets/img/partners/`. SVG is best; otherwise a PNG about
   72px tall with a transparent background.
2. Add an entry to `PARTNERS` at the top of `_gen/build.mjs`:

   ```js
   const PARTNERS = [
     { name: "Partner name", logo: "/assets/img/partners/partner.svg", url: "https://partner.example" },
   ];
   ```

   `name` becomes the image's `alt` text, so use the partner's real name.
   `url` is optional — omit it and the logo renders unlinked.
3. `node _gen/build.mjs`, then upload and invalidate.

Scroll speed is `--marquee-duration` on `.marquee__row` in `assets/css/site.css`
(default 46s). Raise it as you add logos, so the speed stays constant.

**Before you publish a partner's mark, get their written permission.** Most
companies have brand guidelines covering minimum size, clear space and
whether the logo may be altered. Publishing a logo without consent is a
trademark problem, and a "partner" claim you cannot evidence is exactly the
kind of thing this site otherwise avoids.

---

## 14. Getting found in search

The site scores 100/100 on Lighthouse SEO. That means nothing is technically
stopping Google from ranking it — it does **not** mean it will rank. Technical
SEO removes obstacles; it does not create demand. What follows is in rough
order of impact.

### Already done in the code

- Unique, descriptive `<title>` and meta description on every page, all within
  Google's display limits
- Canonical URLs, `sitemap.xml`, `robots.txt`
- Real URLs per topic (`/solutions/`, `/platforms/`, …) rather than one page
  with anchors, so each can rank for its own terms
- `Organization` + `WebSite` structured data on the homepage
- `BreadcrumbList` structured data on every interior page — this is what makes
  Google show a breadcrumb trail instead of a bare URL
- `Article` structured data on the research briefing
- Semantic HTML, correct heading order, descriptive link text, fast mobile
  performance, zero layout shift

### What you have to do (no code involved)

1. **Google Search Console** — verify the domain, submit
   `https://novatechai.site/sitemap.xml`, then request indexing for each page.
   Nothing gets indexed reliably until you do this. Verification is by DNS TXT
   record or an HTML file at the site root; neither needs a script on the page.
   Do the same at Bing Webmaster Tools, which also feeds ChatGPT search.
2. **Google Business Profile** — for a Lebanon-based consultancy this is the
   single biggest lever. Create the profile, verify the address, and make the
   name, address and phone match §0 of this document *character for character*.
   Inconsistent NAP data is the most common reason a local listing
   underperforms. Fill in `BUSINESS` in `_gen/build.mjs` and rebuild so the
   site's `ProfessionalService` schema matches the profile.
3. **Publish more research.** The briefing page is your strongest ranking asset
   because it is genuinely useful and cites primary sources. One article will
   not carry the site. Four to six briefings on questions your clients actually
   ask ("what does an AI pilot cost", "Copilot Studio vs a custom agent",
   "what has to be true about our data first") will do more than any technical
   change. Each becomes a page that can rank.
4. **Earn links.** Rankings for competitive terms follow from other credible
   sites linking to you. Realistic sources: Lebanese and regional business
   press, university or accelerator partnerships, conference talks, industry
   associations, and your partners' own websites. Never buy links — it is the
   fastest way to a manual penalty.
5. **Directory listings** with consistent NAP: LinkedIn company page,
   Clutch, local chambers of commerce, Lebanese business directories.

### What not to do

- Do not buy "SEO tools" that promise top rankings. No tool ranks a site;
  tools only measure. If you want one, Ahrefs or Semrush are for research, not
  results, and Search Console is free and sufficient to start.
- Do not add keyword-stuffed hidden text, doorway pages or AI-spun filler.
  Google's spam policies target exactly this and the site's credibility is its
  main asset.
- Do not claim partnerships, certifications or awards you cannot evidence.
  Beyond being untrue, it is the kind of thing a prospective enterprise client
  will check.

### Realistic expectations

A new domain typically takes three to six months to rank for anything
competitive, longer for broad terms like "AI consultancy". Expect early
traction on specific, low-competition phrases — "agentic AI revenue research",
"Copilot Studio consultancy Lebanon" — and build from there. Measure in Search
Console: impressions first, then clicks, then position.

---

## 15. How the email links behave

There is no contact form — a static site has no backend to receive one — so
every call to action is the address `experts@novatechai.site`.

A bare `mailto:` link is unreliable in practice. A visitor with no mail client
configured (common on Windows, and on any machine where the person lives in
webmail) clicks it and nothing happens at all. So the links are progressively
enhanced:

- The HTML is still a real `mailto:` link. With JavaScript disabled it behaves
  exactly as before, and right-click → *Copy email address* still works.
- With JavaScript, clicking opens a small menu offering **Your email app**,
  **Gmail**, **Outlook (work or school)**, **Outlook.com (personal)** and
  **Copy address**. The subject line from the original `mailto:` is carried
  through to whichever service is chosen.
- Webmail options open in a new tab with `rel="noopener noreferrer"`. The mail
  app option uses the original `mailto:` and stays in the same tab.
- Ctrl/Cmd/middle-click bypasses the menu entirely, as on any link.

Accessibility: the menu is `role="menu"` with `role="menuitem"` children, the
trigger carries `aria-haspopup` and `aria-expanded`, focus moves into the menu
on open and returns to the trigger on Escape, arrow keys move between items,
and clicking outside closes it. The copy action announces its result through a
`role="status"` region.

No third-party requests are involved — these are ordinary links the visitor
chooses to follow, so the Content-Security-Policy in §11 needs no changes. This
was verified by loading every page under the enforcing policy: zero violations.

To change which services are offered, edit `servicesFor()` in
`assets/js/site.js`. Useful additions if your clients ask for them:

```
Yahoo Mail   https://compose.mail.yahoo.com/?to=…&subject=…&body=…
Proton Mail  https://mail.proton.me/u/0/inbox#compose?to=…&subject=…
```

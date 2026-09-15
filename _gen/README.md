# Local tooling — not part of the deployed site

Nothing in this folder is referenced by any page or needed at runtime.
Exclude it from every upload (see AWS_DEPLOYMENT.md), or delete it — the
generated HTML is self-contained.

Requires Node 22+ (uses the built-in WebSocket client). No npm dependencies.

## Page assembler

    node _gen/build.mjs

Rebuilds the 10 HTML pages from one shared shell + one body file per page.
Nav items, footer columns, the icon set and per-page metadata are declared at
the top of `build.mjs`; page content lives in `_gen/bodies/`.
Use it whenever you change the header, footer or <head> so all pages stay in sync.

## Verification

    node _gen/links.mjs     # links, anchors, assets, duplicate ids, inline-style/script
                            # (CSP fitness), external rel=noopener, sitemap + manifest refs.
                            # Pure filesystem check — resolves URLs the way S3 does.

The checks below need a local server and a headless Chrome with remote debugging:

    python -m http.server 8765        # from the project root
    chrome --headless=new --remote-debugging-port=9222 about:blank

    node _gen/audit.mjs     # console/network errors, metadata, heading order,
                            # horizontal overflow at 375/768/1024/1440,
                            # mobile menu (pointer + touch + keyboard + focus trap),
                            # reduced-motion behaviour
    node _gen/narrow.mjs    # overflow scan at 320 and 360 px
    node _gen/styles.mjs    # computed-style assertions (catches CSS specificity regressions)
    node _gen/focus.mjs     # walks the tab order and reports the focus ring on each stop
    node _gen/csp.mjs       # loads every page under the production CSP and reports violations
                            # (expects a CSP-sending server on port 8766)
    node _gen/slices.mjs <path> <w> <h> <outDir> <prefix> <name::selector[::offset]>...
                            # readable screenshots anchored on a selector

## Asset generation

    node _gen/og.mjs        # re-renders the three 1200x630 social images from og.html

`icon.html` renders the app icons; screenshot it at the required size, e.g.

    chrome --headless=new --screenshot=assets/img/icon-512.png --window-size=512,512 \
      "http://127.0.0.1:8765/_gen/icon.html?round=1&mark=60"

`favicon.ico` is a 32x32 PNG wrapped in an ICO container (see git history / the
snippet in build notes).

`cdp.mjs` is the shared Chrome DevTools Protocol driver used by the scripts above.

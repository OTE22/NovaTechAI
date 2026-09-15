#!/usr/bin/env python3
"""
Run the NovaTechAI website locally.

    python serve.py              # http://127.0.0.1:8000
    python serve.py 3000         # a different port
    python serve.py 8000 --prod  # add gzip + production cache headers + the CSP

Mirrors how Amazon S3 static website hosting behind CloudFront will serve the
site, so what you see locally is what you get in production:

  * /solutions/ and friends resolve to their index.html (directory indexes)
  * a missing path returns your real 404.html with a genuine 404 status
  * .woff2 and .webmanifest get correct content types
  * --prod adds gzip, the Cache-Control values from AWS_DEPLOYMENT.md and the
    documented Content-Security-Policy, so you can confirm nothing breaks

Development mode (the default) sends no-cache headers so edits show up on
reload, and no CSP, so browser devtools stay quiet.

Python 3.8+. No dependencies. Stop with Ctrl+C.
"""

import gzip
import io
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))

# Not deployed, and not served locally either.
BLOCKED = ("_gen", "_legacy", ".git")

COMPRESSIBLE = (".html", ".css", ".js", ".svg", ".json", ".xml", ".txt", ".webmanifest")

# Explicit, so the preview never depends on the machine's registry-backed
# mimetypes database. A stylesheet served as octet-stream is simply ignored.
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".xml": "application/xml",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
}

PROD_CACHE = {
    ".woff2": "public, max-age=31536000, immutable",
    ".jpg": "public, max-age=2592000",
    ".png": "public, max-age=2592000",
    ".css": "public, max-age=3600, stale-while-revalidate=86400",
    ".js": "public, max-age=3600, stale-while-revalidate=86400",
    ".ico": "public, max-age=86400",
    ".svg": "public, max-age=86400",
    ".webmanifest": "public, max-age=86400",
}
PROD_DEFAULT_CACHE = "public, max-age=0, must-revalidate"

CSP = (
    "default-src 'none'; base-uri 'self'; script-src 'self'; style-src 'self'; "
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; "
    "form-action 'none'; frame-ancestors 'none'; object-src 'none'"
)


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    prod = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s\n" % (fmt % args))

    def send_head(self):
        path = self.translate_path(self.path)
        rel = os.path.relpath(path, ROOT).replace("\\", "/")

        if rel.split("/")[0] in BLOCKED:
            return self.error_page(403, "Forbidden")

        # Directory index, the way the S3 website endpoint resolves it
        if os.path.isdir(path):
            if not self.path.split("?")[0].endswith("/"):
                self.send_response(301)
                self.send_header("Location", self.path.split("?")[0] + "/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            path = os.path.join(path, "index.html")

        if not os.path.isfile(path):
            return self.error_page(404, "Not Found")

        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            return self.error_page(404, "Not Found")

        return self.respond(200, body, os.path.splitext(path)[1].lower())

    def error_page(self, status, reason):
        """Serve the real 404.html, with the real status code."""
        custom = os.path.join(ROOT, "404.html")
        if status == 404 and os.path.isfile(custom):
            with open(custom, "rb") as f:
                return self.respond(404, f.read(), ".html")
        body = ("<h1>%d %s</h1>" % (status, reason)).encode()
        return self.respond(status, body, ".html")

    def respond(self, status, body, ext):
        encoding = None
        if self.prod and ext in COMPRESSIBLE and "gzip" in self.headers.get("Accept-Encoding", ""):
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6) as gz:
                gz.write(body)
            body = buf.getvalue()
            encoding = "gzip"

        self.send_response(status)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        if encoding:
            self.send_header("Content-Encoding", encoding)

        if self.prod:
            self.send_header("Cache-Control", PROD_CACHE.get(ext, PROD_DEFAULT_CACHE))
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
            self.send_header("X-Frame-Options", "DENY")
        else:
            self.send_header("Cache-Control", "no-store")

        self.end_headers()
        return io.BytesIO(body) if self.command == "GET" else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    port = int(args[0]) if args else 8000
    Handler.prod = "--prod" in sys.argv

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True

    mode = "production headers (gzip, cache, CSP)" if Handler.prod else "development (no cache, no CSP)"
    print("\n  NovaTechAI — local preview")
    print("  %s" % ROOT)
    print("  mode: %s\n" % mode)
    for page in ("/", "solutions/", "microsoft/", "work/", "training/",
                 "research/", "contact/", "blogs/", "blogs/agentic-ai-revenue.html"):
        print("    http://127.0.0.1:%d/%s" % (port, page.lstrip("/")))
    print("\n  Ctrl+C to stop\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped\n")
        server.shutdown()


if __name__ == "__main__":
    main()

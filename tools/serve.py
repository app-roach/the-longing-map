#!/usr/bin/env python3
"""Serve the map on localhost and let its edit mode save the room layout into data/layout.js.

    python3 tools/serve.py [port]        # default port 8765

Everything is served read-only except POST /api/layout, which validates the layout JSON
and rewrites data/layout.js. Only requests from the page itself are accepted.
"""
import http.server
import json
import math
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LAYOUT_JS = os.path.join(ROOT, "data", "layout.js")
MAX_BODY = 4 * 1024 * 1024
HEADER = "// Room layout made in the map's edit mode. Written by tools/serve.py, or replace it with an exported layout.js.\n"


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _point(p):
    return isinstance(p, list) and len(p) == 2 and _num(p[0]) and _num(p[1])


def clean_layout(data):
    """Return a sanitised copy of the layout, or None if it isn't one."""
    if not isinstance(data, dict) or not isinstance(data.get("rooms"), dict) or not isinstance(data.get("bends"), dict):
        return None
    rooms = {str(k): [float(v[0]), float(v[1])] for k, v in data["rooms"].items() if str(k).isdigit() and _point(v)}
    bends = {str(k)[:64]: [[float(x), float(y)] for x, y in v]
             for k, v in data["bends"].items() if isinstance(v, list) and all(_point(p) for p in v)}
    ends = {}
    for k, v in (data.get("ends") or {}).items() if isinstance(data.get("ends"), dict) else []:
        if isinstance(v, dict):
            e = {side: [float(v[side][0]), float(v[side][1])] for side in ("a", "b") if _point(v.get(side))}
            if e:
                ends[str(k)[:64]] = e
    updated = data.get("updated") if _num(data.get("updated")) else 0
    base = str(data["base"])[:64] if isinstance(data.get("base"), str) else None
    return {"version": 1, "base": base, "updated": updated, "rooms": rooms, "bends": bends, "ends": ends}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # the map's data files change while you edit; never let the browser serve stale copies
        if self.path.split("?")[0].endswith((".js", ".css", ".html", "/")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/layout":
            return self._json(200, {"ok": True, "save": True})
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/layout":
            return self._json(404, {"ok": False, "error": "not found"})
        # same-origin JSON only: cross-site pages can't send this without a CORS preflight, which we never grant
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        if origin and origin not in (f"http://{host}", f"https://{host}"):
            return self._json(403, {"ok": False, "error": "cross-origin request refused"})
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self._json(415, {"ok": False, "error": "expected application/json"})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return self._json(413, {"ok": False, "error": "bad size"})
        try:
            layout = clean_layout(json.loads(self.rfile.read(length)))
        except (ValueError, TypeError):
            layout = None
        if layout is None:
            return self._json(400, {"ok": False, "error": "not a layout"})
        tmp = LAYOUT_JS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(HEADER + "window.LONGING_LAYOUT = " + json.dumps(layout, indent=1) + ";\n")
        os.replace(tmp, LAYOUT_JS)
        return self._json(200, {"ok": True})

    def log_message(self, fmt, *args):
        if self.command == "POST" or (args and str(args[1]).startswith(("4", "5"))):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"The Longing map: http://127.0.0.1:{port}/   (layout saves to data/layout.js, Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

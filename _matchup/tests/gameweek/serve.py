#!/usr/bin/env python3
"""TEST ONLY: serves the repo root on 127.0.0.1:<port>, never cached, quietly."""
import http.server, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[3]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8779), H).serve_forever()

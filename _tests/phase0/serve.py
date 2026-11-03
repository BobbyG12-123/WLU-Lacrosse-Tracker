#!/usr/bin/env python3
"""TEST ONLY: serves this folder on 127.0.0.1:8770 (never cached); POST /results/<name>.json saves a test result."""
import http.server, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
    def do_POST(self):
        m = re.fullmatch(r'/results/([A-Za-z0-9_-]{1,60})\.json', self.path)
        n = int(self.headers.get('Content-Length', '0'))
        if not m or n <= 0 or n > 5_000_000: self.send_error(400); return
        (ROOT / 'results').mkdir(exist_ok=True); (ROOT / 'results' / (m.group(1) + '.json')).write_bytes(self.rfile.read(n))
        self.send_response(201); self.end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', 8770), H).serve_forever()

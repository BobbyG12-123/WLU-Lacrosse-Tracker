#!/usr/bin/env python3
"""TEST ONLY: serves this folder on 127.0.0.1:8771 (never cached); POST /results/<name>.json saves a result.
With ANTHROPIC_API_KEY set (run_live.sh), POST /anthropic/v1/messages forwards to the real API, for the live evaluation on synthetic data."""
import http.server, os, pathlib, re, urllib.request, urllib.error
ROOT = pathlib.Path(__file__).resolve().parent
KEY = os.environ.get('ANTHROPIC_API_KEY', '')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0'))
        if self.path == '/anthropic/v1/messages':
            if not KEY or self.client_address[0] != '127.0.0.1': self.send_error(403); return
            req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=self.rfile.read(n), method='POST', headers={'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': self.headers.get('anthropic-version', '2023-06-01'), 'anthropic-beta': self.headers.get('anthropic-beta', '')})
            try:
                r = urllib.request.urlopen(req, timeout=300); status = r.status
            except urllib.error.HTTPError as e:
                r = e; status = e.code
            self.send_response(status); self.send_header('content-type', r.headers.get('content-type', 'application/octet-stream')); self.end_headers()
            while True:
                c = r.read(4096)
                if not c: break
                self.wfile.write(c); self.wfile.flush()
            return
        m = re.fullmatch(r'/results/([A-Za-z0-9_-]{1,60})\.json', self.path)
        if not m or n <= 0 or n > 20_000_000: self.send_error(400); return
        (ROOT / 'results').mkdir(exist_ok=True); (ROOT / 'results' / (m.group(1) + '.json')).write_bytes(self.rfile.read(n))
        self.send_response(201); self.end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', 8771), H).serve_forever()

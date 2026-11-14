#!/usr/bin/env python3
"""TEST ONLY: serves this folder on 127.0.0.1 for one run. Refuses to start if the port is taken.

  serve_chat.py --port 8771 --run-id <id> --results-dir <folder> [--ledger <file> --cap-usd 2]

GET  /__whoami                 who this server is, so a script can verify it started the server it's talking to
POST /results/<name>.json      saves a result in this run's own folder
GET  /__ledger                 the spending ledger (read-only; nothing in the browser can write it)
POST /anthropic/v1/messages    with a ledger and ANTHROPIC_API_KEY: reserves the worst-case cost on disk first, then forwards
"""
import argparse, http.server, json, os, pathlib, re, socket, sys, urllib.error, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from eval_ledger import EvalLedger, Refused, PRICES, worst_case_micros, actual_micros

ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, required=True); ap.add_argument('--run-id', required=True); ap.add_argument('--results-dir', required=True)
ap.add_argument('--ledger'); ap.add_argument('--cap-usd', type=float, default=2.0); ap.add_argument('--test-upstream')
ap.add_argument('--max-output', type=int, default=3000); ap.add_argument('--max-body', type=int, default=400000); ap.add_argument('--timeout', type=int, default=120)
A = ap.parse_args()
KEY = os.environ.get('ANTHROPIC_API_KEY', '')
UPSTREAM = A.test_upstream or 'https://api.anthropic.com/v1/messages'
RESULTS = pathlib.Path(A.results_dir); RESULTS.mkdir(parents=True, exist_ok=True)
LEDGER = EvalLedger(A.ledger, cap_usd=A.cap_usd) if A.ledger else None
OK_HOSTS = {f'127.0.0.1:{A.port}', f'localhost:{A.port}'}


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header('content-type', 'application/json'); self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def _local(self):
        if self.headers.get('Host') not in OK_HOSTS:   # a page on some other site can't reach this through a rebound name
            self._json(403, {'error': {'message': 'wrong host'}}); return False
        return True

    def do_GET(self):
        if not self._local(): return
        if self.path == '/__whoami': return self._json(200, {'run_id': A.run_id, 'pid': os.getpid()})
        if self.path == '/__ledger': return self._json(200, LEDGER.status() if LEDGER else {})
        super().do_GET()

    def do_POST(self):
        if not self._local(): return
        n = int(self.headers.get('Content-Length', '0'))
        if self.path == '/anthropic/v1/messages': return self._paid(n)
        m = re.fullmatch(r'/results/([A-Za-z0-9_-]{1,60})\.json', self.path)
        if not m or n <= 0 or n > 50_000_000: return self._json(400, {'error': {'message': 'bad result'}})
        tmp = RESULTS / (m.group(1) + '.json.tmp'); tmp.write_bytes(self.rfile.read(n)); os.replace(tmp, RESULTS / (m.group(1) + '.json'))
        self.send_response(201); self.end_headers()

    def _paid(self, n):
        if not LEDGER or not (KEY or A.test_upstream): return self._json(403, {'error': {'message': 'paid calls are not enabled on this server'}})
        if self.headers.get('x-run-token') != A.run_id: return self._json(403, {'error': {'message': 'not this run'}})
        if n <= 0 or n > A.max_body: return self._json(413, {'error': {'message': 'too large'}})
        raw = self.rfile.read(n)
        try: body = json.loads(raw)
        except ValueError: return self._json(400, {'error': {'message': 'bad json'}})
        model, max_tok = body.get('model'), body.get('max_tokens')
        price = PRICES.get(model)
        if not price: return self._json(403, {'error': {'message': 'this model is not on the test list'}})
        if not isinstance(max_tok, int) or max_tok < 1 or max_tok > A.max_output: return self._json(403, {'error': {'message': 'output limit too high'}})
        if body.get('fallbacks') is not None: return self._json(403, {'error': {'message': 'fallbacks can bill another model'}})
        worst = worst_case_micros(len(raw), max_tok, price)
        try: rid = LEDGER.reserve(worst, model, A.run_id)   # on disk before anything goes out
        except Refused as e: return self._json(402 if e.reason == 'budget' else 429, {'error': {'type': e.reason, 'message': 'test allowance reached' if e.reason == 'budget' else 'too many at once'}})
        except Exception:    # an unreadable ledger is a stop, not a guess
            return self._json(503, {'error': {'message': 'ledger unavailable'}})
        req = urllib.request.Request(UPSTREAM, data=raw, method='POST', headers={'content-type': 'application/json', 'x-api-key': KEY or 'test', 'anthropic-version': self.headers.get('anthropic-version', '2023-06-01'), 'anthropic-beta': self.headers.get('anthropic-beta', '')})
        try: r = urllib.request.urlopen(req, timeout=A.timeout)   # one try: no retries
        except urllib.error.HTTPError as e:
            LEDGER.settle(rid, 0)   # refused by the provider: not billed
            detail = e.read(2000)
            sys.stderr.write(f'upstream {e.code}: {detail[:400]!r}\n'); sys.stderr.flush()
            return self._json(e.code, {'error': {'message': 'provider refused the request'}})
        except Exception as e:
            LEDGER.settle(rid, worst)   # can't tell if it was billed: count it
            sys.stderr.write(f'upstream failed: {type(e).__name__}\n'); sys.stderr.flush()
            return self._json(502, {'error': {'message': 'provider not reached'}})
        self.send_response(200); self.send_header('content-type', 'text/event-stream'); self.end_headers()
        usage, stopped, buf, client = {}, False, b'', True
        try:
            while True:
                c = r.read(2048)
                if not c: break
                if client:   # keep reading after the browser leaves, so the real cost is still known
                    try: self.wfile.write(c); self.wfile.flush()
                    except OSError: client = False
                buf += c
                while b'\n' in buf:
                    line, buf = buf.split(b'\n', 1)
                    if not line.startswith(b'data:'): continue
                    try: ev = json.loads(line[5:])
                    except ValueError: continue
                    if ev.get('type') == 'message_start': usage.update((ev.get('message') or {}).get('usage') or {})
                    elif ev.get('type') == 'message_delta': usage.update(ev.get('usage') or {})
                    elif ev.get('type') == 'message_stop': stopped = True
        except Exception as e:
            sys.stderr.write(f'stream failed: {type(e).__name__}\n'); sys.stderr.flush()
        # Only a complete answer settles at its real usage. Anything cut short stays charged in full.
        if stopped:
            u = {'input': usage.get('input_tokens', 0), 'output': usage.get('output_tokens', 0), 'cache_read': usage.get('cache_read_input_tokens', 0), 'cache_write': usage.get('cache_creation_input_tokens', 0)}
            LEDGER.settle(rid, actual_micros(u, price), u)
        else:
            LEDGER.settle(rid, worst)


class S(http.server.ThreadingHTTPServer):
    allow_reuse_address = False   # a port in use is an error, not something to share
    daemon_threads = True


try:
    srv = S(('127.0.0.1', A.port), H)
except OSError as e:
    print(f'REFUSED: port {A.port} is already in use ({e.strerror}). Nothing was stopped.', file=sys.stderr); sys.exit(3)
print(f'READY run={A.run_id} pid={os.getpid()} port={A.port}', flush=True)
srv.serve_forever()

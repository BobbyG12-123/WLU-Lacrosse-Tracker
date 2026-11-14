#!/usr/bin/env python3
"""TEST ONLY: the paid-call ledger and server, with a fake provider on this machine. No real provider and no real money."""
import concurrent.futures, http.server, json, os, pathlib, re, signal, socket, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import eval_ledger as EL
R = []
def ok(name, cond, info=None):
    R.append(bool(cond)); print(('  OK   ' if cond else '  FAIL ') + name + ('' if cond else f'  {info!r}'), flush=True)

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

# ---- Fake provider ----
class Fake:
    forwards = 0; mode = 'ok'; bodies = []; lock = threading.Lock(); inflight = 0; peak = 0; release = threading.Event()
def sse(u_in=100, u_out=10, stop=True):
    ev = [{'type': 'message_start', 'message': {'usage': {'input_tokens': u_in, 'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0}}}, {'type': 'message_delta', 'usage': {'output_tokens': u_out}, 'delta': {'stop_reason': 'end_turn'}}]
    if stop: ev.append({'type': 'message_stop'})
    return ''.join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in ev).encode()
class FH(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        b = self.rfile.read(int(self.headers['Content-Length']))
        with Fake.lock:
            Fake.forwards += 1; Fake.bodies.append(b); Fake.inflight += 1; Fake.peak = max(Fake.peak, Fake.inflight)
        try:
            if Fake.mode == 'hang': Fake.release.wait(30)
            if Fake.mode == 'slowbig': time.sleep(0.15)
            if Fake.mode == 'err500': self.send_response(500); self.end_headers(); self.wfile.write(b'secret detail'); return
            self.send_response(200); self.end_headers(); self.wfile.write(sse(u_out=3000 if Fake.mode in ('big', 'slowbig') else 10, stop=Fake.mode != 'cut'))
        finally:
            with Fake.lock: Fake.inflight -= 1
fp = free_port(); fsrv = http.server.ThreadingHTTPServer(('127.0.0.1', fp), FH); threading.Thread(target=fsrv.serve_forever, daemon=True).start()

def start(tmp, port=None, run='runA', ledger='ledger.json', cap='2', extra=()):
    port = port or free_port()
    env = dict(os.environ); env.pop('ANTHROPIC_API_KEY', None)
    p = subprocess.Popen([sys.executable, str(HERE / 'serve_chat.py'), '--port', str(port), '--run-id', run, '--results-dir', str(tmp / ('res_' + run)), '--ledger', str(tmp / ledger), '--cap-usd', cap, '--test-upstream', f'http://127.0.0.1:{fp}/v1/messages'] + list(extra), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True)
    line = p.stdout.readline()
    return p, port, line

def post(port, body, token='runA', path='/anthropic/v1/messages', host=None):
    data = body if isinstance(body, bytes) else json.dumps(body).encode()
    h = {'content-type': 'application/json', 'x-run-token': token}
    if host: h['Host'] = host
    try:
        r = urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=data, headers=h, method='POST'), timeout=30)
        return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
def ledger(port):
    return json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/__ledger'))
BODY = {'model': 'claude-haiku-5-5', 'max_tokens': 3000, 'stream': True, 'messages': [{'role': 'user', 'content': 'hi'}]}

tmp = pathlib.Path(tempfile.mkdtemp(prefix='evaltest'))
print('Prices')
w = (HERE.parent / 'gateway' / 'worker.js').read_text()
for m, p in EL.PRICES.items():
    js = re.search(r"'" + m + r"': \{ in: ([\d.]+), cw: ([\d.]+), cr: ([\d.]+), out: ([\d.]+)", w)
    ok(f'{m}: same prices as the Worker', js and [float(x) for x in js.groups()] == [p['in'], p['cw'], p['cr'], p['out']], js and js.groups())

print('Server identity and port')
srv, port, line = start(tmp)
ok('server says who it is', json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/__whoami')) == {'run_id': 'runA', 'pid': srv.pid} and f'pid={srv.pid}' in line, line)
p2 = subprocess.run([sys.executable, str(HERE / 'serve_chat.py'), '--port', str(port), '--run-id', 'other', '--results-dir', str(tmp / 'r2')], capture_output=True, text=True, timeout=20)
ok('an occupied port refuses to start, and stops nothing', p2.returncode == 3 and 'REFUSED' in p2.stderr and srv.poll() is None, (p2.returncode, p2.stderr))

print('Who may spend')
for label, kw, want in [('wrong run token', {'token': 'x'}, 403), ('wrong host name', {'host': 'evil.test'}, 403)]:
    n0 = Fake.forwards; c, _ = post(port, BODY, **kw); ok(f'{label}: refused, nothing forwarded', c == want and Fake.forwards == n0, c)
n0 = Fake.forwards
for label, b, want in [('a model not on the list', dict(BODY, model='claude-opus-5-5'), 403), ('a higher output limit', dict(BODY, max_tokens=9000), 403), ('fallbacks', dict(BODY, fallbacks='default'), 403), ('not JSON', b'nope', 400), ('too large', dict(BODY, pad='x' * 500000), 413)]:
    c, _ = post(port, b); ok(f'{label}: refused', c == want, c)
ok('none of those reached the provider', Fake.forwards == n0)
c, _ = post(port, b'{}', path='/spend'); ok('there is no way to write spending from the browser', c == 400, c)
c, _ = post(port, b'{}', path='/__ledger'); ok('the ledger can\'t be posted to', c == 400, c)

print('Reserve and settle')
c, body = post(port, BODY); st = ledger(port)
ok('a good call goes through and is passed back', c == 200 and b'message_stop' in body, c)
want = EL.actual_micros({'input': 100, 'output': 10, 'cache_read': 0, 'cache_write': 0}, EL.PRICES['claude-haiku-5-5'])
ok('it settles at the real cost', round(st['spent_usd'] * 1e6) == want and st['reserved_usd'] == 0 and st['calls'] == 1, st)
ok('usage recorded by model', st['by_model']['claude-haiku-5-5']['input'] == 100 and st['by_model']['claude-haiku-5-5']['output'] == 10, st)
Fake.mode = 'err500'; s0 = ledger(port)['spent_usd']; c, b = post(port, BODY); ok('a provider refusal costs nothing and hides its body', c == 500 and ledger(port)['spent_usd'] == s0 and b'secret' not in b, (c, b))
Fake.mode = 'cut'; s0 = ledger(port)['spent_usd']; post(port, BODY); time.sleep(0.1); s1 = ledger(port)['spent_usd']
worst = EL.worst_case_micros(len(json.dumps(BODY)), 3000, EL.PRICES['claude-haiku-5-5'])
ok('a cut-off stream stays charged at the full reservation', abs((s1 - s0) * 1e6 - worst) < 2, (s1 - s0, worst))
Fake.mode = 'ok'
srv.terminate(); srv.wait(); srv.stdout.close(); srv.stderr.close()

print('The cap')
srv, port, _ = start(tmp, ledger='cap.json', cap='0.112')   # allowance $0.112 less the $0.10 margin = $0.012 usable; each call reserves about $0.0015
Fake.forwards = 0; n = 0; Fake.mode = 'big'
for i in range(40):
    c, _ = post(port, BODY)
    if c == 402: break
    n += 1
st = ledger(port); Fake.mode = 'ok'
ok('stops with a budget refusal before the cap', c == 402 and n > 2 and st['spent_usd'] + st['reserved_usd'] <= 0.012 and st['refused'] >= 1, (c, n, st))
ok('the refused call never reached the provider', Fake.forwards == n, (Fake.forwards, n))
srv.terminate(); srv.wait(); srv.stdout.close(); srv.stderr.close()
srv, port, _ = start(tmp, ledger='cap.json', cap='0.112', run='runB')
n0 = Fake.forwards; c, _ = post(port, BODY, token='runB')
ok('a new run sees the old spending and is still refused', c == 402 and Fake.forwards == n0 and ledger(port)['spent_usd'] == st['spent_usd'], (c, ledger(port)))
srv.terminate(); srv.wait(); srv.stdout.close(); srv.stderr.close()

print('Questions at the same time')
srv, port, _ = start(tmp, ledger='race.json', cap='0.104')   # $0.004 usable: fits 2 calls at the worst-case price, however they arrive
Fake.mode = 'slowbig'; Fake.forwards = 0; Fake.peak = 0
with concurrent.futures.ThreadPoolExecutor(30) as ex: codes = list(ex.map(lambda _: post(port, BODY)[0], range(30)))
st = ledger(port); Fake.mode = 'ok'
ok('30 at once: at most 2 in flight, and the rest refused', Fake.peak <= EL.MAX_IN_FLIGHT and set(codes) <= {200, 402, 429} and 429 in codes and codes.count(200) <= 2 and codes.count(200) >= 1, (Fake.peak, codes.count(200), sorted(set(codes))))
ok('30 at once: never past the usable amount', st['spent_usd'] + st['reserved_usd'] <= 0.004 and Fake.forwards == codes.count(200), st)
srv.terminate(); srv.wait(); srv.stdout.close(); srv.stderr.close()
# Separate processes, the same file.
L = tmp / 'multi.json'
code = f"import sys; sys.path.insert(0, {str(HERE)!r}); import eval_ledger as E, time\nL = E.EvalLedger({str(L)!r}, cap_usd=0.15, margin_usd=0.1)\nn = 0\nfor i in range(200):\n    try: r = L.reserve(1000, 'm', 'p'); n += 1; L.settle(r, 1000)\n    except E.Refused as e:\n        if e.reason == 'budget': break\nprint(n)"
ps = [subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, text=True) for _ in range(5)]
counts = [int(p.communicate()[0]) for p in ps]
final = EL.EvalLedger(L, cap_usd=0.15, margin_usd=0.1).status()
ok('5 separate processes on one file: exact, no double spending', sum(counts) == 50 and abs(final['spent_usd'] - 0.05) < 1e-9, (counts, final))

print('Crashes')
srv, port, _ = start(tmp, ledger='crash.json')
Fake.mode = 'hang'; Fake.release.clear()
def _call_dies():
    try: post(port, BODY)
    except Exception: pass   # expected: the server is killed while this call is out
t = threading.Thread(target=_call_dies, daemon=True); t.start(); time.sleep(0.5)
on_disk = json.loads((tmp / 'crash.json').read_text())
ok('the reservation is on disk while the call is out', any(m['reserved'] for m in on_disk['months'].values()))
srv.send_signal(signal.SIGKILL); srv.wait(); srv.stdout.close(); srv.stderr.close(); Fake.release.set(); Fake.mode = 'ok'; t.join(5)
srv, port, _ = start(tmp, ledger='crash.json', run='runC')
st = ledger(port)
ok('after a crash it is charged in full', abs(st['spent_usd'] * 1e6 - worst) < 2 and st['never_settled'] == 1 and st['reserved_usd'] == 0, st)
ok('the figure for the monthly budget includes it', st['spent_usd'] <= json.loads(st['prior_spend_json'])[st['month']], st)
srv.terminate(); srv.wait(); srv.stdout.close(); srv.stderr.close()
(tmp / 'bad.json').write_text('{ not json')
srv, port, _ = start(tmp, ledger='bad.json', run='runD'); n0 = Fake.forwards; c, _ = post(port, BODY, token='runD')
ok('an unreadable ledger stops spending', c == 503 and Fake.forwards == n0, c)
ok('the unreadable file is left as it was', (tmp / 'bad.json').read_text() == '{ not json')
srv.terminate(); srv.wait(); srv.stdout.close(); srv.stderr.close()

print('Month')
import datetime as dt
ts = lambda *a: dt.datetime(*a, tzinfo=dt.timezone.utc).timestamp()
ok('11:30 pm Nov 30 in New York is still November', EL.month_key(ts(2026, 12, 1, 4, 30)) == '2026-11')
ok('12:30 am Dec 1 in New York is December', EL.month_key(ts(2026, 12, 1, 5, 30)) == '2026-12')

print('Results')
srv, port, _ = start(tmp, ledger='r.json', run='runE')
c, _ = post(port, b'{"a":1}', path='/results/x.json', token='runE'); res = tmp / 'res_runE' / 'x.json'
ok('results go to this run\'s own folder', c == 201 and res.read_text() == '{"a":1}', c)
c, _ = post(port, b'{}', path='/results/../../evil.json', token='runE'); ok('a path outside the folder is refused', c == 400, c)
srv.terminate(); srv.wait(); srv.stdout.close(); srv.stderr.close()
fsrv.shutdown()
fails = R.count(False); print(f'pass {len(R) - fails}  fail {fails}'); sys.exit(1 if fails else 0)

#!/usr/bin/env python3
"""TEST ONLY, no money: runs run_compare.sh end to end against a fake provider, twice.
1. A large allowance: every conversation finishes.
2. An allowance that runs out partway: the run says it's incomplete and scores every setup on the same finished conversations.
It also checks that a second run keeps the first run's evidence and that the shared ledger carries over."""
import http.server, json, os, pathlib, re, socket, subprocess, sys, tempfile, threading
HERE = pathlib.Path(__file__).resolve().parent
R = []
def ok(name, cond, info=None):
    R.append(bool(cond)); print(('  OK   ' if cond else '  FAIL ') + name + ('' if cond else f'  {info!r}'), flush=True)
def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
class Fake:
    calls = 0; models = []; system_seen = set()
class FH(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        Fake.calls += 1; Fake.models.append((b['model'], b.get('output_config', {}).get('effort')))
        last = b['messages'][-1]['content']; txt = 'Scripted answer for testing the flow only.'
        ev = [{'type': 'message_start', 'message': {'usage': {'input_tokens': 2000, 'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0}}}, {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}}, {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': txt}}, {'type': 'content_block_stop', 'index': 0}, {'type': 'message_delta', 'delta': {'stop_reason': 'end_turn'}, 'usage': {'output_tokens': 300}}, {'type': 'message_stop'}]
        self.send_response(200); self.end_headers(); self.wfile.write(''.join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in ev).encode())
fp = free_port(); srv = http.server.ThreadingHTTPServer(('127.0.0.1', fp), FH); threading.Thread(target=srv.serve_forever, daemon=True).start()
tmp = pathlib.Path(tempfile.mkdtemp(prefix='cmpflow')); ledger = tmp / 'ledger.json'
def run(cap, port):
    env = dict(os.environ, TEST_UPSTREAM=f'http://127.0.0.1:{fp}/v1/messages', TEST_LEDGER=str(ledger), CAP_USD=str(cap), PORT=str(port)); env.pop('ANTHROPIC_API_KEY', None)
    p = subprocess.run(['./run_compare.sh'], cwd=HERE, env=env, capture_output=True, text=True, timeout=900)
    m = re.search(r'Evidence goes to (\S+)', p.stdout)
    return p, pathlib.Path(m.group(1)) if m else None
print('A run that finishes')
p1, d1 = run(1000, free_port()); print(p1.stdout[-1500:]); print(p1.stderr[-500:], end='')
r1 = json.load(open(d1 / 'comparison.json'))
ok('exit 0 and marked complete', p1.returncode == 0 and r1['complete'] is True and r1['conversations_compared'] == r1['conversations_total'], (p1.returncode, r1.get('err')))
ok('every setup answered the same questions', len({c['turns'] for c in r1['configs']}) == 1 and r1['configs'][0]['turns'] > 20, [c['turns'] for c in r1['configs']])
ok('the three setups really reached the provider', set(Fake.models) == {('claude-haiku-5-5', 'low'), ('claude-haiku-5-5', 'medium'), ('claude-sonnet-5-5', 'low')}, set(Fake.models))
ok('the scripted answers are flagged where they lack the facts (the checks can fail)', all(c['clean'] < c['turns'] for c in r1['configs']), [c['clean'] for c in r1['configs']])
ok('no database writes, no rows flag', r1['no_database_writes'] is True and r1['record_rows_sent'] is False and r1['synthetic_only'] is True)
ok('a summary is kept with the run', (d1 / 'summary.txt').exists() and 'PRIOR_SPEND_JSON' in (d1 / 'summary.txt').read_text())
s1 = json.loads(ledger.read_text()); month = sorted(s1['months'])[-1]; spent1 = s1['months'][month]['spent_micros']
print('A run stopped by the allowance')
cap = (spent1 / 1e6) + 0.10 + 0.09   # the same ledger, with 9 cents left: a Sonnet call reserves about 6, and each conversation really costs about 1
n0 = Fake.calls; p2, d2 = run(round(cap, 6), free_port()); print(p2.stdout[-900:]); print(p2.stderr[-500:], end='')
r2 = json.load(open(d2 / 'comparison.json'))
ok('marked incomplete, because of the allowance', r2['complete'] is False and r2['stopped_by_allowance'] is True, (r2.get('complete'), r2.get('stopped_by_allowance'), r2.get('err')))
ok('it says so in the summary', 'INCOMPLETE because the test allowance was reached' in (d2 / 'summary.txt').read_text())
ok('some questions finished, some not, and they are named', 0 < r2['conversations_compared'] < r2['conversations_total'] and len(r2['not_compared']) == r2['conversations_total'] - r2['conversations_compared'], (r2['conversations_compared'], r2['not_compared'][:2]))
ok('every setup is scored on the same finished questions', len({c['turns'] for c in r2['configs']}) == 1, [c['turns'] for c in r2['configs']])
sets = [[t['q'] for c in r2['conversations'] for t in c['setups'][k]] for k in (r2['conversations'][0]['setups'] if r2['conversations'] else {})]
ok('the same questions, word for word', sets and all(s == sets[0] for s in sets), [len(s) for s in sets])
ok('the ledger stopped it within the allowance', r2['ledger']['spent_usd'] + r2['ledger']['reserved_usd'] <= r2['ledger']['stop_at_usd'] and r2['ledger']['refused'] >= 1, r2['ledger'])
ok('spending from the first run carried over', r2['ledger']['spent_usd'] * 1e6 >= spent1, (r2['ledger']['spent_usd'], spent1))
print('Evidence')
ok('each run has its own folder, and the first is untouched', d1 != d2 and (d1 / 'comparison.json').exists() and json.load(open(d1 / 'comparison.json'))['complete'] is True, (d1, d2))
print('A port already in use')
blocker = socket.socket(); blocker.bind(('127.0.0.1', 0)); blocker.listen(1); bp = blocker.getsockname()[1]
p3, _ = run(1000, bp)
ok('refuses, exits non-zero, and the other program keeps running', p3.returncode != 0 and 'REFUSED' in p3.stderr and blocker.fileno() != -1, (p3.returncode, p3.stderr[-200:]))
blocker.close(); srv.shutdown()
fails = R.count(False); print(f'pass {len(R) - fails}  fail {fails}'); sys.exit(1 if fails else 0)

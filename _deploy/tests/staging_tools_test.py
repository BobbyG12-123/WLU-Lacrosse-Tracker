#!/usr/bin/env python3
"""TEST ONLY: prepare_staging.py and staging_check.py, on this machine. Deploys and publishes nothing; synthetic addresses only.
  python3 _deploy/tests/staging_tools_test.py <firebase test config file>
"""
import http.server, importlib.util, os, pathlib, re, shutil, socket, subprocess, sys, tempfile, threading, time, tomllib
HERE = pathlib.Path(__file__).resolve().parent; DEPLOY = HERE.parent; ROOT = DEPLOY.parent
CONFIG = sys.argv[1]
R = []
def ok(name, cond, info=None):
    R.append(bool(cond)); print(('  OK   ' if cond else '  FAIL ') + name + ('' if cond else f'  {info!r}'), flush=True)
def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
tmp = pathlib.Path(tempfile.mkdtemp(prefix='stagingtools')); out = tmp / 'out'
prep = lambda *a: subprocess.run([sys.executable, str(DEPLOY / 'prepare_staging.py'), *a], capture_output=True, text=True)
STAFF = 'one@test.invalid,two@test.invalid'

print('Refusals')
bad = tmp / 'prod.js'; bad.write_text('const c = { apiKey: "k", projectId: "wlu-lacrosse-tracker", appId: "a" };')
p = prep('--firebase-config', str(bad), '--staff', STAFF, '--out', str(out))
ok('a production config is refused, and nothing is written', p.returncode == 2 and not out.exists(), (p.returncode, p.stderr))
p = prep('--firebase-config', CONFIG, '--staff', STAFF, '--out', str(ROOT / '_deploy' / 'x'))
ok('an output folder inside the public repository is refused', p.returncode == 2 and not (ROOT / '_deploy' / 'x').exists(), p.stderr)
p = prep('--firebase-config', CONFIG, '--staff', "a@b.c'] || true || ['", '--out', str(out))
ok('a malformed staff address is refused', p.returncode == 2, p.stderr)

print('The build')
p = prep('--firebase-config', CONFIG, '--staff', STAFF, '--out', str(out), '--chat')
ok('it builds', p.returncode == 0, p.stderr)
html = (out / 'dist' / 'index.html').read_text(encoding='utf-8')
prod_key = re.search(r'FIREBASE_WEB_KEY = "([^"]+)"', (DEPLOY / 'wrangler.toml').read_text()).group(1)
ok('no production project or key anywhere in the pages', not any('wlu-lacrosse-tracker' in f.read_text(encoding='utf-8') or prod_key in f.read_text(encoding='utf-8') for f in (out / 'dist').iterdir()))
ok('the pages point at the test project', 'projectId: "wlu-tracker-test"' in html)
ok('the page lists only the staging addresses', re.search(r'ALLOWED_COACHES = \[(.*?)\]', html).group(1) == "'one@test.invalid', 'two@test.invalid'", re.search(r'ALLOWED_COACHES = \[(.*?)\]', html).group(1))
ok('chat is pointed at the same-origin gateway', "let CHAT_GW_URL = '/chat-api';" in html)
ok('the repository itself is unchanged by the build', subprocess.run(['git', '-C', str(ROOT), 'status', '--short', '--', 'index.html'], capture_output=True, text=True).stdout == '')
spec = importlib.util.spec_from_file_location('check_rules', DEPLOY / 'check_rules.py'); cr = importlib.util.module_from_spec(spec); spec.loader.exec_module(cr)
rules = (out / 'staging_rules.rules').read_text(); problems, emails, _ = cr.verdict(rules, 'app/roster')
ok('the generated rules pass the checker, with exactly those addresses', not problems and emails == ['one@test.invalid', 'two@test.invalid'], (problems, emails))
t = tomllib.loads((out / 'wrangler.staging.toml').read_text()); v = t['vars']
import hashlib
ok('the settings carry the fingerprint of those exact rules', v['STAFF_RULES_REVIEWED'] == 'sha256:' + hashlib.sha256(rules.encode()).hexdigest(), v['STAFF_RULES_REVIEWED'])
ok('settings: test project, gate first, version URLs off', v['FIREBASE_PROJECT_ID'] == 'wlu-tracker-test' and t['assets']['run_worker_first'] is True and t['preview_urls'] is False)
ok('settings: budget limits present, no record rows, no paid plan setting', v['BUDGET_USD'] == '10' and 'ALLOW_RECORD_ROWS' not in v and 'limits' not in t and 'usage_model' not in t)
ok('settings: durable budget storage is the free-plan kind', t['migrations'][0]['new_sqlite_classes'] == ['BudgetLedger'])
ok('no secret in the settings file', not re.search(r'ANTHROPIC_API_KEY|SESSION_SECRET\s*=', (out / 'wrangler.staging.toml').read_text()))

print('The signed-out check, against the real gate and real pages')
port = free_port()
srv = subprocess.Popen(['deno', 'run', '--no-prompt', f'--allow-net=127.0.0.1', f'--allow-read={out / "dist"}', str(HERE / 'serve_gate_local.js'), str(port), str(out / 'dist')], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
ready = srv.stdout.readline().strip()
c = subprocess.run([sys.executable, str(DEPLOY / 'staging_check.py'), f'http://127.0.0.1:{port}'], capture_output=True, text=True)
srv.kill(); srv.wait(); srv.stdout.close(); srv.stderr.close()
print(c.stdout, end='')
ok('passes against the gate', ready == 'READY' and c.returncode == 0, (ready, c.returncode, c.stderr[-300:]))

print('The signed-out check can fail: the same pages with no gate')
class Plain(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(out / 'dist'), **k)
    def log_message(self, *a): pass
plain = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Plain); threading.Thread(target=plain.serve_forever, daemon=True).start()
c2 = subprocess.run([sys.executable, str(DEPLOY / 'staging_check.py'), f'http://127.0.0.1:{plain.server_address[1]}'], capture_output=True, text=True)
plain.shutdown()
ok('fails when the pages are exposed', c2.returncode == 1 and 'FAIL GET /index.html' in c2.stdout.replace('  ', ' '), (c2.returncode, c2.stdout[:300]))
shutil.rmtree(tmp, ignore_errors=True)
fails = R.count(False); print(f'pass {len(R) - fails}  fail {fails}'); sys.exit(1 if fails else 0)

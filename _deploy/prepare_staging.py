#!/usr/bin/env python3
"""Prepares staging against the separate test project. Writes files on this computer only; deploys and publishes nothing.

  python3 _deploy/prepare_staging.py --firebase-config <firebase_test_config.js> --staff you@example.com,second@example.com --out <folder outside the repo> [--chat]

Writes, under --out:
  staging_rules.rules        the rules to publish in the TEST project (Google sign-in + those addresses). It must pass check_rules.py.
  dist/                      the pages, pointed at the test project, with the page's staff list set to those addresses
  wrangler.staging.toml      the staging Worker settings, with the test project's web key and the rules fingerprint filled in
Refuses to write anything if the config isn't the test project, or if a production identifier would remain in the pages.
"""
import argparse, hashlib, importlib.util, pathlib, re, shutil, sys
HERE = pathlib.Path(__file__).resolve().parent; ROOT = HERE.parent
TEST_PROJECT = 'wlu-tracker-test'; PROD_PROJECT = 'wlu-lacrosse-tracker'
spec = importlib.util.spec_from_file_location('check_rules', HERE / 'check_rules.py'); cr = importlib.util.module_from_spec(spec); spec.loader.exec_module(cr)

def die(msg):
    print('REFUSED: ' + msg, file=sys.stderr); sys.exit(2)

ap = argparse.ArgumentParser()
ap.add_argument('--firebase-config', required=True); ap.add_argument('--staff', required=True); ap.add_argument('--out', required=True); ap.add_argument('--chat', action='store_true')
A = ap.parse_args()
cfg = pathlib.Path(A.firebase_config).read_text(encoding='utf-8')
field = lambda k: (re.search(k + r'''\s*:\s*["']([^"']+)["']''', cfg) or [None, None])[1]
project, key, app_id, sender = field('projectId'), field('apiKey'), field('appId'), field('messagingSenderId')
if project != TEST_PROJECT: die(f'this config is for {project}, not {TEST_PROJECT}')
if not key or not app_id: die('the config has no apiKey or appId')
staff = [s.strip().lower() for s in A.staff.split(',') if s.strip()]
if not 1 <= len(staff) <= 5 or not all(re.fullmatch(r'[^@\s\']+@[^@\s\']+', s) for s in staff): die('give 1 to 5 plain addresses in --staff')
out = pathlib.Path(A.out).resolve()
if out == ROOT or ROOT in out.parents: die('--out must be outside the repository: this repository is public')

# The rules for the test project: the same collections the tracker uses, staff by Google sign-in.
quoted = ', '.join(f"'{s}'" for s in staff)
rules = f"""rules_version = '2';
// TEST PROJECT ONLY: {TEST_PROJECT}. Temporary, for staging. Restore the project's baseline rules afterward.
service cloud.firestore {{
  match /databases/{{db}}/documents {{
    function isCoach() {{
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.firebase.sign_in_provider == 'google.com'
        && request.auth.token.email.lower() in [{quoted}];
    }}
    match /app/{{id}} {{ allow read, write: if isCoach(); }}
    match /sessions/{{id}} {{ allow read, write: if isCoach(); }}
    match /evalPlayers/{{id}} {{ allow read, write: if isCoach(); }}
    match /evalRatings/{{id}} {{ allow read, write: if isCoach(); }}
    match /filmTags/{{id}} {{ allow read, write: if isCoach(); }}
    match /filmSessions/{{id}} {{ allow read, write: if isCoach(); }}
    match /trainQueues/{{id}} {{ allow read, write: if isCoach(); }}
    match /trainShots/{{id}} {{ allow read, write: if isCoach(); }}
  }}
}}
"""
problems, _, _ = cr.verdict(rules, 'app/roster')
if problems: die('the generated rules fail the check: ' + '; '.join(problems))
fingerprint = hashlib.sha256(rules.encode()).hexdigest()

# The pages, pointed at the test project.
pages = {}
for name in ['index.html', 'opponent-scout.html', 'train-tagger.html']:
    pages[name] = (ROOT / name).read_text(encoding='utf-8')
html = pages['index.html']
new_cfg = 'firebase.initializeApp({ apiKey: "%s", authDomain: "%s.firebaseapp.com", projectId: "%s", appId: "%s" });' % (key, TEST_PROJECT, TEST_PROJECT, app_id)
html, n = re.subn(r'firebase\.initializeApp\(\{[^}]*\}\);', lambda m: new_cfg, html)
if n != 1: die(f'expected one Firebase config block in index.html, found {n}')
list_js = 'const ALLOWED_COACHES = [' + ', '.join(f"'{s}'" for s in staff) + '];'
html, n = re.subn(r'const ALLOWED_COACHES = \[[^\]]*\];', lambda m: list_js, html)
if n != 1: die('expected one ALLOWED_COACHES list')
html, n = re.subn(r"const DATA_HEALTH_OWNER = '[^']*';", lambda m: f"const DATA_HEALTH_OWNER = '{staff[0]}';", html)
if n != 1: die('expected one DATA_HEALTH_OWNER')
if A.chat:
    old = "let CHAT_GW_URL = '';"
    if html.count(old) != 1: die('gateway setting not found exactly once')
    html = html.replace(old, "let CHAT_GW_URL = '/chat-api';")
pages['index.html'] = html
prod_key = re.search(r'FIREBASE_WEB_KEY = "([^"]+)"', (HERE / 'wrangler.toml').read_text()).group(1)
for name, text in pages.items():
    for bad in (PROD_PROJECT, prod_key):
        if bad in text: die(f'{name} still holds a production identifier')

toml = (HERE / 'wrangler.staging.toml').read_text(encoding='utf-8')
if f'FIREBASE_PROJECT_ID = "{TEST_PROJECT}"' not in toml: die('the staging settings do not name the test project')
toml = toml.replace('main = "../_chat/gateway/worker.js"', f'main = "{ROOT / "_chat/gateway/worker.js"}"')
toml = toml.replace('[vars]\n', f'[vars]\nFIREBASE_WEB_KEY = "{key}"\nSTAFF_RULES_REVIEWED = "sha256:{fingerprint}"\n', 1)
toml = toml.replace('OWNER_EMAILS = ""', f'OWNER_EMAILS = "{staff[0]}"')
if A.chat: toml = toml.replace('CHAT_DISABLED = "1"', 'CHAT_DISABLED = "0"')

dist = out / 'dist'
if dist.exists(): shutil.rmtree(dist)
dist.mkdir(parents=True)
for name, text in pages.items(): (dist / name).write_text(text, encoding='utf-8')
(out / 'staging_rules.rules').write_text(rules, encoding='utf-8')
(out / 'wrangler.staging.toml').write_text(toml, encoding='utf-8')
print(f'Prepared in {out}\n  rules fingerprint sha256:{fingerprint}\n  staff addresses: {len(staff)}\n  chat in the pages: {"on" if A.chat else "off"}\nNothing was deployed or published.')

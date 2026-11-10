#!/bin/bash
# TEST ONLY: Matchup engine checks. Synthetic data, no tracker, no database, no network. Needs deno, python3 and Google Chrome.
# Exit code 0 only if every check passes.
set -euo pipefail
cd "$(dirname "$0")/.."
deno run --check=none --allow-read=. tests/engine_tests.js
deno run --check=none --allow-read=. tests/picks_tests.js
deno run --check=none --allow-read=. v3/tests/v3_tests.js
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
cp ../_tests/phase0/serve.py .
rm -rf results chrome_profile; mkdir -p results
python3 serve.py & SRV=$!
trap 'kill $SRV 2>/dev/null || true; kill ${CP:-0} 2>/dev/null || true' EXIT
sleep 1
"$CHROME" --headless=new --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions "http://127.0.0.1:8770/tests/browser_worker.html" >/dev/null 2>&1 & CP=$!
for i in $(seq 1 60); do sleep 2; [ -f results/browser_worker.json ] && break; done
sleep 1
python3 - results/browser_worker.json <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: print('NO BROWSER RESULT (timed out)'); sys.exit(1)
if d.get('err'): print('HARNESS ERROR', d['err'][:1500])
for r in d['results']: print(('  OK   ' if r['ok'] else '  FAIL ') + r['name'] + ('' if r['ok'] else '  ' + json.dumps(r['info'])[:400]))
print(f"browser pass {d['pass']}  fail {d['fail']}")
sys.exit(0 if d['fail'] == 0 and not d.get('err') else 1)
PY

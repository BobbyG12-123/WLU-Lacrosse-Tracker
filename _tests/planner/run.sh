#!/bin/bash
# TEST ONLY: Scrimmage Planner regression checks. Runs the planner's own simulation functions, pulled from index.html, in headless
# Chrome with synthetic players. No tracker boot, no database, no export, no network.
#   _tests/planner/run.sh [path to index.html, default ../../index.html]
# Needs python3 and Google Chrome. Exit code 0 only if every check passes.
set -euo pipefail
cd "$(dirname "$0")"
PAGE=${1:-../../index.html}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
cp "$PAGE" index.html; cp ../phase0/serve.py .
rm -rf results chrome_profile; mkdir -p results
python3 serve.py & SRV=$!
trap 'kill $SRV 2>/dev/null || true; kill ${CP:-0} 2>/dev/null || true' EXIT
sleep 1
"$CHROME" --headless=new --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions "http://127.0.0.1:8770/planner_tests.html" >/dev/null 2>&1 & CP=$!
OUT=results/planner_tests.json
for i in $(seq 1 150); do sleep 2; [ -f "$OUT" ] && break; done
sleep 1
python3 - "$OUT" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: print('NO RESULT (timed out)'); sys.exit(1)
if d.get('err'): print('HARNESS ERROR', d['err'][:2000])
for r in d.get('results', []): print(('  OK   ' if r['ok'] else '  FAIL ') + r['name'] + ('  ' + json.dumps(r['info'])[:400] if r['info'] is not None else ''))
print(f"pass {d.get('pass')}  fail {d.get('fail')}")
sys.exit(0 if d.get('fail') == 0 and not d.get('err') else 1)
PY

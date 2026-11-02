#!/bin/bash
# TEST ONLY — runs the Player Development tests offline on synthetic data. No real data, no database, no network
# beyond loading the Firebase SDK and fonts. Needs python3 and Google Chrome (headless).
#   _tests/player-dev/run.sh [base ref, default origin/main]
set -euo pipefail
cd "$(dirname "$0")"
BASE=${1:-origin/main}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
python3 make_fixture.py ../../index.html fixture.json
git -C ../.. show "$BASE:index.html" > main_index.html
python3 build_offline.py main_index.html tracker_main.html
python3 build_offline.py ../../index.html tracker_branch.html
rm -rf results chrome_profile; mkdir -p results
python3 serve.py & SRV=$!
trap 'kill $SRV 2>/dev/null || true; kill $CP 2>/dev/null || true' EXIT
sleep 1
"$CHROME" --headless=new --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions --window-size=1400,1000 http://127.0.0.1:8769/dev_tests.html >/dev/null 2>&1 & CP=$!
for i in $(seq 1 150); do sleep 2; [ -f results/dev_tests.json ] && break; done
sleep 1
python3 - <<'PY'
import json, sys
try: d = json.load(open('results/dev_tests.json'))
except Exception: print('NO RESULT (timed out)'); sys.exit(1)
if d.get('err'): print('HARNESS ERROR', d['err'][:2000])
for r in d.get('results', []): print(('  OK   ' if r['ok'] else '  FAIL ') + r['name'] + ('' if r['ok'] else '  ' + json.dumps(r['info'])[:600]))
print(f"pass {d.get('pass')}  fail {d.get('fail')}")
sys.exit(0 if d.get('fail') == 0 and not d.get('err') else 1)
PY

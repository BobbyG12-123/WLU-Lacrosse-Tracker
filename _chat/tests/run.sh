#!/bin/bash
# TEST ONLY: Ask the Tracker checks. Offline, synthetic fixture, in-memory database, headless Chrome. Nothing leaves this machine.
#   _chat/tests/run.sh [base ref, default origin/main]
# The real gateway code runs inside the page against a fake model. A scripted model proves the plumbing, not the model's judgment:
# for that, see run_live.sh.
set -euo pipefail
cd "$(dirname "$0")"
BASE=${1:-origin/main}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
for f in build_offline.py guard_offline.js fake_firestore.js make_fixture.py analytics_snapshot.js; do cp ../../_tests/phase0/$f .; done
cp ../gateway/worker.js worker.js
python3 make_fixture.py ../../index.html fixture.json
git -C ../.. show "$BASE:index.html" > main_index.html
python3 build_offline.py main_index.html tracker_main.html
python3 build_offline.py ../../index.html tracker_branch.html
rm -rf results chrome_profile; mkdir -p results
python3 serve_chat.py & SRV=$!
trap 'kill $SRV 2>/dev/null || true; kill ${CP:-0} 2>/dev/null || true' EXIT
sleep 1
URL="http://127.0.0.1:8771/chat_tests.html"; OUT=results/chat_tests.json
"$CHROME" --headless=new --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions --window-size=1400,1000 "$URL" >/dev/null 2>&1 & CP=$!
for i in $(seq 1 200); do sleep 2; [ -f "$OUT" ] && break; done
sleep 1
python3 - "$OUT" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: print('NO RESULT (timed out)'); sys.exit(1)
if d.get('err'): print('HARNESS ERROR', d['err'][:3000])
for r in d.get('results', []): print(('  OK   ' if r['ok'] else '  FAIL ') + r['name'] + ('' if r['ok'] else '  ' + json.dumps(r['info'])[:900]))
print(f"pass {d.get('pass')}  fail {d.get('fail')}")
sys.exit(0 if d.get('fail') == 0 and not d.get('err') else 1)
PY

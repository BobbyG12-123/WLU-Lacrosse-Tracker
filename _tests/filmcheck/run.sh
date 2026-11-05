#!/bin/bash
# TEST ONLY: Film Check regression. A shot logged from a clip must not be linked to another clip.
#   _tests/filmcheck/run.sh [base ref, default origin/main]
# This branch's index.html and the base run offline on an in-memory database with synthetic data (Phase 0's tooling).
# The base is expected to show the bug; the check fails if it doesn't, so the test can't pass by testing nothing.
# Needs python3 and Google Chrome (headless). Exit code 0 only if every check passes.
set -euo pipefail
cd "$(dirname "$0")"
BASE=${1:-origin/main}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
for f in build_offline.py guard_offline.js fake_firestore.js make_fixture.py serve.py; do cp ../phase0/$f .; done
python3 make_fixture.py ../../index.html fixture.json
git -C ../.. show "$BASE:index.html" > main_index.html
python3 build_offline.py main_index.html tracker_main.html
python3 build_offline.py ../../index.html tracker_branch.html
OUT=results/filmcheck_tests.json
rm -rf results chrome_profile; mkdir -p results
python3 serve.py & SRV=$!
trap 'kill $SRV 2>/dev/null || true; kill ${CP:-0} 2>/dev/null || true' EXIT
sleep 1
"$CHROME" --headless=new --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions --window-size=1400,1000 "http://127.0.0.1:8770/filmcheck_tests.html" >/dev/null 2>&1 & CP=$!
for i in $(seq 1 100); do sleep 2; [ -f "$OUT" ] && break; done
sleep 1
python3 - "$OUT" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: print('NO RESULT (timed out)'); sys.exit(1)
if d.get('err'): print('HARNESS ERROR', d['err'][:2000])
for r in d.get('results', []): print(('  OK   ' if r['ok'] else '  FAIL ') + r['name'] + ('' if r['ok'] else '  ' + json.dumps(r['info'])[:700]))
print(f"pass {d.get('pass')}  fail {d.get('fail')}")
sys.exit(0 if d.get('fail') == 0 and not d.get('err') else 1)
PY

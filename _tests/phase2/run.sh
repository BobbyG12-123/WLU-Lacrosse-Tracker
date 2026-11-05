#!/bin/bash
# TEST ONLY — Phase 2 What If checks: this branch's index.html vs a base ref, both offline on an in-memory database.
#   _tests/phase2/run.sh [base ref, default origin/main]                  synthetic fixture (Phase 0's committed generator)
#   REAL_EXPORT=/path/to/export.json _tests/phase2/run.sh [base ref]       a local Export All Data file (copied in, deleted after)
# Reuses the Phase 0 offline tooling (build_offline.py, guard_offline.js, fake_firestore.js, make_fixture.py, serve.py).
# Needs python3 and Google Chrome (headless). Exit code 0 only if every check passes.
set -euo pipefail
cd "$(dirname "$0")"
BASE=${1:-origin/main}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
for f in build_offline.py guard_offline.js fake_firestore.js make_fixture.py serve.py analytics_snapshot.js; do cp ../phase0/$f .; done
cp ../BUILD_LABEL.txt .   # the one pinned build label; update it when the label changes
python3 make_fixture.py ../../index.html fixture.json
git -C ../.. show "$BASE:index.html" > main_index.html
python3 build_offline.py main_index.html tracker_main.html
python3 build_offline.py ../../index.html tracker_branch.html
URL="http://127.0.0.1:8770/phase2_tests.html"; OUT=results/phase2_tests.json
if [ -n "${REAL_EXPORT:-}" ]; then cp "$REAL_EXPORT" real_export.json; URL="$URL?export=real_export.json&real=1"; OUT=results/phase2_real.json; fi
rm -rf results chrome_profile; mkdir -p results
python3 serve.py & SRV=$!
trap 'kill $SRV 2>/dev/null || true; kill ${CP:-0} 2>/dev/null || true; rm -f real_export.json' EXIT
sleep 1
"$CHROME" --headless=new --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions --window-size=1400,1000 "$URL" >/dev/null 2>&1 & CP=$!
for i in $(seq 1 200); do sleep 2; [ -f "$OUT" ] && break; done
sleep 1
python3 - "$OUT" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: print('NO RESULT (timed out)'); sys.exit(1)
if d.get('err'): print('HARNESS ERROR', d['err'][:2000])
for r in d.get('results', []): print(('  OK   ' if r['ok'] else '  FAIL ') + r['name'] + ('' if r['ok'] else '  ' + json.dumps(r['info'])[:700]))
if d.get('summary'): print('SUMMARY', json.dumps(d['summary']))
print(f"pass {d.get('pass')}  fail {d.get('fail')}")
sys.exit(0 if d.get('fail') == 0 and not d.get('err') else 1)
PY

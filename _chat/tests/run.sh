#!/bin/bash
# TEST ONLY: Ask the Tracker checks. Offline, synthetic fixture, in-memory database, headless Chrome. Nothing leaves this machine.
#   _chat/tests/run.sh [base ref, default origin/main]
# The real gateway code runs inside the page against a scripted model. That proves the plumbing, not the model's judgment:
# for that, see run_compare.sh. Exit code 0 only if every check passes. The full result stays in results/<run>/.
set -euo pipefail
cd "$(dirname "$0")"
BASE=${1:-origin/main}
source ./lib_run.sh
trap stop_ours EXIT
for f in build_offline.py guard_offline.js fake_firestore.js make_fixture.py analytics_snapshot.js; do cp ../../_tests/phase0/$f .; done
cp ../gateway/worker.js worker.js
python3 make_fixture.py ../../index.html fixture.json
git -C ../.. show "$BASE:index.html" > main_index.html
python3 build_offline.py main_index.html tracker_main.html
python3 build_offline.py ../../index.html tracker_branch.html
start_server
start_chrome chat_tests.html
wait_for "$RUN_DIR/chat_tests.json" 500
python3 - "$RUN_DIR/chat_tests.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
if d.get('err'): print('HARNESS ERROR', d['err'])
for r in d.get('results', []): print(('  OK   ' if r['ok'] else '  FAIL ') + r['name'] + ('' if r['ok'] else '  ' + json.dumps(r['info'])))
print(f"pass {d.get('pass')}  fail {d.get('fail')}")
sys.exit(0 if d.get('fail') == 0 and not d.get('err') else 1)
PY

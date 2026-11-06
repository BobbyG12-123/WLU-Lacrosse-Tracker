#!/bin/bash
# TEST ONLY, and it costs money: the evaluation conversations against the REAL model, on the synthetic fixture only.
# Your key stays in this shell and the local proxy (serve_chat.py). Real records are never loaded.
#   ANTHROPIC_API_KEY=... _chat/tests/run_live.sh     (about 30 model calls; a few dollars at most at Opus prices)
set -euo pipefail
cd "$(dirname "$0")"
[ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "ANTHROPIC_API_KEY isn't set."; exit 2; }
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
for f in build_offline.py guard_offline.js fake_firestore.js make_fixture.py; do cp ../../_tests/phase0/$f .; done
cp ../gateway/worker.js worker.js; cp ../eval/conversations.json conversations.json
python3 make_fixture.py ../../index.html fixture.json
python3 build_offline.py ../../index.html tracker_branch.html
rm -rf results chrome_profile; mkdir -p results
python3 serve_chat.py & SRV=$!
trap 'kill $SRV 2>/dev/null || true; kill ${CP:-0} 2>/dev/null || true' EXIT
sleep 1
"$CHROME" --headless=new --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions --window-size=1400,1000 "http://127.0.0.1:8771/live_eval.html" >/dev/null 2>&1 & CP=$!
OUT=results/live_eval.json
for i in $(seq 1 450); do sleep 2; [ -f "$OUT" ] && break; done
sleep 1
python3 - "$OUT" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: print('NO RESULT (timed out)'); sys.exit(1)
if d.get('err'): print('HARNESS ERROR', d['err'][:3000])
for c in d.get('conversations', []):
    for t in c['turns']:
        print(('  OK   ' if not t['problems'] else '  LOOK ') + c['id'] + ': ' + t['q'][:60] + ('' if not t['problems'] else '  -> ' + '; '.join(t['problems'])[:300]))
u = d.get('usage', {}); print(f"model calls {u.get('calls')}  input {u.get('input')}  cached {u.get('cache_read')}  cache write {u.get('cache_write')}  output {u.get('output')}  estimated ${u.get('cost')}")
print('Read every answer in _chat/tests/results/live_eval.json: these checks only catch clear failures.')
sys.exit(1 if d.get('err') else 0)
PY

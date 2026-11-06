#!/bin/bash
# Compares models on the synthetic conversations, for real money. Run it in your own Terminal.
#   _chat/tests/run_compare.sh
# It asks for the key without showing it. The key stays in this shell and the local server, and no real record is ever loaded.
# The local server reserves each call's worst-case cost on disk before forwarding it, across every run, and stops at the allowance:
#   ledger:   ~/Desktop/Lacrosse_Code/plans/chat_eval_ledger.json   (keep it; deleting it would lose track of spending)
#   evidence: ~/Desktop/Lacrosse_Code/plans/chat_eval_runs/<run>/   (one folder per run, never overwritten)
# No-cost dry run of this whole flow against a fake provider: see test_compare_flow.py.
set -uo pipefail
cd "$(dirname "$0")" || exit 2
source ./lib_run.sh
CAP_USD=${CAP_USD:-2}
if [ -n "${TEST_UPSTREAM:-}" ]; then
  [ -n "${TEST_LEDGER:-}" ] || { echo "A dry run needs TEST_LEDGER."; exit 2; }
  LEDGER="$TEST_LEDGER"; UP=(--test-upstream "$TEST_UPSTREAM")
else
  PLANS="$HOME/Desktop/Lacrosse_Code/plans"; LEDGER="$PLANS/chat_eval_ledger.json"; UP=()
  [ -d "$PLANS" ] || { echo "Can't find $PLANS"; exit 2; }
  RUN_DIR="$PLANS/chat_eval_runs/$RUN_ID"
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then read -r -s -p "Anthropic API key (hidden): " ANTHROPIC_API_KEY; echo; fi
  [ -n "$ANTHROPIC_API_KEY" ] || { echo "No key given."; exit 2; }
  export ANTHROPIC_API_KEY
fi
trap stop_ours EXIT
for f in build_offline.py guard_offline.js fake_firestore.js make_fixture.py; do cp ../../_tests/phase0/$f . || exit 2; done
cp ../gateway/worker.js worker.js || exit 2
cp ../eval/conversations.json conversations.json || exit 2
python3 make_fixture.py ../../index.html fixture.json || exit 2
python3 build_offline.py ../../index.html tracker_branch.html || exit 2
start_server --ledger "$LEDGER" --cap-usd "$CAP_USD" "${UP[@]+"${UP[@]}"}" || exit $?
unset ANTHROPIC_API_KEY   # only the server needs it from here
start_chrome "live_eval.html?run=$RUN_ID"
echo "Running. This takes several minutes. Allowance: \$$CAP_USD across all comparison runs."
# The first save comes after the first conversation; the final one after the last.
wait_for "$RUN_DIR/comparison.json" 1800; wait_code=$?
[ "$wait_code" -eq 0 ] || { echo "No results were saved (code $wait_code). See $RUN_DIR"; exit "$wait_code"; }
python3 - "$RUN_DIR/comparison.json" "$RUN_DIR/summary.txt" "$CHROME_PID" <<'PY'
import json, os, sys, time
path, out, chrome = sys.argv[1], sys.argv[2], int(sys.argv[3])
def alive():
    try: os.kill(chrome, 0); return True
    except OSError: return False
d = {}
for _ in range(900):   # up to 30 more minutes for the run to finish writing
    d = json.load(open(path))
    if d.get('err') or d.get('configs') or not alive(): break
    time.sleep(2)
L = []
if d.get('err'): L.append('HARNESS ERROR ' + d['err'])
if not d.get('configs'): L.append(f"NO FINAL RESULT: the run did not finish. {len(d.get('conversations') or [])} conversations were saved before it stopped.")
L.append(f"Conversations compared: {d.get('conversations_compared')} of {d.get('conversations_total')}")
if d.get('configs') and not d.get('complete'):
    L.append('INCOMPLETE' + (' because the test allowance was reached.' if d.get('stopped_by_allowance') else '.') + ' Every setup below is scored on the same finished conversations only. Not compared: ' + ', '.join(d.get('not_compared') or []))
for c in d.get('configs', []):
    L.append(f"\n{c['model']} effort={c['effort']}: {c['clean']}/{c['turns']} turns with no flag, {c['failed']} failed, median {c['median_s']}s, slowest {c['max_s']}s, about ${c['usd_estimated_from_usage']}, {c['tokens']['calls']} calls, tokens {c['tokens']}")
    L += ['   LOOK ' + x for x in c['problems']]
led = d.get('ledger') or {}
L.append(f"\nLedger: ${led.get('spent_usd')} spent of ${led.get('cap_usd')} this month ({led.get('calls')} calls, {led.get('refused')} refused, {led.get('never_settled')} never settled)")
L.append(f"Before launch, set in wrangler.toml so testing counts toward the monthly total: PRIOR_SPEND_JSON = '{led.get('prior_spend_json')}'")
L.append(f"No database writes during the run: {d.get('no_database_writes')}")
L.append('Automatic flags only catch clear failures: a person still reads the answers in comparison.json.')
text = '\n'.join(L); print(text); open(out, 'w').write(text + '\n')
sys.exit(1 if d.get('err') or not d.get('configs') else 0)
PY

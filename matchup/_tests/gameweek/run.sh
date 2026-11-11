#!/bin/bash
# TEST ONLY: game-week page in a host with the real Firebase compat SDK offline and the real host functions from
# index.html. Synthetic data. Needs deno, python3, Google Chrome. Ports: server 8779, DevTools 9338 (SPORT / DPORT).
set -euo pipefail
cd "$(dirname "$0")"
SPORT=${SPORT:-8779}; DPORT=${DPORT:-9338}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
rm -rf results chrome_profile; mkdir -p results
python3 serve.py "$SPORT" & SRV=$!
"$CHROME" --headless=new --remote-debugging-port="$DPORT" --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions about:blank >/dev/null 2>&1 & CP=$!
trap 'kill $SRV $CP 2>/dev/null || true; sleep 1; rm -rf chrome_profile' EXIT
sleep 3
deno run --allow-net=127.0.0.1 --allow-write=results check.js "$DPORT" "$SPORT" results

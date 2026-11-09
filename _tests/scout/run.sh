#!/bin/bash
# TEST ONLY: pick tagger on the Scouting page. Real Firebase compat SDK, offline, synthetic data, fake sign-in. Needs deno, python3, Google Chrome.
# Ports: server 8774, DevTools 9335 (override with SPORT / DPORT). Exit code 0 only if every check passes.
set -euo pipefail
cd "$(dirname "$0")"
SPORT=${SPORT:-8774}; DPORT=${DPORT:-9335}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
rm -rf results chrome_profile; mkdir -p results
python3 serve.py "$SPORT" & SRV=$!
"$CHROME" --headless=new --remote-debugging-port="$DPORT" --user-data-dir="$PWD/chrome_profile" --no-first-run --disable-extensions --autoplay-policy=no-user-gesture-required about:blank >/dev/null 2>&1 & CP=$!
trap 'kill $SRV $CP 2>/dev/null || true; sleep 1; rm -rf chrome_profile' EXIT
sleep 3
deno run --allow-net=127.0.0.1 --allow-write=results check.js "$DPORT" "$SPORT" results

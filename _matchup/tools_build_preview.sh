#!/bin/bash
# Builds a local, offline preview: the tracker on an in-memory copy of a backup, with the Simulation screen on. Nothing here can write to the live database.
#   tools_build_preview.sh <export.json> <inputs.json> <official_raw dir> <out dir>
set -euo pipefail
EXP=$1; INP=$2; RAW=$3; OUT=$4
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(dirname "$HERE")"; COMMIT=$(git -C "$ROOT" rev-parse HEAD); [ -n "$(git -C "$ROOT" status --porcelain -- _matchup index.html)" ] && COMMIT="$COMMIT (uncommitted changes)"
rm -rf "$OUT"; mkdir -p "$OUT/_matchup"
cp "$ROOT"/_tests/phase0/{build_offline.py,guard_offline.js,fake_firestore.js,serve.py} "$OUT/"
( cd "$OUT"; python3 build_offline.py "$ROOT/index.html" tracker_preview.html >/dev/null; rm build_offline.py
  python3 - <<'PY'
import re
p='tracker_preview.html'; s=open(p,encoding='utf-8').read()
assert s.count("worker-src 'none'; frame-src 'none'")==1
s=s.replace("worker-src 'none'; frame-src 'none'","worker-src 'self'; frame-src 'self'"); open(p,'w',encoding='utf-8').write(s)
PY
)
cp "$HERE/preview_host.html" "$OUT/preview.html"; cp "$EXP" "$OUT/export.json"
for f in rules.js constants.js engine.js results.js estimate.js adapter.js official.js validate.js validate_v2.js replay.js studio.js studio.html worker.js; do cp "$HERE/$f" "$OUT/_matchup/"; done
deno run --check=none --allow-read --allow-write="$OUT" "$HERE/tools_preview_data.js" "$INP" "$RAW" "$OUT/_matchup/local_data.json" "$COMMIT" >/dev/null
cat > "$OUT/Open Simulation Preview.command" <<'CMD'
#!/bin/bash
# Double-click to open the preview in Chrome. Close this window to stop it.
cd "$(dirname "$0")"
python3 serve.py & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
open -a "Google Chrome" "http://127.0.0.1:8770/preview.html"
echo "Preview running at http://127.0.0.1:8770/preview.html. Close this window to stop it."
wait $SRV
CMD
chmod +x "$OUT/Open Simulation Preview.command"
echo "built $OUT at $COMMIT"

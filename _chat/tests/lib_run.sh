# TEST ONLY: shared by run.sh and run_compare.sh. Starts one server and one Chrome for this run, and stops only those two.
# Each run gets its own folder under results/; nothing from an earlier run is touched.
PORT=${PORT:-8771}
RUN_ID="run$(date +%Y%m%d%H%M%S)$$"
RUN_DIR="$PWD/results/$RUN_ID"
SRV_PID=""; CHROME_PID=""
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}

stop_ours() {
  # Only the process IDs this run recorded. Never by name.
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null || true
  [ -d "$RUN_DIR/chrome_profile" ] && rm -rf "$RUN_DIR/chrome_profile" || true
}

start_server() {   # extra arguments go to serve_chat.py
  mkdir -p "$RUN_DIR"
  if python3 -c "import socket,sys; s=socket.socket(); r=s.connect_ex(('127.0.0.1',$PORT)); sys.exit(0 if r==0 else 1)"; then
    echo "REFUSED: port $PORT is already in use. Nothing was stopped. Free it or set PORT=<other>." >&2; return 3
  fi
  python3 serve_chat.py --port "$PORT" --run-id "$RUN_ID" --results-dir "$RUN_DIR" "$@" > "$RUN_DIR/server.log" 2>&1 &
  SRV_PID=$!
  local who=""
  for _ in $(seq 1 25); do
    sleep 0.2
    kill -0 "$SRV_PID" 2>/dev/null || { echo "The server exited early. See $RUN_DIR/server.log" >&2; SRV_PID=""; return 4; }
    who=$(python3 -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:$PORT/__whoami', timeout=1).read().decode())" 2>/dev/null) && break
  done
  python3 -c "import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d=={'run_id':'$RUN_ID','pid':$SRV_PID} else 1)" "$who" 2>/dev/null || { echo "REFUSED: the server on port $PORT isn't the one this run started ($who)." >&2; return 5; }
  echo "Server for $RUN_ID verified, pid $SRV_PID, port $PORT. Evidence goes to $RUN_DIR"
}

start_chrome() {   # $1 = page and query
  "$CHROME" --headless=new --user-data-dir="$RUN_DIR/chrome_profile" --no-first-run --disable-extensions --window-size=1400,1000 "http://127.0.0.1:$PORT/$1" > "$RUN_DIR/chrome.log" 2>&1 &
  CHROME_PID=$!
}

wait_for() {   # $1 = file, $2 = seconds. Stops early if Chrome or the server dies.
  local waited=0
  while [ "$waited" -lt "$2" ]; do
    [ -f "$1" ] && { sleep 1; return 0; }
    kill -0 "$SRV_PID" 2>/dev/null || { echo "The server died during the run. See $RUN_DIR/server.log" >&2; return 6; }
    kill -0 "$CHROME_PID" 2>/dev/null || { echo "Chrome exited before finishing. See $RUN_DIR/chrome.log" >&2; return 7; }
    sleep 2; waited=$((waited + 2))
  done
  echo "Timed out after $2 seconds waiting for $1" >&2; return 8
}

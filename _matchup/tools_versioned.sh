#!/bin/bash
# Runs a matchup tool with the code commit stamped into its records. Refuses if the engine files have uncommitted changes.
#   tools_versioned.sh tools_validate.js <args>
set -euo pipefail
cd "$(dirname "$0")"
if [ -n "$(git status --porcelain -- .)" ]; then echo "Refusing: _matchup has uncommitted changes."; git status --short -- .; exit 2; fi
export MS_COMMIT; MS_COMMIT=$(git rev-parse HEAD)
OUT=${MS_OUT:?set MS_OUT to the local output folder}
deno run --check=none --allow-read --allow-env=MS_COMMIT --allow-write="$OUT" "$@"

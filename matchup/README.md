# W&L Matchup Studio engine (foundation, not connected to the tracker)

Nothing here loads in the tracker page. This folder starts with `_`, so GitHub Pages doesn't publish it. **Experimental: results are conditional on their inputs and aren't validated against games.**

| File | Job |
|---|---|
| `rules.js` | Versioned NCAA rules and the rule registry |
| `constants.js` | Every setting, classified; planner constants audit |
| `adapter.js` | Read-only: tracker export to counted evidence |
| `estimate.js` | Evidence to parameters, with an input table |
| `engine.js` | One game from parameters and a seed: the canonical event ledger, box score and validator |
| `results.js` | Batches, workers, aggregates, paired comparison |
| `worker.js` | Browser worker for one chunk |
| `replay.js` | Replay (v1/v2; tests only since the old screen was retired) |
| `gameweek.html`, `gameweek.js`, `v3/` | The Simulation page: engine v3 game-week sheet and Lineups (`v3/lineups.js`, `v3/lineups_view.js`) |
| `docs/MODEL_SCOPE.md`, `docs/ACCOUNTING_RECORD.md`, `docs/PACE_CHECK.md`, `docs/REPLAY_MOVEMENT.md` | What's frozen, the bug record, the pace check, how the replay moves |
| `explain.js` | Reasons: wins vs losses accounting, player reasons, lineup efficiency |
| `tools_fit_reference.js` | Fits tempo and related settings to official team totals. A fit, not a validation |
| `tools_run_matchup.js` | Runs a matchup from local files and writes a report |
| `official.js`, `tools_official.js` | Reads official school stat pages into dated games |
| `validate.js`, `tools_validate.js`, `tools_tune.js` | Pre-game validation under `docs/VALIDATION_PROTOCOL.md` |
| `tools_versioned.sh` | Runs a tool stamped with the code commit |

## Run

- Tests (synthetic only): `tests/run.sh`. Needs deno, python3, Chrome.
- A matchup (local files only, read-only on the tracker side):
  `deno run --check=none --allow-read --allow-write=<out> tools_run_matchup.js <export.json> <index.html> <inputs.json> <out> [games] [seed]`

**Never commit an export, a real input file or a report: this repository is public.** Keep them outside the repository.

## Opponent imports

Opponent numbers are a plain totals object with `source`, set as `opponent.officialImport` in the inputs file: `shots, sog, goals, turnovers, caused, assists, clears, clearAtt, penalties, saves, goalsAllowed`, where `caused` is this team's turnovers caused by its opponents and `saves` and `goalsAllowed` are this team's goalies. Optional: `causedByTeam, opponentTurnovers`. No provider is built in. An opponent with no logged sessions is refused. Opponents stay team level; no player ratings are invented.

## Versioned runs

Use `tools_versioned.sh`. It refuses to run if `matchup/` has uncommitted changes, and it stamps the commit into every run record, alongside model and rules versions, input snapshot hash, seed and completed games.

## The Simulation page

`gameweek.html` is the Simulation page (Personnel → Simulation, staff only, never in player mode). It reads tracker data through the host's `msStudioData` / `msLrData` and writes nothing. The older v1/v2 screen (`studio.html`, `studio.js`) and its offline preview tool were retired on Nov 18, 2026; the v1/v2 engine files stay, frozen, with their tests.

## Not built yet

An automated lineup search (on purpose), and a forward-in-time validation, which needs later games.

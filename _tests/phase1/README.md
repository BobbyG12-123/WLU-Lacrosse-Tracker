# Phase 1 scoring-change checks (offline)

`./run.sh [base ref]` (default `origin/main`) builds this branch's `index.html` and the base offline, loads both into an
in-memory database, and checks the new Shooting Trends panel **Scoring Change: What Moved**. It reuses the Phase 0 tooling
(`../phase0`: offline build with a strict CSP and network guard, in-memory Firestore, synthetic fixture generator), copied
in for the run and git-ignored. Exit code 0 only if every check passes.

- **Synthetic (default):** Phase 0's deterministic fixture ("Synth Player" names).
- **Real, locally:** `REAL_EXPORT=/path/to/Export-All-Data.json ./run.sh` copies the file in as `real_export.json` for the
  run and deletes it afterwards. Never commit an export: this repository is public.

What is checked:
- Unchanged vs the base: the analytics snapshot, the Efficiency zone map SVG (the zone shapes moved into a shared
  function), and Shooting Trends in four window/session settings.
- The default selection (Practice, last 5 sessions with shots vs the 5 before, Team, 5 field groups) against an
  independent count straight from the export: sessions, shots, goals, and per-group shots and goals.
- Reconciliation in every comparison (each session type × 3/5/10 × team and every player; 5 groups and 13 zones):
  volume + mix + conversion (or volume + rate) + no-location = total; per-100 parts = per-100 change; per-location rows
  add up.
- Invariants: equal periods give exactly zero; swapping periods flips every sign; per 100 holds volume fixed; a
  hand-checked mix example.
- Unsupported attribution: a location with shots in one period only, fewer than 10 located shots, a period with no
  located shots. Each says why and nothing is forced.
- Missing location stays in the totals on its own line. Session types never mix. Too-few-sessions note. The top bar
  seeds the type. Player view (team sessions, 13 zones team-only). Player View names only him. Page text: totals,
  per 100, maps on one scale, samples, missing data, records = shots counted, separate in-sample xG view.
- Safety: no page errors, no network, no writes.

This folder starts with `_`, so GitHub Pages doesn't publish it.

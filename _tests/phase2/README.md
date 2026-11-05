# Phase 2 What If checks (offline)

`./run.sh [base ref]` (default `origin/main`) builds this branch's `index.html` and the base offline, loads both into an
in-memory database, and checks the What If block under Scoring Change. It reuses Phase 0's tooling (`../phase0`), copied in
for the run and git-ignored. Exit code 0 only if every check passes.

- **Synthetic (default):** Phase 0's deterministic fixture ("Synth Player" names).
- **Real, locally:** `REAL_EXPORT=/path/to/Export-All-Data.json ./run.sh` copies the file in for the run and deletes it
  afterwards. Never commit an export: this repository is public. A real run also prints a `SUMMARY` with placebo
  diagnostics. Those use random splits of the same practices. They're a sanity check on the arithmetic, not a validation
  of the ranges, and they don't decide pass or fail.

What is checked:
- Unchanged against the base: the analytics snapshot, and Scoring Change's own HTML apart from the added block.
- Earlier conversion, earlier mix and player vs teammates against an independent calculation straight from the export.
- Invariants: an unchanged scenario gives exactly zero, attempts stay fixed, moved shots can't exceed what a location has,
  and one moved shot changes goals by exactly the benchmark rate gap.
- Every session type × 3/5/10 × team and every player × groups/zones: a finite number with its range around it, or no
  number and a reason. The new-run range is never narrower.
- Wording: historical, not a forecast, not evidence of cause; ranges provisional and not validated; no 95% or confidence
  claim; the average range kept apart from variation in actual goals; "Can't distinguish from no change"; why the numbers
  differ from Scoring Change.
- No number under 10 located shots, with too few benchmark shots, above the observed-share support check, or when no
  30+-shot player exists. No range under 6 sessions. No individual earlier-conversion estimate.
- A longer comparison changes nothing until it's chosen, shows its dates, and can be undone.
- Records, session-type separation, Fall/Spring, Player View masking. No page errors, no network, no writes.

This folder starts with `_`, so GitHub Pages doesn't publish it.

# Possession scenario checks (offline)

`./run.sh [base ref]` (default `origin/main`) builds this branch's `index.html` and the base offline, loads both into an
in-memory database, and checks the possession scenarios under Scoring Change. It reuses Phase 0's tooling (`../phase0`), copied
in for the run and git-ignored. Exit code 0 only if every check passes.

- **Synthetic (default):** Phase 0's deterministic fixture.
- **Real, locally:** `REAL_EXPORT=/path/to/Export-All-Data.json ./run.sh` copies the file in for the run and deletes it
  afterwards. Never commit an export: this repository is public. A real run also prints a `SUMMARY` of diagnostics, including a
  leave-one-session-out backtest. They don't decide pass or fail, and they aren't validation of a scenario.

Checked: nothing released changed, including Efficiency's possession code; the count of logged possessions and goals; how later shots count; actual and benchmark-estimated goals kept apart; assumptions beside the result; what the ranges leave out; the pinned build label; which sessions are used; an unchanged scenario gives
exactly 0; possessions always balance; hand calculations; an avoided turnover needs a stated replacement; turnover and mix
changes are checked together; missing evidence gives no number; seeded, paired illustration; wording; staff only; no writes,
no page errors, no network.

This folder starts with `_`, so GitHub Pages doesn't publish it.

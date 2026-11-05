# Modeled What If checks (offline)

`./run.sh [base ref]` (default `origin/main`) builds this branch's `index.html` and the base offline, loads both into an
in-memory database, and checks the modeled block under Scoring Change. It reuses Phase 0's tooling (`../phase0`), copied in
for the run and git-ignored. Exit code 0 only if every check passes.

- **Synthetic (default):** Phase 0's deterministic fixture ("Synth Player" names).
- **Real, locally:** `REAL_EXPORT=/path/to/Export-All-Data.json ./run.sh` copies the file in for the run and deletes it
  afterwards. Never commit an export: this repository is public. A real run also prints a `SUMMARY` of diagnostics. They use
  this season's data, so they're a sanity check rather than a validation, and they don't decide pass or fail.

What is checked:
- Unchanged against the base: analytics, Scoring Change and the historical block. The model isn't fit until it's opened.
- Audit: each fold leaves out a whole session, held-out predictions come from that fold, WLU shots only. Real run: matches
  the figures published in #107.
- Hand checks: change = shots x average change per eligible shot; twice the shots gives twice the change; a location move
  averages over logged spots there; unchanged gives no change; attempts stay fixed.
- No number when: the model fails, too few subject shots, too few held-out shots of the session type, a thin or missed from
  or to situation (checked alone, so a rare one can't hide in a group), a missed gap between them, or a share above the
  observed-share check. Every selection gives a finite number with ranges, or no number and a reason.
- Resulting shots: a targeted case where both categories are common but the combination is absent gives no estimate and
  lists it; partial support caps the shots and averages only supported ones; a held-fixed field not logged is excluded.
- The range: the discrepancy part is the larger of the observed miss and chance, and never moves the estimate. Later-session
  disagreement and the Low/GLE caution sit beside the result, without treating a counted gap as the true effect.
- Wording, separation from counted results, screen weakness, records, staff-only. No page errors, no network, no writes.

This folder starts with `_`, so GitHub Pages doesn't publish it.

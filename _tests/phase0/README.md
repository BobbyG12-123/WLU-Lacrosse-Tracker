# Phase 0 correction checks (offline)

`./run.sh [base ref]` (default `origin/main`) checks this branch's `index.html` against the base, both built offline
(`build_offline.py`: dummy Firebase config, strict CSP, `guard_offline.js` first, so nothing can connect anywhere) and
loaded into an in-memory database (`fake_firestore.js`). It prints every check; the exit code is 0 only if all pass.

- **Default: synthetic data.** `make_fixture.py` writes a deterministic, fully synthetic export ("Synth Player" names).
  It mirrors what the audit found: a 9/25 scrimmage logged with no opponent (40 shots), a practice on the same day,
  opponent scrimmages with their shots, lineups with one-possession samples, shots with no man situation, a pick with no coverage.
- **Real data, locally:** `REAL_EXPORT=/path/to/Export-All-Data.json ./run.sh` uses that file (copied in as
  `real_export.json` for the run, deleted afterwards, git-ignored) and adds the checks tied to the Nov 2 audit numbers.
  Never commit an export: this repository is public.

Expected numbers are computed from whichever export is loaded, not hard-coded. What is checked:

- Unchanged: the analytics snapshot (`analytics_snapshot.js`), Efficiency box scores for All / Practice / Game / Scrimmage.
- Session types; the top-bar Sessions control; "Type not recorded" (count, pills, Shot Log list); every 2027 shot in exactly
  one category, before and after the 9/25 correction; the same totals on Offense tiles, Efficiency, Brief, Trigger table,
  Compare and Deep Dive for each category; clicking the top-bar control redraws the panels.
- Ask "last practice", the Trends subtitle and windows, missing-data handling, On/Off qualification, the Brief
  ("Flagged for review"), labels beside the exceptions (Goalie Score, projections, xG2, xG model).
- Log Shot: the scrimmage-type choice and its rules; the intra-squad type record.
- Reports: which session and week pages change, with before/after text; saved model versions and tracking confirmations
  unchanged and still used.
- The prepared correction (`_ops/session_type_correction_0925.js`, copied in for the run): refused on main; one field
  written; exact stored value; entries unchanged; refused when run again; an edit through the tracker's save path (the
  one Film Check uses) keeps the classification.

`view.html?scene=<name>&export=<file>` opens one screen of the offline branch build (serve this folder with `serve.py`
after a run): logger_new, logger_opp, logger_0925, untyped_bar, shotlog_untyped, trends_practice, onoff, brief, manup, after_0925.

This folder starts with `_`, so GitHub Pages doesn't publish it.

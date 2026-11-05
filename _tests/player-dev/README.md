# Player Development checks (offline)

`./run.sh [base ref]` (default `origin/main`) builds this branch's `index.html` and the base offline, loads both into an
in-memory database, and checks Explorer, Clips and Coaching conclusions. It reuses Phase 0's tooling (`../phase0`), copied in
for the run and git-ignored. The clip, evidence and conclusion checks are carried over from draft #107. Exit code 0 only if
every check passes.

- **Synthetic (default):** this folder's deterministic fixture ("Synth Player" names, fake Film Check ids).
- **Real, locally:** `REAL_EXPORT=/path/to/Export-All-Data.json ./run.sh` copies the file in for the run and deletes it
  afterwards. Never commit an export: this repository is public. The real run does the read-only checks only.

What is checked:
- Unchanged against the base: analytics, Reports, Scoring Change with What If, and the source of the What If functions. #107's
  simulator and Player review aren't here, and the What If model isn't fit by opening or linking from this page.
- Session types come from the shared definition and add up to All. The top bar's Sessions and Fall/Spring set the page.
- Clips: confirmed marks only, in that mark's own session; a double claim shows no clip; corrections show without a reload.
- Explorer: hand counts, named benchmark, every attempt once in each breakdown, a dash for nothing to measure.
- What If: opens for the player; a saved estimate is the tool's own number; re-opening recomputes it; no result, no save.
- Conclusions: evidence, edit conflict, later edits, renumbers and deletions, hostile text, backup, writes to `app/devnotes_*`.
- Player View: his attempts only, shared conclusions only, no estimates, no What If link, no teammate names.
- No page errors, no network.

This folder starts with `_`, so GitHub Pages doesn't publish it.

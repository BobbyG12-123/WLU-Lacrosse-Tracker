# Scrimmage Planner regression checks (offline)

`./run.sh [path to index.html]` pulls the planner's simulation functions out of `index.html` and runs them in headless Chrome with synthetic
players. It doesn't boot the tracker or use a database, an export, or the network. Exit code 0 only if every check passes.

Checked:

- **Scorers:** every simulated W&L goal, man-up goals included, has a scorer who is in the plan, so player goals add up to the score.
- **Reproducibility:** the same request gives the same result whatever the worker count, and exactly the games requested.
- **Reporting:** a worker failure reports the games actually completed.
- **Possession types:** `SCRIM_TYPES` ratios come out as goals per possession. This guards correct behavior; no math changed.

This folder starts with `_`, so GitHub Pages doesn't publish it.

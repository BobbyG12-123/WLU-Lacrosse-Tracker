# Engine v3 backtest: protocol (written Nov 16, 2026, before any holdout game was scored)

## Question
Does v3, fed only what was known before each game, give honest win chances and score ranges for D3 games? And do the calibration changes (team shrinkage, parameter draws, game form, pace variance, home field) help or hurt?

## Data
LacrosseReference 2026 team records already on the tracker (the same import the game-week sheet reads), every completed game where both teams have a record. Per game: date, home team, each team's goals, possessions (goals ÷ offensive efficiency, from either side), faceoff win rate, and LacrosseReference's own pre-game home win chance (the benchmark).

## Inputs for each game (no leakage)
Ratings are refit for each game date from **earlier games only**:
- Offense and defense: a two-way fit on the log-odds of goals per possession, each game weighted by its possessions, with a home term and a ridge pull toward average (λ, in possessions).
- Faceoffs: the same two-way fit on faceoff win rate (weight = draws, estimated as total goals + 4).
- Pace: each team's average possessions in earlier games, pulled toward the league average.
- Team shapes (transition, settled, picks) are the D3 average for every team: the backtest is team level. Players, film tags, goalies and pick coverage aren't tested here.
A game is scored only when both teams have 3+ earlier games.

## Split
- **Development:** games before 2026-04-01. Settings are chosen here.
- **Holdout:** games on or after 2026-04-01. Scored once with the settings fixed. No retuning after.

## Settings chosen on development games
- λ (team pull toward average): grid 100, 200, 400, 800, 1600 possessions; pick the lowest log loss.
- Form σ (per-team, per-game shift in log-odds scoring): grid 0, 0.1, 0.15, 0.2, 0.25, 0.3; pick the one whose 80% margin range covers closest to 80% (ties → lower log loss).
- Pace σ: set so the simulated spread of total possessions matches the real spread.
- Home field: fitted inside the ratings (one log-odds term), not a grid.

## Scored on the holdout
1. Brier score and log loss of the win chance, against (a) v3 with no calibration changes and (b) LacrosseReference's pre-game chance on the same games. 90% paired bootstrap interval (2,000 resamples, seed 2026).
2. 80% margin-range coverage (target 75–85%) and the PIT histogram.
3. Calibration: predicted vs actual win rate in 10 bins; slope of actual on predicted margin (target 0.8–1.2).
4. Spread: SD of total goals and of margin, simulated vs real.
Ties (overtime) count as the winner's game; LacrosseReference's records are final scores.

## Limits, stated now
- One season, team level only. Ratings use only earlier games, but the settings come from the same season.
- Season-to-season change (how much a 2026 record should be pulled for 2027) can't be measured from one season. It stays a stated assumption.
- LacrosseReference's pre-game chance may use information we don't have (prior seasons); it's a benchmark, not a target.

## Deviation, recorded before the holdout was scored (Nov 16)
On the first development run both choices landed at the edge of their grids: λ = 100 (the smallest; log loss still falling) and form σ = 0.3 (the largest; coverage 80.0% and log loss still falling). The grids were extended **on development games only**: λ 25, 50, 100 and form σ 0.3, 0.35, 0.4, 0.5, with the same selection rules. The holdout had not been read or scored.

## Second deviation, recorded before the holdout was scored (Nov 16)
The extended run showed the two settings interact: with a smaller λ each team's level is less certain, so the form σ that gave 80% coverage at λ = 100 (0.3) gave 87% at λ = 25, and λ = 25 was again at the grid edge. Pull and form are now chosen **together on development games**: λ 5, 10, 15, 25, 40 × form σ 0, 0.1, 0.15, 0.2, 0.25. Rule: among settings whose 80% margin range covers 75–85% of development games, the lowest log loss. The holdout still had not been read or scored.

## Third note: a data bug found after the first holdout run (Nov 16)
The first holdout run gave 62% coverage and real total-goal errors of 12 goals (SD), against 6 on development games. The cause was in the backtest tool, not a setting: it gave both teams one shared possession count (the average of the two teams' goals ÷ efficiency). LacrosseReference counts possessions per team and the two differ (mean gap ~12), and in one 30-1 game on Apr 22 the average made the winner's scoring rate exceed 100%. That made every rating fit after Apr 22 invalid (296 of 1,031 holdout games were coin flips). Fix: each team is rated on its own possessions; impossible rates are refused. Because this changes the development inputs too, the settings were re-chosen on development games with the same joint rule and the holdout was scored again. **The holdout is therefore not untouched:** its first (buggy) result was seen. No setting was chosen or changed using it.

## Results (Nov 16, after the fix)
**Settings** (development games, joint rule): λ = 5 possessions (the smallest tested; almost no pull, because D3 teams differ a lot: team offense SD ≈ 0.6 on the log-odds scale), form σ = 0 (level uncertainty alone gives the right spread), pace σ = 0.095, home edge 0.044 (scoring) and 0.049 (faceoffs) on the log-odds scale.

**Holdout: 1,030 games on or after Apr 1, 2026** (826 D3, 206 D1; both teams with 3+ earlier games), 1,000 simulations each.

| | v3 before these changes | v3 calibrated | LacrosseReference pre-game |
|---|---|---|---|
| Brier (lower is better) | 0.1059 | **0.1053** | 0.1068 |
| Log loss | 0.3265 | 0.3273 | — |
| 80% margin range covers | 75.0% | **80.0%** | — |
| Margin slope (actual on predicted) | 1.08 | 1.07 | — |
| Simulated vs real total-goal spread (SD) | 4.23 vs 5.02 | **5.10 vs 5.04** | — |
| Simulated vs real margin spread (SD) | 4.71 vs 5.46 | 5.21 vs 5.46 | — |

Paired bootstrap (2,000 resamples, 90%): calibrated − before = −0.0006 (−0.0025 to +0.0013); calibrated − LacrosseReference = −0.0015 (−0.0067 to +0.0037).

**Reading:**
- Win chances: as good as LacrosseReference's own pre-game numbers on these games (no difference either way that the sample can show), using only earlier games from the same season.
- The calibration changes don't move win-chance accuracy; they make the **ranges** honest: 80% ranges now hold 80% of results (was 75%), the PIT histogram is flat (top tenth 11%, was 17%), and the simulated score spread matches real games.
- Underdogs given 10–30% won a little less often than predicted (e.g. 15% predicted, 8% actual, 64 games).
- Team level only. Players, goalies, film shapes and pick coverage are not tested here, and a 2027 game built from 2026 records relies on the stated `priorInfo` assumption.

# Validation protocol v2: revised model on untouched games

Committed before any holdout game was simulated or its outcome read. V1's results stay frozen in `validation_v1_frozen/` as that model's record, and tag `matchup-validation-v1` marks its code.

## What was diagnosed, on development games only
Development games are the 75 v1 test games plus the 53 tune-window games. V1's ranges were narrow mainly because predicted team gaps were too small: actual margin moved 1.9 goals per predicted goal. Simulated game spread (SD 5.0) already exceeded the hindsight residual (SD 4.0), so added game-level randomness isn't the fix and isn't used.

## Model v2, fixed in advance
- Opponent-adjusted team rates: on-goal, finishing, shots vs turnovers, clears, faceoffs. A ridge two-way fit on the logit scale, using only games before each game.
- Team-specific ball control: a team's share of shot-and-turnover events, also two-way, moves its retained-miss chances.
- **Settings:** λ = 15 and β = 4, the best of 12 combinations on development games (closest to 80% coverage with margin slope near 1). The grid is in `dev_grid_exploratory.json`, and those development scores are selected, so they're optimistic. λ = 15 sits at the grid's edge. It isn't being extended, to avoid further tuning.
- **Unchanged:** the tune-window settings and all other constants. No hot-day factor and no variability inflation.
- Fixed before the run. A failure here isn't followed by retuning on these games.

## Holdout
Games dated on or after 2026-03-01 that are in neither the tune window nor the v1 test set. These are games where one school's page wasn't available, so the opponent's history comes only from games against schools with pages.
- **Primary:** both teams have at least 3 earlier games, the same rule as v1. 17 games.
- **Secondary:** both teams have at least 1 earlier game, and at least one has fewer than 3. Harder and different, so it's reported separately.
- Both models get scored on the same games. 2,000 simulations per game, seed 20261107. Ties are out of win-probability scores but kept in coverage.

## Limits, stated now
- The holdout is small. With 17 games a coverage figure carries a wide interval, so a pass can't establish that ranges are right.
- It isn't strictly later in time. V2's settings were picked on games spanning the same weeks. Scored holdout games are also inputs to later games' histories, as they were in v1, but no holdout outcome was scored or compared before this run.
- Only 2027 games would be a truly forward test.
- Team-level only, using season team rates. Nothing here covers player counts, lineups, Division I opponents or practice-based inputs. W&L vs VMI stays excluded.

## Criteria, primary set
1. **H1:** v2 margin 10th-90th coverage between 70% and 90%. An exact 90% interval is reported.
2. **H2:** v2 Brier below v1 Brier, with a 90% paired bootstrap interval (5,000 resamples, seed 2026). "Better" is claimed only if it excludes zero.
3. **H3:** v2 margin slope (actual on predicted) between 0.7 and 1.3. Reported with its standard error.

**Rationale:** H1 is the failure being fixed. H2 guards against wider ranges at the cost of worse predictions. H3 checks the diagnosed cause. If H1 or H3 fails, v2 isn't adopted. If all three are met, v2 becomes the candidate for 2027 forward testing, still labeled experimental.

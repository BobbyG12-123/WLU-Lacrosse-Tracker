# Pace check: are event totals comparable?

Investigation only. **V2 isn't changed.**

## What "total events" means
Shots plus turnovers, both teams, in one game.
- **Official:** shots include blocked shots (manual section 7). Turnovers include team turnovers and failed clears.
- **Simulated:** the same, with turnovers including failed clears, shot-clock violations and fouls with the ball.
- **Comparable?** Totals, yes. Official scorers vary, though: the manual itself calls caused turnovers inconsistently applied, and schools' own pages disagreed on 20 field values, so some observed spread is scoring noise this can't separate.

## The earlier comparison was wrong
I compared spread across different games (12.9) with spread within one simulated matchup (7.1). Those measure different things. Different games have different teams.

## Like-for-like, 138 games with v2 frozen
| Measure | Observed | Simulated |
|---|---|---|
| Mean events per game | 119.7 | 120.6 |
| Spread across games (one simulated game per real game) | 12.4 | 8.2 |
| Shots per game | 81.3 | 78.0 |
| Turnovers per game | 38.4 | 41.4 |
| Faceoffs per game | 28.0 | 27.9 |

Standardized against each game's own simulated range, observed totals had a spread of 1.79, where 1.00 would be a match. Only 56.5% fell within the range that should hold about 80%.

## Reading
- The average is right. The mix leans about 3 toward turnovers and away from shots.
- **The remaining gap is real, though smaller than first reported.** Predicted event totals barely differ between matchups (SD 2.1), because tempo isn't team-specific.
- Scorer differences could explain part of it.

## Effect and next step
This concerns how many events a game has, and it's a candidate for a later model version. Testing that would need a later period. Possessions have no official count, so they can't be checked this way.

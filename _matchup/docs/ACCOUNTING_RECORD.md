# Accounting record: the loose-ball-at-the-horn bug

## What happened
When the horn sounded during a loose ball with a team up a man, the engine treated the loose ball as possession. It restarted the next period with that team holding the ball, carrying a shot clock that had already expired. Rule 4-3-a Exception 1 calls for a faceoff, since no team was in possession. The validator caught it: `invalid shot clock -5`.

## Versions affected
| Engine | Commits | Status |
|---|---|---|
| `matchup-engine-0.1` | through `88d48f4`, including every frozen result | Affected |
| `matchup-engine-0.1` | `21b92f9` | Fixed, version not yet changed |
| `matchup-engine-0.1.1` | after `21b92f9` | Fixed |

## Effect on reported results
- **Observed:** 1 of 252,000 simulations in the holdout run: v1, Roanoke vs Salisbury, game 1,868. It wasn't counted in any reported rate.
- **Denominator check:** that game's recorded win chance, 0.77389, equals 1547 of 1999, so the denominator was 1,999.
- The report's "252,000 completed" counts games that finished. "1 invalid" counts those excluded from results. The two are separate fields.
- **Rerun on the fixed engine, for information only:** all v1 and v2 frozen predictions, 0 invalid games. No win chance moved more than 0.10 points (one game in 1,000). Frozen files aren't rescored.
- V1's first evaluation and earlier W&L vs VMI runs had 0 invalid games.

## Policy: excluded, never retried
- A game failing accounting is excluded from every denominator and counted in the run record. The record's status changes to "problems".
- It isn't retried. A retry with a new seed would swap a failed game for a passing one, which could bias results.
- Any invalid game gets investigated as a possible engine bug.
- Requested, completed, valid and excluded are kept as separate numbers.

Tests cover this: `failed games stay out of denominators and are counted`, and a regression test for this bug.

## Earlier issues found by testing, fixed before any frozen result
A player waiting to serve a penalty could rejoin the lineup. A rewrite of a save comparison briefly broke v1 reproducibility, which a test now locks.

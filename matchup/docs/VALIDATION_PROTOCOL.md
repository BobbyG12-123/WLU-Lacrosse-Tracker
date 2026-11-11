# Validation protocol v1

Written and committed before any model result on these games exists. Results get reported against it whether they pass or fail.

## Question
Using only information available before each game, how well does the engine predict 2026 games between specific Division III opponents, compared with a simple baseline?

## Data
Official 2026 game-by-game tables from each school's stat page. A game seen on both schools' pages must agree; disagreements are listed. Ohio Northern's page refused the request, so games needing its history are out. LacrosseReference data isn't used.

## Separating tuning from testing
- **Tune window:** games before 2026-03-01. Used only for `actionMeanSec`, `clearRequiredShare`, `turnoverGroundBall` and `manUpFinishShift`, from league totals in that window. These replace values fitted earlier on W&L's full 2026 season, which included test games.
- **Test window:** games on or after 2026-03-01 where both teams have their own official page and at least 3 earlier games in the data. Team inputs and league means come only from games dated before that game.
- Test results may not be used to change any setting. A later model change needs new games to test on, with 2027 games the natural choice.
- The three 2027 scrimmages are exploratory. They were already used to choose a calibration, so they aren't an independent test and appear in no accuracy claim.
- W&L vs VMI is excluded from every accuracy claim. VMI is Division I, so this test says nothing direct about Division I vs Division III.

## Model, fixed in advance
Team level. For team A against team B, with 50 prior shots of league rate (`teamPriorWeight`):
- On-goal rate: A's, shrunk to league. No defensive adjustment.
- Goals on shots on goal: A's, shrunk to league, then one logit adjustment for B's save rate, also shrunk with weight 100 (`goalieShrinkShots`).
- Shots vs turnovers: A's, net of failed clears and fouls with the ball, then one logit adjustment for how B's opponents do on that rate, shrunk.
- Clears and penalties: A's own, shrunk.
- Faceoffs: the provisional matchup formula on rates shrunk with weight 20 toward 50%.
- No home-field term, no game-level form effect, and no variability adjustment toward any target.
- 2,000 simulated games per test game, ability uncertainty on, fixed seed.

## Baselines
1. **Coin flip:** 50%.
2. **Goal-differential team rate:** each team's goal difference per game, multiplied by n/(n+3). The prediction is the normal probability of (A − B)/σ, with σ the standard deviation of game margins before that date, for margins in league games.

## Measures
Brier score, log loss (probabilities clamped to 0.001-0.999), accuracy, score and margin mean absolute error, 10th-90th coverage of margin and of each score, and reliability in five bins. All test games get reported, then W&L's games separately. W&L's games are too few to judge alone.

## Criteria, fixed in advance
1. **C1:** Brier below the coin flip's 0.25.
2. **C2:** Brier below the goal-differential baseline, with a 90% paired bootstrap interval (5,000 resamples, seed 2026) on the difference. "Better than baseline" is claimed only if the interval excludes zero. Otherwise: "not shown to be better."
3. **C3:** margin 10th-90th coverage between 70% and 90%.
4. **C4:** calibration slope (logistic regression of result on the logit of the prediction) between 0.7 and 1.3.

**Rationale:** C1 is the minimum for any information. C2 asks whether a full game simulation adds anything over the simplest team-rate method. C3 and C4 check that the stated uncertainty is honest. The ranges are judgment calls for a sample of this size, set before seeing results.

Meeting these would support using the engine for comparable Division III games only, and outputs would stay labeled experimental. Missing any is reported as missing, with no retuning.

## Not tested here
Player-level counts, lineups, Division I opponents, and practice-based 2027 inputs. This test uses season team rates, which differ from what the W&L-VMI scenarios feed the engine.

## Bugs
If a code bug is found after results are seen, the fix, the original results and the rerun all get reported.

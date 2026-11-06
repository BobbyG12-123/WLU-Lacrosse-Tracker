# Rule-to-test matrix and constants audit

Finished before engine code. Generated from `rules.js` and `constants.js`; don't edit by hand.

Rules version `ncaa-mlax-2027-2028-v1`: 2027 and 2028 NCAA Men's Lacrosse Rules and Interpretations (August 2026), plus the NCAA Statisticians' Manual (edition not stated in the copy read).

## Rules

| ID | Reference | Rule | Status |
|---|---|---|---|
| R3-1 | Rule 3-1 | 60 minutes, four 15-minute periods | Modeled, test required |
| R3-4 | Rules 3-4, 4-31 | Tied after regulation: 15-minute overtime periods, first goal ends the game | Modeled, test required |
| R4-3 | Rule 4-3-a | Faceoff at each period start and after each goal | Modeled, test required |
| R4-3-E1 | Rule 4-3-a Exception 1, A.R. 3 | Extra man at period end with a team in possession: offended team starts with the ball | Modeled, test required |
| R4-15-80 | Rule 4-15-a-1, a-2 | 80 seconds after a faceoff or change of possession | Modeled, test required |
| R4-15-60 | Rule 4-15-a-3 | 60 seconds on a valid shot retained in the offensive half | Modeled, test required |
| R4-15-80b | Rule 4-15-a-4 | 80 seconds on a valid shot returning to the defensive half (Function tested; the engine treats retained rebounds as offensive-half (assumption).) | Modeled, test required |
| R4-15-valid | Rule 4-15 | Valid shot: goalie contact, pipe or goal. Field-player block only if a goal. Wide is not valid | Modeled, test required |
| R4-15-exp | Rule 4-15 | Shot clock expiry awards the ball to the defense | Modeled, test required |
| R4-15-carry | Rule 4-15-a-8 | Shot clock ends with the period unless an extra man carries it over | Modeled, test required |
| R4-15-foul | Rule 4-15-a-5, a-6 | Foul with offense retaining: 60 if at or below 60, otherwise 80 | Modeled, test required |
| R4-16 | Rule 4-16-a, 4-6-h | Ball in the offensive half when the clock strikes 60, else turnover | Modeled, test required |
| R4-7 | Rule 4-7-b-3 | Shot out of bounds goes to the team with the nearest inbounds player, so a wide shot can be retained | Modeled, test required |
| R4-10 | Rules 4-10, 4-11 | A shot released after time has expired does not count | Modeled, test required |
| R5-2 | Rule 5-2 | Personal foul: 1, 2 or 3 minutes | Modeled, test required |
| R6-2 | Rule 6-2 | Technical foul: 30 seconds if the fouled team has the ball, otherwise possession only | Modeled, test required |
| R7-2-b | Rule 7-2-b | A goal releases releasable penalties, not nonreleasable ones | Modeled, test required |
| R7-2-c | Rule 7-2-c | Penalty time carries across periods, including overtime | Modeled, test required |
| R7-2-f | Rule 7-2-f | At most three in the penalty area; further time waits to start | Modeled, test required |
| R7-3 | Rule 7-3 | After a time-serving foul the offended team restarts on its offensive side, so no clear is needed | Modeled, test required |
| R7-4 | Rule 7-4 | A foul with no definite player is charged to the team, served by the in-home | Modeled, test required |
| S-assist | Manual section 3 | At most one assist per goal, never to the scorer | Modeled, test required |
| S-goalie | Manual sections 4, 12 | Save % = saves / (saves + goals allowed). Every goal has a goalkeeper of record. No empty-net goals. Team saves exist | Modeled, test required |
| S-sog | Manual section 7 | A shot off the pipe is not a shot on goal | Modeled, test required |
| S-fo | Manual section 6 | Every faceoff credits a win and a loss unless the quarter ends first | Modeled, test required |
| S-to | Manual section 10 | Turnovers go to a player or the team. Not every turnover is caused | Modeled, test required |
| R3-3 | Rule 3-3 | Intervals and halftime | Not simulated: Clock is stopped, so no effect on play. |
| R4-27 | Rule 4-27 | Timeouts: two per half, one per overtime | Not simulated: Clock stops and the shot clock continues. No tactical model yet. |
| R4-23 | Rules 4-12, 4-23, 4-24 | Substitution procedure and offside | Not simulated: Units change at possession changes and by the rotation schedule. Offside is not simulated. |
| R4-16b | Rule 4-16-b | Over and back | Not simulated: Inside the turnover rate; not a separate event. |
| R7-8 | Rules 7-8, 7-9 | Slow whistle and flag-down, including a goal canceling technical fouls | Not simulated: Fouls are applied immediately. Slight overstatement of penalties after goals. |
| R7-6 | Rules 7-2-d, 7-6 | Simultaneous fouls and common nonreleasable time | Not simulated: One foul at a time is simulated. |
| R7-exp | Rule 5, expulsion fouls | Expulsions | Not simulated: No evidence or rate available. |
| R4-32 | Rule 4-32 | Alternate possession | Not simulated: Unknown-possession restarts are not simulated. |
| R8 | Rule 8 | Video review and coach challenge | Not simulated: No goal is reversed in simulation. |
| R4-experimental | NCAA news, July 28, 2026 | Experimental fall rule for releases below the defensive restraining line | Not simulated: Fall only; the rulebook lists it nowhere in the material read. Could affect fall 2026 data if W&L used it. |

The test suite fails if a modeled rule has no passing named test.

## Engine constants

| Name | Value | Class | Units | Source |
|---|---|---|---|---|
| actionMeanSec | 25.4 | fitted | seconds of live play from control to a shot or turnover | Tuned by tools_fit_reference.js so a reference game matches official 2026 W&L shots plus turnovers per game. A fit, not a validation |
| faceoffMeanSec | 8 | assumption | seconds, whistle to possession | No timed evidence |
| clearMeanSec | 10 | assumption | seconds, control to the offensive half | No timed evidence; capped by Rule 4-16 |
| looseMeanSec | 4 | assumption | seconds a ball stays loose | No timed evidence |
| saveHeldByGoalie | 0.8 | assumption | share of saves the goalie controls | Tracker has only 20 rebound tags in 980 shots. Sensitivity reported |
| looseToShooters | 0.4 | assumption | share of loose saves and pipe shots recovered by the shooting team | No evidence. Sensitivity reported |
| wideToShooters | 0.45 | assumption | share of wide shots retained by the shooting team (Rule 4-7-b-3) | No evidence. Sensitivity reported |
| blockedToShooters | 0.4 | assumption | share of blocked shots retained by the shooting team | No evidence. Sensitivity reported |
| clearRequiredShare | 0.72 | fitted | share of non-faceoff possession changes that count as a clear attempt | Tuned to official clear attempts per game |
| turnoverGroundBall | 1 | fitted | share of live turnovers recovered as a ground ball | Tuned to official 2026 ground balls per game; the fit reached its upper limit and still ran 2 short. Team-level only; no player credit |
| defenseFoulShare | 0.65 | assumption | share of penalties committed against the team with the ball | Not logged |
| technicalShare | 0.52 | assumption | share of penalties that are 30-second technical fouls | Not logged. With personalMix, gives the 0.78 minutes per penalty in W&L official 2026 totals (50:00 on 64, 40:30 on 52) |
| personalMix | [0.92,0.07,0.01] | assumption | share of personal fouls at 1, 2, 3 minutes | Not logged |
| nonreleasableShare | 0.05 | assumption | share of penalties that are nonreleasable | Not logged |
| manUpFinishShift | 1.55 | fitted | logit shift on P(on goal) and P(goal | on goal) with an extra man | Tuned to official 2026 extra-man goals per game. Absorbs other man-up effects, so read it as a fit |
| lineShiftSec | 120 | assumption | seconds per midfield rotation block | Coach-editable |
| kappaFloor | 10 | assumption | smallest prior weight, in shots | Keeps a method-of-moments fit from trusting tiny samples |
| kappaCeiling | 400 | assumption | largest prior weight, in shots | Means no measurable player spread |
| kappaDefault | 60 | assumption | prior weight when fewer than 4 players qualify for the fit | Used only as a fallback; reported when used |
| teamPriorWeight | 50 | assumption | prior weight, in shots or turnovers, for team-level opponent rates | Sensitivity reported |
| faceoffPriorWeight | 20 | assumption | prior weight, in faceoffs, toward 50% | Sensitivity reported |
| goalieShrinkShots | 100 | assumption | prior weight, in shots on goal, for a goalie vs team average | Sensitivity reported |
| usagePriorShots | 2 | assumption | prior shots per player when splitting usage | Keeps an on-field player with no shots eligible |

## Scrimmage Planner constants (not used by this engine)

| Value | Class | Finding | Engine |
|---|---|---|---|
| wl.gpp 0.248 | observed, stored | Stored goals per possession, source not recorded in the plan doc | Not used |
| wl.d3Eff 0.267 | observed, stored | From LacrosseReference; permission unresolved | Not used |
| wl.defRel 0.62 | assumption, unexplained | No derivation found | Not used |
| wl.pace 34.97, opp pace | misused | LacrosseReference pace appears to be seconds per possession, but is read as possessions per game. See audit addendum | Not used |
| SCRIM_TYPES | observed, stored | Goals per possession by type; ratios verified in _tests/planner | Not used |
| emo 0.361, md 0.283, chances 2.6, 3.8 | observed, stored | Source not recorded in the plan doc | Not used. Official penalties and extra-man goals instead |
| Prior weights 30, 10, 12, 15, 4, 2 | assumption, unexplained | Not fitted | Not used. Weights fitted or classified above |
| daySd clamp 0.12-0.6, teamDay 0.05-0.4 | assumption | A "hot day" effect the plan rules out unless validated | Not used |
| crowd 0.88-1.12, exponent -0.15 | assumption, unexplained | Not fitted | Not used |
| passer 0.8-1.25, role 0.85-1.15 | fitted with assumed clamps | Measured chemistry is not supported by lineup exposure | Not used. Additive roles only |
| pace noise 0.08, goalie 0.18, faceoff 0.04, 0.6 | assumption, unexplained | Game flow settings | Not used |
| score effects 1.08, 0.95; hot goalie 0.93 | assumption, unexplained | Game flow settings | Not used |
| fin fallback [0.4, 0.3, 0.15] | assumption | Fallback | Not used |

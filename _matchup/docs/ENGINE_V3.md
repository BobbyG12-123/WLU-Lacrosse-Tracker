# Engine v3 (experimental)

A possession engine for game week. It's built alongside v1 and v2, which stay frozen. Nothing here is validated against games. The first test is 2027 games, scored once after the season.

## Inputs

- **Teams:** LacrosseReference records as stored on the tracker. That covers film-tag possession types and rates, adjusted efficiency, possessions and length, penalties, man-up and man-down, clears, the roster, and faceoffs by man.
- **Roster for the coming season:**
  - `names`: the real roster, matched by name, because jersey numbers get reassigned.
  - `returning`: drop SR and GR players.
  - Either way, offense and defense keep the share of positive EGA that returns. The share that left is pulled to the D3 average on the log-odds scale, because incoming players are unknown.
- **Faceoffs:** each FOGO pair uses head-to-head draws first, then FOGOs both have faced (each at half weight), then season records (weight 20). The game chance comes from both teams' usage.
- **Goalies:** save rate by zone from logged shots (weight 8 toward his own average), against each shooter's placement. The effect is relative to the team's usual goalie mix, so the team level stays calibrated.
- **Shooters:** usage from shots, and finishing pulled toward the team (weight 30). Multipliers average 1.
- **Picks:** the coverage split from `picks.js` (`pickMatchup`) once a defense has 15+ coverage tags.

## A possession

1. Faceoff, or a clear after a miss or turnover. A failed clear gives the other team a transition possession.
2. Man-up, at the defense's penalty rate.
3. Transition, early or settled, from both teams' shares.
4. If settled: a pick (coverage drawn from their mix) or no pick.
5. A shooter is drawn, and the scoring chance carries his finishing and the goalie-against-placement effect.

Possession time is scaled so each team averages its real possessions per game. Ties go to sudden-victory overtime.

## Checks

`v3/tests/v3_tests.js` (synthetic data) covers:
- calibration (possessions, and goals per possession against the parameters);
- determinism;
- event validation (the score is rebuilt from events, no ties, time runs in order);
- changes (a change of 1 alters nothing; changes run in the expected direction; unknown changes are refused);
- goalie and coverage effects;
- the roster-turnover rules.

## Not yet

- The staff sheet (levers, ways we lose, recommendations) on top of v3, ported from the mockup.
- Individual defensive matchups, slides, rides and clears by player.
- Wing ground balls on faceoffs, which aren't logged yet.

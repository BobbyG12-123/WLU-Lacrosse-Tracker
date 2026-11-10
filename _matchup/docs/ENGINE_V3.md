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

## Review fixes (Nov 10, 2026)

An independent review plus re-deriving the numbers from raw files found errors. All are fixed and tested.

**Scale and calibration**
- The goalie and shooter effects were on the odds scale, which overstated them. They now scale goals per possession on the probability scale: (1 − save in net) / (1 − usual save), and finishing / team finishing.
- Failed clears were counted twice as transition. They're now taken out of the film transition share, and failed clears per game match each team's record.
- Man-up was double counted in the anchor. Adjusted efficiency includes man-up, so even-strength rates are now anchored with man-up removed.
- Film rates by kind are pulled toward D3 (weight 30), and man-up rates too (weight 20).
- Pick rates shifted level when the 15th coverage tag arrived. Now only the coverage differences come from tags.
- The faceoff prior counted head-to-head draws twice. They're removed from each man's record before the prior.

**Wrong inputs**
- The pick-pair lever used a hard-coded 12 picks a game. It now uses pick goals per pick possession from the sim.
- Departed faceoff men were kept when the roster was given by name. They now follow the same roster rule.
- An unnamed film FOGO with no roster row at that number is kept, and labeled by number from the next-season roster. Rosters can list a player under a different number than the film does.
- Scrimmage shots by us (against their goalie and their defenders) were counted in our goalie, defender and slide numbers. They're now excluded.

**Edge cases**
- Edge cases that produced NaN or a 0% faceoff chance are now guarded: perfect or empty man-up records, faceoff usage that names nobody, and a team with zero logged goals.
- Clear levers now change failed clears in the engine. Before, they added goals to transition.

Still modeling choices, not errors:
- Levers pick the best of several small samples, and each says so ("best of N").
- Group counts are shots plus turnovers, not possessions.
- Slide and shot-clock effects are per shot.
- Possession length spread is 0.4–1.2 times the average.
- Indirect faceoff reads are at half weight.

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

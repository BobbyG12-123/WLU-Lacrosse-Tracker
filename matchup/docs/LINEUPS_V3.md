# Lineups on engine v3: step 1, unit ratings (Nov 17, 2026)

Goal: the best lineup for each unit against this week's opponent. Step 1 is the engine side only: player and group
ratings from our logs, and a builder that turns a lineup into engine changes. **Nothing on the page changes in this step.**
Code: `v3/lineups.js`. Tests: `v3/_tests/lineups_tests.js` (synthetic data).

## What a lineup is
`{ attack: [3], mids: [{ players: [3], share }], defense: [3 D, LSM, 2 SSDM], goalie, fogo, manUp: [6], manDown: [...] }`.
Any part left out stays as the baseline's. A lineup is always compared with a **baseline lineup**, which is what the
game-week sheet already shows. The baseline gives no engine changes, so its win chance is the sheet's (tested exactly).

## Ratings (all from our practice and scrimmage logs; every number keeps its sample size)
**Offense, per player:** goals produced per possession used.
- A shot uses a possession and a goal is produced. On an assisted shot, half the possession and half the goal go to
  the passer (`assist 0.5`, an assumption). A named turnover uses a possession and produces nothing.
- Pulled toward the team with weight 30 (see "Trust weights").
- Usage is possessions used per session the player logged anything, pulled toward the team's by 3 sessions.
**Offensive unit:** usage-weighted average of its players' ratings: Σ uᵢ·effᵢ, where uᵢ is each player's usage share within the unit.
- For a group logged together in lineup records, add a "together" term: the gap between its logged rate and the rate
  its players predict, on the log-odds scale, pulled to zero by 40 possessions.
- The six on the field are the attack plus each midfield line, averaged by line share.
**Defense, per player:** beaten rate on logged 1-on-1 reps (weight 12), and caused turnovers per logged entry in the
sessions he logged anything on defense (weight 200).
**Defensive unit:** goals allowed per possession relative to the team = (1 − caused-turnover share) × (1 + share of goals
allowed that came on logged reps × (rep goal rate / team rep goal rate − 1)). Both parts come from the logs. The
caused-turnover share is caused turnovers per logged entry against our defense (shots plus no-shot possessions),
scaled by the unit's average caused rate over the team's.
- The rep goal rate uses the logged goal rate on reps where the defender was beaten and on reps where he wasn't.
**Man-up:** each player's man-up record pulled toward his even-strength rating. **Man-down:** the defensive unit formula.
**Goalie and FOGO:** the sheet's own models. A goalie swap gives exactly the sheet's "goalie in net" replay. A FOGO
swap moves the sheet's faceoff chance by the gap between his head-to-head row and the baseline FOGO's row, on the
log-odds scale, so the home edge and our logged draws against them stay in.

## Into the engine
Each unit's value divided by the baseline unit's becomes a multiplier on the matching engine rate:
- our settled offense: `wl.six`;
- their settled offense: `opp.six`;
- our man-up: `wl.emo`;
- their man-up: `opp.emo`;
- faceoff chance: `fo`.

Win chances use the sheet's games and seed, so lineups are compared on the same simulated games.

Goals per 100 settled possessions = the sheet's figure × the multiplier.

"Chance better than the baseline" assumes each player's rating error is independent and normal, so shared players cancel.
**It counts sample size only:** it does not include how well practice numbers carry over to games, so it reads too sure.
On defense it is linearized in each player's beaten and caused rates (the small (1 − caused) and rep factors are left
out). For man-up, a player's error uses his even-strength and man-up samples together, a rough rule.

## Trust weights: how they were chosen (Nov 5 logs, 18 sessions)
| Weight | Value | Evidence |
|---|---|---|
| off | 30 | Method of moments: 49. A split by date (first 9 sessions predict the last 9) was best at 10–25; 30 sits between. Player ratings cut that error by about 30% against the team average (0.0065 vs 0.0092). |
| beaten | 12 | Method of moments: 12 (29 defenders). |
| caused | 200 | Method of moments: 206. |
| assist share | 0.5 | Assumption. |
| usage prior | 3 sessions | Assumption. |
| group | 40 | V3.K.group. |

Refit these as more is logged.

## Known limits (stated, not fixed)
- **Lineup records are thin.**
  - On Nov 5, 260 of 1,645 entries had a lineup attached.
  - One attack trio holds most of the data, and no midfield line had 20+ entries.
  - The together term is near zero for almost every group, so units rate as the sum of their players.
- **Ratings come from practice, against our own defense** (and our offense, for defenders). Lineups are compared with
  each other, never given as absolute numbers, but a player who is good against us may not be good against everyone.
- **Opponent effects are mostly common to every lineup.** The 2026 D3 data showed no goalie-specific zone pattern, so
  the best unit is usually the same whatever the opponent. The opponent mostly changes how much the choice is worth in win %.
- **Usage is fixed per player.** Usage doesn't trade off against efficiency.
  - A low-usage finisher keeps his rate on a unit with more feeders.
  - Feeders get half of each assisted goal.
- **Defensive opportunity is per session present, not per possession on the field.** Players who get more reps log more.
- **Wing ground balls:** logged as "how the possession started: Ground ball / FO win" with a jersey. That was 7 entries with a jersey on
  Nov 5, so they are counted (`R.starts`) but not rated yet.
- **Default midfield lines split time equally** until a coach sets the shares (step 2).

# Step 2: the Lineups panel (Nov 17, 2026)
On the game-week page, under the sheet (a link at the top jumps to it). Nothing is saved; edits last until the page is closed.

**Current lineup**
- It starts as the lineup most often in our logged lineup records (`defaultLineup`), which is the sheet's lineup.
- Click a player to put someone else in. Candidates come from that slot's position; a player's second position counts.
- Midfield time shares are percents. A line you type keeps its value, and the lines you haven't typed split the rest. If typed lines add to more than 100, they're scaled to fit. A line with no time gets no swaps.
- "Back to the logged lineup" undoes every change.
- If you haven't edited anything, a new run follows the newest logs.

**Swaps** (`swaps`), per unit:
- Every one-player swap is rated with the closed-form unit ratings. The best 3 are then played on the sheet's games and seed, so they are compared on the same games.
- A suggested swap only brings in a player with 10+ possessions used (offense) or 5+ defensive entries.
- Faceoffs and goalie: every candidate is played.
- A swap row says when it makes or breaks up a six logged together. That six's together term moves the rating.

**Chance better**
- It counts sample size only, now including the together term's own error (delta method).
- It's shown no finer than 5%–95%.
- On defense it is too sure: caused turnovers are counted per practice a player logged anything in, not per minute on the field, so players who take more reps rate higher and look more certain.

**Sheet fix:** the "not in this sheet yet" line on wing ground balls now says they aren't logged on their own, and counts the possessions logged as starting with a ground ball or faceoff win with a jersey (on draws or not). That replaces the old "not logged yet".

**Speed:** about 1 second per unit on the Nov 5 logs (3,000 games each), about 9 seconds for the whole panel. It fills in one unit at a time.

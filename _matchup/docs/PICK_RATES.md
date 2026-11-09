# Pick rates (experimental)

`picks.js` turns the Scouting page's pick tags into sim inputs. Nothing here has been validated against game results. The first test is 2027 games, scored once after the season, like v1 and v2.

## Inputs

- Clips: `lrTeams.sb.pick_clips_def` (picks run against a team) and `pick_clips_off` (its own picks). Each clip records whether the possession scored.
- Staff tags: `filmTags/pick_def_<team>` and `pick_off_<team>`. These hold coverage, the four players, the spot in yards, the result, and fault or credit. The older one-word tags in `filmTags/pick` count on the defense side as coverage only.
- Team pick line: `sb.def.pick` / `sb.off.pick`, which covers every film-tagged pick possession, not only staff-tagged ones.
- D3 pick line: `app/lrMeta.sb_league.pick`.

## Rates

Every rate is (count + w × prior) / (attempts + w), reported with its count, prior, weight and formula.

| Rate | Prior | w |
|---|---|---|
| Team goals per pick possession | D3 pick rate | 30 |
| Coverage share | Pooled league coverage mix, or an even split over the coverages seen | 10 |
| Goals per pick, by coverage | The team rate | 20 |
| Shots and turnovers, by coverage | The team's tagged results, pulled toward the league's tagged results when there are any | 20 |
| Player goals per pick | Coverage-adjusted team rate on the picks he was in | 15 |

The weights were fixed on Nov 9, 2026, before any result-tagged picks existed, and are not tuned on tagged data. Changing them is a model change.

- A goal counts from the tagged result when there is one; otherwise from whether the possession scored. Shots and turnovers count only where a result was tagged.
- A team with no coverage tags gets no coverage split. Another team's mix is never borrowed.
- Below 15 coverage tags for a defense, the matchup uses team rates only and says how many tags there are.
- Players are used by the sim only from 10 tagged picks. Fault and credit count only for the team's own players.

## Our picks against their defense

`pickMatchup(ourOff, theirDef)` combines, for each coverage, our goals per pick against it with theirs when playing it, using log5 relative to the D3 rate. When both are at D3 the result is D3. The total is weighted by their coverage mix.

## Limits

- The clip lists hold at most 160 picks per side per team.
- Coverage names are the six on the tagger. Other coverages aren't modeled.
- The possession engine doesn't use these rates yet. That comes with the v3 engine (game-week plan, step 3 onward).

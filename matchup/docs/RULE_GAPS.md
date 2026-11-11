# Rule gaps: how each is handled

This engine is **not a complete rules simulation**. These gaps are listed in priority order by what they can change. The local matchup report measures bounds for each on a given matchup.

| Priority | Gap | Affects | How it's handled now | What would change it |
|---|---|---|---|---|
| 1 | Delayed penalties (slow whistle, flag-down; Rules 7-8, 7-9) | Manpower, possession, whether a goal cancels a technical foul | Fouls apply at once. Plays during a flag, and the Rule 7-9 cancellation, don't happen. Penalties are probably slightly overstated | Flag state in the engine, plus a logged or official rate of goals during flags |
| 2 | Player removal (Rules 7-2, 7-4) | Eligibility, who plays man-down | Penalties are team-charged because W&L doesn't log who committed them. Team manpower changes, but no specific player leaves. The engine does remove a named player when penalty shares exist, and a test covers it | Official penalties by player, which school pages carry |
| 3 | Man-down units and man-up personnel | Who is on the field in extra-man play | The same units play. The extra-man effect is one fitted shift | Logged special-team units |
| 4 | Offside (Rule 4-12) | Possession, manpower | Not simulated as an event. Official turnover totals include violations, so frequency is inside the turnover rate but its timing isn't. No offside goals are disallowed | Offside events in logs or play-by-play |
| 5 | Simultaneous fouls, common nonreleasable time (Rules 7-2-d, 7-6) | Release timing | One foul at a time | Rare; low priority |
| 6 | Timeouts, equipment and injury stoppages | Shot clock restarts | Not simulated. The clock stops, so play time is unaffected | Tactical timeout model |
| 7 | Expulsions, alternate possession, over and back, video review | Rare events | Not simulated, or inside the turnover rate | Evidence of frequency |

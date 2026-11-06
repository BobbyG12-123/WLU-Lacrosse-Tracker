# Models: what's frozen and what each one covers

Both models are frozen. **Don't tune further against the 2026 test games.** Any new evaluation needs a genuinely later period, with settings fixed beforehand.

| | Team-level v1 | Team-level v2 candidate | W&L player model |
|---|---|---|---|
| **Used for** | Record of the first evaluation | Division III team matchups | W&L against an opponent we've logged |
| **Inputs** | Official 2026 game logs | Official 2026 game logs, opponent-adjusted | 2027 practices or opponent scrimmages, plus official 2026 references |
| **Code** | tag `matchup-validation-v1` (`dbdfcd9`) | `88d48f4` | current branch, using v1's approach |
| **Result files (local)** | `validation_v1_frozen/` | `frozen/holdout_results.json`, `frozen/holdout_report.md` | none: no game test exists |
| **Results SHA-256 (start)** | `917685e840cb54f7` | `5393880b70e0df7f` | n/a |

## What v2's evaluation says
Scored on 63 unseen 2026 games: 17 primary, 46 secondary.
- Primary margin coverage: 13 of 17 (76.5%), against 11 of 17 for v1 on the same games. That is two games' difference.
- Brier 0.203 vs 0.231 on primary, not shown to be better. Secondary 0.107 vs 0.157, interval excludes zero, on an early-season set.
- **This is an unseen-game evaluation, not a forward-in-time test.** Development games came from the same weeks.

## What it doesn't say
V2's results **must not be attached** to player projections, lineup or rotation comparisons, practice-based inputs, W&L vs VMI, or Division I opponents. The interface names the model and its input sources on every run, and shows v2's figures only with the team-level model.

## Preserved
- Official pages and their hashes: `official_raw/`, `frozen/official_raw_SHA256.txt`.
- Inputs at freeze: `frozen/inputs_at_freeze.json`. Export hash: `frozen/export_SHA256.txt`.
- A test locks v1's engine output; `V2_FROZEN` fixes λ = 15 and β = 4; `tools_holdout.js` refuses a second holdout run.

## Known open item
Event totals vary less in simulation than in official games. See `PACE_CHECK.md`. V2 isn't changed for this.

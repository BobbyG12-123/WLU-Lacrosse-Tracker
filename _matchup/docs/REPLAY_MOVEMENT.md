# Replay movement

The animation layer only. It reads the event log and changes no outcome, statistic or event. A test locks the engine's output.

## How it works
- **Persistent state:** each player has position, velocity, heading, role, purpose and target, updated 20 times a simulated second. Rendering interpolates between updates, so speed, pause and seek can't skip a step. Paths are computed once when a game loads, so seeking lands on the correct state.
- **Independence:** each player has their own reaction delay, speed, acceleration and rhythm, from a separate hash stream, not the engine's random numbers.
- **Purposes:** carry, dodge, cut, screen, support, space, transition, hold, defend, on-ball, recover, ride, loose, goalie, set, sub.
- **Defense:** on-ball pursues with a cushion, off-ball stays goal side of an assignment with a small sag to the ball, and players recover at speed when beaten.
- **Ball:** on the carrier while carried; passes and shots leave when they must to arrive on time at their own speed. Score, event log and arrival share the same moment.
- **Display pauses:** 7 seconds after a goal and 14 between periods, with the game clock frozen. Event order and game time don't change.

## What's illustration, not evidence
Dodges, cuts, picks and most passes aren't simulated events. Only the shot, shooter, outcome, credited assist, turnover, faceoff, clear, penalty and on-field units come from the engine. Speeds and accelerations are rendering settings, not player ratings.

## Limits
- **Substitutions (a model issue):** the engine uses separate offense and defense units, so midfielders change at nearly every possession change. The replay shows this honestly, and it's more than real games have.
- **Roster count:** a player leaving can overlap briefly with the one entering. On-field status itself follows the log.
- **Bunching:** teammates are within 3 yards a bit more often than in the old formation version (9% vs 5.8% of checks, fixture game).
- **Formation anchors:** players still drift around role areas, so team shape stays schematic, not a real offense.
- **Picks:** the screen is approximate, and defenders don't fight through it.
- **Faceoffs:** a very quick faceoff can start before everyone is set.
- **Shot location:** a small share of shots can come from a poor angle when the log gives little time before the shot.
- **Load time:** building a game takes about a second on this Mac.
- **Review:** I checked this with frames and measurements. Judging it live is still needed.

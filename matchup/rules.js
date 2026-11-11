// W&L Matchup Studio: versioned NCAA rules module. Pure, no tracker dependencies.
// Source: "2027 and 2028 NCAA Men's Lacrosse Rules and Interpretations" (August 2026). Effective with the 2027 and 2028 seasons.
// Statistics: NCAA Men's Lacrosse Statisticians' Manual (edition not stated in the copy read).
// Times are integer tenths of a second, so clocks never accumulate floating-point error.
(function (g) {
  const MS = g.MS = g.MS || {};
  const SEC = 10;
  const RULES = Object.freeze({
    version: 'ncaa-mlax-2027-2028-v1',
    periodDs: 15 * 60 * SEC,       // 3-1
    regulationPeriods: 4,          // 3-1
    overtimeDs: 15 * 60 * SEC,     // 3-4, 4-31
    shotClockFullDs: 80 * SEC,     // 4-15, 4-16-a
    shotClockRetainedDs: 60 * SEC, // 4-15-a-3
    advanceWithinDs: 20 * SEC,     // 4-16-a: in the offensive half when the 80-second clock strikes 60
    maxInPenaltyArea: 3,           // 7-2-f
    technicalDs: 30 * SEC,         // 6-2
    personalDs: Object.freeze([60 * SEC, 120 * SEC, 180 * SEC]), // 5-2
    maxOvertimePeriods: 200        // simulation guard only, not a rule
  });

  // 4-15: goalie contact, pipe, or goal is valid; off a field player only if it scores; wide is not.
  const VALID = { goal: true, save: true, pipe: true, wide: false, blocked: false };
  function isValidShot(outcome) { if (!(outcome in VALID)) throw new Error('unknown shot outcome ' + outcome); return VALID[outcome]; }

  // 4-15-a: the shot clock after a non-goal shot, once someone controls the ball.
  function clockAfterShot(prevDs, outcome, retainedByShooter, inOffensiveHalf) {
    if (!retainedByShooter) return RULES.shotClockFullDs;                 // a-2, change of possession
    if (!isValidShot(outcome)) return prevDs;                             // not valid: no reset, clock keeps running
    return inOffensiveHalf ? RULES.shotClockRetainedDs : RULES.shotClockFullDs; // a-3, a-4
  }
  // 4-15-a-5 and a-6: offense keeps the ball after a foul. 7-3 also says "a new shot clock"; a-5/a-6 are the specific text.
  function clockAfterFoulRetained(prevDs) { return prevDs <= RULES.shotClockRetainedDs ? RULES.shotClockRetainedDs : RULES.shotClockFullDs; }

  // 4-3-a Exception 1, 4-15-a-8: an extra man at the end of a period, with a team in possession, restarts with the offended team
  // holding the ball; if that team already had it, the shot clock carries over. Otherwise a faceoff.
  function nextPeriodStart(manUpTeam, possTeam, clockDs) {
    if (manUpTeam === null || possTeam === null) return { type: 'faceoff' };
    return { type: 'possession', team: manUpTeam, clockDs: possTeam === manUpTeam ? clockDs : RULES.shotClockFullDs };
  }
  // 7-2-b: a goal releases releasable time already being served by the team scored on. A player who also owes nonreleasable time stays.
  const releasedByGoal = penalty => penalty.releasable && penalty.started;

  // Registry. status 'modeled' needs a named passing test. 'declared' means not simulated in this version, with the reason shown to users.
  const RULE_REGISTRY = Object.freeze([
    { id: 'R3-1', ref: 'Rule 3-1', text: '60 minutes, four 15-minute periods', status: 'modeled' },
    { id: 'R3-4', ref: 'Rules 3-4, 4-31', text: 'Tied after regulation: 15-minute overtime periods, first goal ends the game', status: 'modeled' },
    { id: 'R4-3', ref: 'Rule 4-3-a', text: 'Faceoff at each period start and after each goal', status: 'modeled' },
    { id: 'R4-3-E1', ref: 'Rule 4-3-a Exception 1, A.R. 3', text: 'Extra man at period end with a team in possession: offended team starts with the ball', status: 'modeled' },
    { id: 'R4-15-80', ref: 'Rule 4-15-a-1, a-2', text: '80 seconds after a faceoff or change of possession', status: 'modeled' },
    { id: 'R4-15-60', ref: 'Rule 4-15-a-3', text: '60 seconds on a valid shot retained in the offensive half', status: 'modeled' },
    { id: 'R4-15-80b', ref: 'Rule 4-15-a-4', text: '80 seconds on a valid shot returning to the defensive half', status: 'modeled', note: 'Function tested; the engine treats retained rebounds as offensive-half (assumption).' },
    { id: 'R4-15-valid', ref: 'Rule 4-15', text: 'Valid shot: goalie contact, pipe or goal. Field-player block only if a goal. Wide is not valid', status: 'modeled' },
    { id: 'R4-15-exp', ref: 'Rule 4-15', text: 'Shot clock expiry awards the ball to the defense', status: 'modeled' },
    { id: 'R4-15-carry', ref: 'Rule 4-15-a-8', text: 'Shot clock ends with the period unless an extra man carries it over', status: 'modeled' },
    { id: 'R4-15-foul', ref: 'Rule 4-15-a-5, a-6', text: 'Foul with offense retaining: 60 if at or below 60, otherwise 80', status: 'modeled' },
    { id: 'R4-16', ref: 'Rule 4-16-a, 4-6-h', text: 'Ball in the offensive half when the clock strikes 60, else turnover', status: 'modeled' },
    { id: 'R4-7', ref: 'Rule 4-7-b-3', text: 'Shot out of bounds goes to the team with the nearest inbounds player, so a wide shot can be retained', status: 'modeled' },
    { id: 'R4-10', ref: 'Rules 4-10, 4-11', text: 'A shot released after time has expired does not count', status: 'modeled' },
    { id: 'R5-2', ref: 'Rule 5-2', text: 'Personal foul: 1, 2 or 3 minutes', status: 'modeled' },
    { id: 'R6-2', ref: 'Rule 6-2', text: 'Technical foul: 30 seconds if the fouled team has the ball, otherwise possession only', status: 'modeled' },
    { id: 'R7-2-b', ref: 'Rule 7-2-b', text: 'A goal releases releasable penalties, not nonreleasable ones', status: 'modeled' },
    { id: 'R7-2-c', ref: 'Rule 7-2-c', text: 'Penalty time carries across periods, including overtime', status: 'modeled' },
    { id: 'R7-2-f', ref: 'Rule 7-2-f', text: 'At most three in the penalty area; further time waits to start', status: 'modeled' },
    { id: 'R7-3', ref: 'Rule 7-3', text: 'After a time-serving foul the offended team restarts on its offensive side, so no clear is needed', status: 'modeled' },
    { id: 'R7-4', ref: 'Rule 7-4', text: 'A foul with no definite player is charged to the team, served by the in-home', status: 'modeled' },
    { id: 'S-assist', ref: 'Manual section 3', text: 'At most one assist per goal, never to the scorer', status: 'modeled' },
    { id: 'S-goalie', ref: 'Manual sections 4, 12', text: 'Save % = saves / (saves + goals allowed). Every goal has a goalkeeper of record. No empty-net goals. Team saves exist', status: 'modeled' },
    { id: 'S-sog', ref: 'Manual section 7', text: 'A shot off the pipe is not a shot on goal', status: 'modeled' },
    { id: 'S-fo', ref: 'Manual section 6', text: 'Every faceoff credits a win and a loss unless the quarter ends first', status: 'modeled' },
    { id: 'S-to', ref: 'Manual section 10', text: 'Turnovers go to a player or the team. Not every turnover is caused', status: 'modeled' },
    { id: 'R3-3', ref: 'Rule 3-3', text: 'Intervals and halftime', status: 'declared', reason: 'Clock is stopped, so no effect on play.' },
    { id: 'R4-27', ref: 'Rule 4-27', text: 'Timeouts: two per half, one per overtime', status: 'declared', reason: 'Clock stops and the shot clock continues. No tactical model yet.' },
    { id: 'R4-23', ref: 'Rules 4-12, 4-23, 4-24', text: 'Substitution procedure and offside', status: 'declared', reason: 'Units change at possession changes and by the rotation schedule. Offside is not simulated.' },
    { id: 'R4-16b', ref: 'Rule 4-16-b', text: 'Over and back', status: 'declared', reason: 'Inside the turnover rate; not a separate event.' },
    { id: 'R7-8', ref: 'Rules 7-8, 7-9', text: 'Slow whistle and flag-down, including a goal canceling technical fouls', status: 'declared', reason: 'Fouls are applied immediately. Slight overstatement of penalties after goals.' },
    { id: 'R7-6', ref: 'Rules 7-2-d, 7-6', text: 'Simultaneous fouls and common nonreleasable time', status: 'declared', reason: 'One foul at a time is simulated.' },
    { id: 'R7-exp', ref: 'Rule 5, expulsion fouls', text: 'Expulsions', status: 'declared', reason: 'No evidence or rate available.' },
    { id: 'R4-32', ref: 'Rule 4-32', text: 'Alternate possession', status: 'declared', reason: 'Unknown-possession restarts are not simulated.' },
    { id: 'R8', ref: 'Rule 8', text: 'Video review and coach challenge', status: 'declared', reason: 'No goal is reversed in simulation.' },
    { id: 'R4-experimental', ref: 'NCAA news, July 28, 2026', text: 'Experimental fall rule for releases below the defensive restraining line', status: 'declared', reason: 'Fall only; the rulebook lists it nowhere in the material read. Could affect fall 2026 data if W&L used it.' }
  ]);
  MS.RULES = RULES; MS.SEC = SEC; MS.RULE_REGISTRY = RULE_REGISTRY;
  MS.isValidShot = isValidShot; MS.clockAfterShot = clockAfterShot; MS.clockAfterFoulRetained = clockAfterFoulRetained; MS.nextPeriodStart = nextPeriodStart; MS.releasedByGoal = releasedByGoal;
})(globalThis);

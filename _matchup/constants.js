// Every numeric value the engine or estimator uses, classified before use. Classes: rule, observed, fitted, assumption, rendering.
// Rule values are in rules.js. Observed and fitted values are computed from each snapshot and recorded there.
// No real data here: the repository is public. Values below are model settings a coach can see and change.
(function (g) {
  const MS = g.MS = g.MS || {};
  MS.MODEL_VERSION = 'matchup-engine-0.1';
  MS.CONSTANTS = Object.freeze({
    actionMeanSec:      { value: 25.6,   cls: 'fitted',     unit: 'seconds of live play from control to a shot or turnover', source: 'Tuned by tools_tune.js on league totals from 53 official games before 2026-03-01. Not tuned on any test game. A fit, not a validation' },
    faceoffMeanSec:     { value: 8,    cls: 'assumption', unit: 'seconds, whistle to possession', source: 'No timed evidence' },
    clearMeanSec:       { value: 10,   cls: 'assumption', unit: 'seconds, control to the offensive half', source: 'No timed evidence; capped by Rule 4-16' },
    looseMeanSec:       { value: 4,    cls: 'assumption', unit: 'seconds a ball stays loose', source: 'No timed evidence' },
    saveHeldByGoalie:   { value: 0.80, cls: 'assumption', unit: 'share of saves the goalie controls', source: 'Tracker has only 20 rebound tags in 980 shots. Sensitivity reported' },
    looseToShooters:    { value: 0.40, cls: 'assumption', unit: 'share of loose saves and pipe shots recovered by the shooting team', source: 'No evidence. Sensitivity reported' },
    wideToShooters:     { value: 0.45, cls: 'assumption', unit: 'share of wide shots retained by the shooting team (Rule 4-7-b-3)', source: 'No evidence. Sensitivity reported' },
    blockedToShooters:  { value: 0.40, cls: 'assumption', unit: 'share of blocked shots retained by the shooting team', source: 'No evidence. Sensitivity reported' },
    clearRequiredShare: { value: 0.62, cls: 'fitted',     unit: 'share of non-faceoff possession changes that count as a clear attempt', source: 'Tuned by tools_tune.js on league totals from 53 official games before 2026-03-01. Not tuned on any test game. A fit, not a validation' },
    turnoverGroundBall: { value: 0.95,  cls: 'fitted',     unit: 'share of live turnovers recovered as a ground ball', source: 'Tuned by tools_tune.js on league totals from 53 official games before 2026-03-01. Not tuned on any test game. A fit, not a validation' },
    defenseFoulShare:   { value: 0.65, cls: 'assumption', unit: 'share of penalties committed against the team with the ball', source: 'Not logged' },
    technicalShare:     { value: 0.52, cls: 'assumption', unit: 'share of penalties that are 30-second technical fouls', source: 'Not logged. With personalMix, gives the 0.78 minutes per penalty in W&L official 2026 totals (50:00 on 64, 40:30 on 52)' },
    personalMix:        { value: [0.92, 0.07, 0.01], cls: 'assumption', unit: 'share of personal fouls at 1, 2, 3 minutes', source: 'Not logged' },
    nonreleasableShare: { value: 0.05, cls: 'assumption', unit: 'share of penalties that are nonreleasable', source: 'Not logged' },
    manUpFinishShift:   { value: 1.1, cls: 'fitted',     unit: 'logit shift on P(on goal) and P(goal | on goal) with an extra man', source: 'Tuned by tools_tune.js on league totals from 53 official games before 2026-03-01. Not tuned on any test game. A fit, not a validation' },
    lineShiftSec:       { value: 120,  cls: 'assumption', unit: 'seconds per midfield rotation block', source: 'Coach-editable' },
    kappaFloor:         { value: 10,   cls: 'assumption', unit: 'smallest prior weight, in shots', source: 'Keeps a method-of-moments fit from trusting tiny samples' },
    kappaCeiling:       { value: 400,  cls: 'assumption', unit: 'largest prior weight, in shots', source: 'Means no measurable player spread' },
    kappaDefault:       { value: 60,   cls: 'assumption', unit: 'prior weight when fewer than 4 players qualify for the fit', source: 'Used only as a fallback; reported when used' },
    teamPriorWeight:    { value: 50,   cls: 'assumption', unit: 'prior weight, in shots or turnovers, for team-level opponent rates', source: 'Sensitivity reported' },
    faceoffPriorWeight: { value: 20,   cls: 'assumption', unit: 'prior weight, in faceoffs, toward 50%', source: 'Sensitivity reported' },
    goalieShrinkShots:  { value: 100,  cls: 'assumption', unit: 'prior weight, in shots on goal, for a goalie vs team average', source: 'Sensitivity reported' },
    usagePriorShots:    { value: 2,    cls: 'assumption', unit: 'prior shots per player when splitting usage', source: 'Keeps an on-field player with no shots eligible' }
  });
  // The planner's hardcoded values, classified as the audit required. None is imported by this engine.
  MS.PLANNER_CONSTANTS_AUDIT = Object.freeze([
    ['wl.gpp 0.248', 'observed, stored', 'Stored goals per possession, source not recorded in the plan doc', 'Not used'],
    ['wl.d3Eff 0.267', 'observed, stored', 'From LacrosseReference; permission unresolved', 'Not used'],
    ['wl.defRel 0.62', 'assumption, unexplained', 'No derivation found', 'Not used'],
    ['wl.pace 34.97, opp pace', 'misused', 'LacrosseReference pace appears to be seconds per possession, but is read as possessions per game. See audit addendum', 'Not used'],
    ['SCRIM_TYPES', 'observed, stored', 'Goals per possession by type; ratios verified in _tests/planner', 'Not used'],
    ['emo 0.361, md 0.283, chances 2.6, 3.8', 'observed, stored', 'Source not recorded in the plan doc', 'Not used. Official penalties and extra-man goals instead'],
    ['Prior weights 30, 10, 12, 15, 4, 2', 'assumption, unexplained', 'Not fitted', 'Not used. Weights fitted or classified above'],
    ['daySd clamp 0.12-0.6, teamDay 0.05-0.4', 'assumption', 'A "hot day" effect the plan rules out unless validated', 'Not used'],
    ['crowd 0.88-1.12, exponent -0.15', 'assumption, unexplained', 'Not fitted', 'Not used'],
    ['passer 0.8-1.25, role 0.85-1.15', 'fitted with assumed clamps', 'Measured chemistry is not supported by lineup exposure', 'Not used. Additive roles only'],
    ['pace noise 0.08, goalie 0.18, faceoff 0.04, 0.6', 'assumption, unexplained', 'Game flow settings', 'Not used'],
    ['score effects 1.08, 0.95; hot goalie 0.93', 'assumption, unexplained', 'Game flow settings', 'Not used'],
    ['fin fallback [0.4, 0.3, 0.15]', 'assumption', 'Fallback', 'Not used']
  ]);
})(globalThis);

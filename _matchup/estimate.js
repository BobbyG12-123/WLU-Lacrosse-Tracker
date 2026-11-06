// W&L Matchup Studio: parameter estimation helpers. Turns counted evidence into engine parameters, recording every input's class,
// units, source and sample. Provider-independent: opponent numbers arrive as a plain team-totals object from any import.
(function (g) {
  const MS = g.MS = g.MS || {};
  const C = MS.CONSTANTS;
  function betaPosterior(k, n, mu, kappa) { return { a: k + kappa * mu, b: n - k + kappa * (1 - mu) }; }
  // Provisional equal-schedule matchup for comparable opposition. Not a fitted model; never used silently.
  function faceoffMatchup(a, b) { return a * (1 - b) / (a * (1 - b) + b * (1 - a)); }
  function buildInputRow(name, value, cls, units, source, n, extra) { return Object.assign({ name, value, cls, units, source, n: n === undefined ? null : n }, extra || {}); }
  // Beta-binomial prior weight by method of moments. Returns the method used so a report can say so.
  function fitKappa(rows, minN) {
    const use = rows.filter(x => x.n >= (minN || 30));
    if (use.length < 4) return { kappa: C.kappaDefault.value, method: 'fallback', players: use.length, note: `Only ${use.length} players with enough shots; assumed weight used.` };
    const K = use.reduce((a, x) => a + x.k, 0), N = use.reduce((a, x) => a + x.n, 0), mu = K / N;
    const m = use.length, nbar = N / m, S2 = use.reduce((a, x) => a + x.n * (x.k / x.n - mu) ** 2, 0) / (m - 1);
    const n0 = (N - use.reduce((a, x) => a + x.n * x.n, 0) / N) / (m - 1), base = mu * (1 - mu), between = (S2 - base) / n0;
    if (between <= 0) return { kappa: C.kappaCeiling.value, method: 'moments', players: m, note: 'No spread beyond chance measured; ceiling weight used.', nbar };
    const kappa = Math.min(C.kappaCeiling.value, Math.max(C.kappaFloor.value, base / between - 1));
    return { kappa, method: 'moments', players: m, nbar, note: null };
  }
  const pairB = (k, n, mu, w) => betaPosterior(k, n, mu, w);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // Evidence for a team from any source: { shots, sog, goals, pipe, wide, blocked, turnovers, caused, assistedGoals, clears, clearAtt } with nulls where unknown.
  // prior: same keys from a labeled reference. Unknown evidence falls back to the prior with n = 0, shown as Assumed.
  function teamRates(ev, prior, weight, inputs, teamName, srcEv, srcPrior) {
    const row = (nm, k, n, mu, w, units) => {
      const known = k !== null && k !== undefined && n !== null && n !== undefined && n > 0;
      inputs.push(buildInputRow(`${teamName}: ${nm}`, known ? (k + w * mu) / (n + w) : mu, known ? 'observed with prior' : 'assumption', units, known ? `${srcEv}; prior ${srcPrior}, weight ${w}` : `Assumed from ${srcPrior}`, known ? n : 0, { rawK: known ? k : null, prior: mu, priorWeight: w }));
      return known ? pairB(k, n, mu, w) : pairB(0, 0, mu, w);
    };
    const un = x => x.shots - (x.blocked || 0), off = x => un(x) - x.sog;
    return {
      shotVsTO: row('shots vs turnovers', ev.shots, ev.turnovers === null ? null : ev.shots + ev.turnovers, prior.shots / (prior.shots + prior.turnovers), weight, 'shot share of shots plus turnovers'),
      blocked: row('blocked share', ev.blocked, ev.shots, prior.blocked / prior.shots, weight, 'of shots'),
      onGoal: row('on goal share', ev.sog, ev.shots === null ? null : un(ev), prior.sog / un(prior), weight, 'of unblocked shots'),
      finish: row('goals on shots on goal', ev.goals, ev.sog, prior.goals / prior.sog, weight, 'of shots on goal'),
      pipeOfOff: row('pipe share', ev.pipe, ev.shots === null ? null : off(ev), prior.pipe / off(prior), weight, 'of unblocked shots not on goal'),
      caused: row('caused share of turnovers', ev.caused, ev.causedKnown ? ev.turnovers : null, prior.caused / prior.turnovers, weight, 'of turnovers'),
      assist: row('assisted share of goals', ev.assistedGoals, ev.goals, prior.assistedGoals / prior.goals, weight, 'of goals'),
      clear: row('clear success', ev.clears, ev.clearAtt, prior.clears / prior.clearAtt, weight, 'of clear attempts')
    };
  }
  Object.assign(MS, { betaPosterior, faceoffMatchup, buildInputRow, fitKappa, clamp, teamRates });
})(globalThis);

// ---- W&L vs a named opponent: compile engine parameters. Cohorts stay separate; 2026 totals are a labeled historical reference, not 2027 player records. ----
(function (g) {
  const MS = g.MS, C = MS.CONSTANTS;
  const B1 = (k, n) => ({ a: k + 1, b: n - k + 1 });
  const weighted = (mean, w) => ({ a: mean * w, b: (1 - mean) * w });
  const shiftBeta = (p, s) => { const n = p.a + p.b, m = MS.invLogit(MS.logit(p.a / n) + s); return { a: m * n, b: (1 - m) * n }; };
  const v = k => C[k].value;
  const row = MS.buildInputRow;
  const tempoFrom = o => ({ actionMeanSec: (o && o.actionMeanSec) ?? v('actionMeanSec'), faceoffMeanSec: v('faceoffMeanSec'), clearMeanSec: v('clearMeanSec'), looseMeanSec: v('looseMeanSec') });
  const retentionFrom = o => Object.assign({ saveHeld: v('saveHeldByGoalie'), loose: v('looseToShooters'), wide: v('wideToShooters'), blocked: v('blockedToShooters'), turnoverGroundBall: v('turnoverGroundBall') }, o);
  // Failed clears and fouls with the ball are their own engine stages, so they come out of the action-stage turnover count once.
  const nonPlayShare = s => ((s.clearAtt - s.clears) + s.penalties * (1 - v('defenseFoulShare'))) / (s.shots + s.turnovers);
  const netTurnovers = (shots, to, s) => Math.max(0, to - nonPlayShare(s) * (shots + to));
  const penaltiesFrom = () => ({ defenseFoulShare: v('defenseFoulShare'), technicalShare: v('technicalShare'), personalMix: v('personalMix'), nonreleasableShare: v('nonreleasableShare') });

  // ref: official team totals for one season, any source. opp: the same for opponents. Used for clear, foul and caused-turnover references.
  function compileMatchup(ev, cfg) {
    const inputs = [], C0 = ev[cfg.cohort], t = C0.team, label = cfg.cohort === 'practice' ? '2027 practices' : '2027 opponent scrimmages', ref = cfg.reference, rot = cfg.rotation;
    if (!C0.sessions.length) throw new Error('no sessions in cohort ' + cfg.cohort);
    const add = (...a) => inputs.push(row(...a));
    const unb = t.shots - t.blocked, muQ = t.sog / unb, muR = t.goals / t.sog, plist = Object.values(C0.players);
    const kq = MS.fitKappa(plist.map(p => ({ k: p.sog, n: p.shots - p.blocked }))), kr = MS.fitKappa(plist.map(p => ({ k: p.goals, n: p.sog })), 20);
    add('W&L: on goal, team rate', muQ, 'observed', 'shots on goal / unblocked shots', label, unb);
    add('W&L: goals on shots on goal, team rate', muR, 'observed', 'goals / shots on goal', label, t.sog);
    add('W&L: prior weight for on-goal', kq.kappa, kq.method === 'moments' ? 'fitted' : 'assumption', 'prior shots', `${label}: ${kq.method}, ${kq.players} players`, kq.players, { note: kq.note });
    add('W&L: prior weight for finishing', kr.kappa, kr.method === 'moments' ? 'fitted' : 'assumption', 'prior shots on goal', `${label}: ${kr.method}, ${kr.players} players`, kr.players, { note: kr.note });
    const units = rot.attack.concat(...rot.lines.map(l => l.players));
    const blankP = { shots: 0, sog: 0, goals: 0, blocked: 0, turnovers: 0, assists: 0, caused: 0 };
    const cal = cfg.calibration || { onGoal: 0, shotVsTO: 0 };
    const shooters = units.map(j => { const p = C0.players[j] || blankP, n = p.shots - p.blocked; add(`#${j} on goal and finishing`, (p.sog + kq.kappa * muQ) / (n + kq.kappa), p.shots ? 'observed with prior' : 'assumption', 'P(on goal | unblocked), posterior mean', `${label}; prior is team rate`, p.shots, { raw: `${p.goals} goals, ${p.sog} on goal, ${p.shots} shots` });
      return { id: j, share: p.shots + v('usagePriorShots'), q: shiftBeta(MS.betaPosterior(p.sog, n, muQ, kq.kappa), cal.onGoal), r: MS.betaPosterior(p.goals, p.sog, muR, kr.kappa) }; });
    const shares = key => Object.fromEntries(units.map(j => [j, ((C0.players[j] || blankP)[key] || 0) + 1]));
    const dUnit = rot.defense, causedShares = Object.fromEntries(dUnit.map(j => [j, ((ev.practice.players[j] || blankP).caused || 0) + 1]));
    const trackedN = t.shotsWhereTurnoversLogged + t.turnovers;
    if (!t.turnoverSessions) throw new Error('no turnover evidence in cohort ' + cfg.cohort);
    add('W&L: shot share of shots plus turnovers', t.shotsWhereTurnoversLogged / trackedN, 'observed', 'shots / (shots + logged turnovers), sessions with turnovers logged only', `${label}; ${t.turnoverSessions} sessions. Completeness not confirmed`, trackedN);
    const refFoul = s => s.penalties / (s.shots + s.turnovers);
    const W = { id: 'WLU', name: 'Washington and Lee', opposingFinishShift: 0, manUpShift: cfg.manUpShift ?? v('manUpFinishShift'),
      rates: { shotVsTO: shiftBeta(B1(t.shotsWhereTurnoversLogged, t.shotsWhereTurnoversLogged + netTurnovers(t.shotsWhereTurnoversLogged, t.turnovers, ref.wl)), cal.shotVsTO), clear: weighted(ref.wl.clears / ref.wl.clearAtt, v('teamPriorWeight')), blocked: B1(t.blocked, t.shots), pipeOfOff: B1(t.pipe, t.pipe + t.wide), caused: weighted(ref.opp.caused / ref.wl.turnovers, v('teamPriorWeight')), assist: B1(t.assistedGoals, t.goals), foulPerAction: refFoul(ref.wl), teamTurnoverShare: t.turnovers ? 1 - t.turnoversNamed / t.turnovers : 0 },
      shooters, turnoverShares: shares('turnovers'), assistShares: shares('assists'), causedShares, gbShares: null, penaltyShares: null, rotation: rot };
    add('W&L: clear success', ref.wl.clears / ref.wl.clearAtt, 'historical reference', 'clears / attempts', ref.source, ref.wl.clearAtt);
    add('W&L: penalties per action', refFoul(ref.wl), 'historical reference', 'penalties / (shots + turnovers)', ref.source, ref.wl.penalties);
    add('W&L: share of turnovers caused by the opponent', ref.opp.caused / ref.wl.turnovers, 'historical reference', 'opponent caused turnovers / W&L turnovers', `${ref.source}. Scrimmage logs name a cause on 1 of 26 VMI-caused records, so unusable`, ref.wl.turnovers);

    // Opponent: team level unless an import has real players. No invented player ratings.
    const O = ev.byOpponent[cfg.opponent]; if (!O) throw new Error('no logged sessions against ' + cfg.opponent);
    const e = O.opponent, off = cfg.opponentImport || ref.opp, pr = off, srcPr = cfg.opponentImport ? cfg.opponentImport.source : `${ref.source}, W&L's opponents. Not ${cfg.opponent}'s own numbers`;
    const w0 = cfg.opponentPriorWeight ?? v('teamPriorWeight');
    const blockedShare = (ev.practice.team.blocked + ev.opponent_scrimmage.team.blocked) / (ev.practice.team.shots + ev.opponent_scrimmage.team.shots), pipeShare = (ev.practice.team.pipe + ev.opponent_scrimmage.team.pipe) / (ev.practice.team.pipe + ev.practice.team.wide + ev.opponent_scrimmage.team.pipe + ev.opponent_scrimmage.team.wide);
    const prior = Object.assign({ blocked: pr.shots * blockedShare, assistedGoals: pr.assists ?? pr.goals * 0.6 }, pr);
    // caused here means this team's turnovers that its opponents caused. Without an import, that's W&L's caused turnovers on its opponents.
    if (!cfg.opponentImport) prior.caused = ref.wl.caused; const unbPr = prior.shots - prior.blocked; prior.pipe = prior.pipe ?? (unbPr - prior.sog) * pipeShare;
    const ev2 = { shots: e.shots, sog: e.sog, goals: e.goals, pipe: e.pipe, blocked: e.blocked, turnovers: e.turnoverSessions ? e.turnovers : null, caused: e.caused, causedKnown: true, assistedGoals: null, goalsForAssist: null, clears: null, clearAtt: null };
    const shotsTO = { shots: e.shotsWhereTurnoversLogged, turnovers: e.turnoverSessions ? e.turnovers : null };
    const R = MS.teamRates(Object.assign({}, ev2, { shots: e.shots }), prior, w0, inputs, cfg.opponentName, `Our logs of ${cfg.opponentName}, ${O.sessions.join(', ')}`, srcPr);
    const netO = netTurnovers(shotsTO.shots, shotsTO.turnovers, off), netPr = netTurnovers(prior.shots, prior.turnovers, off);
    R.shotVsTO = MS.betaPosterior(shotsTO.shots, shotsTO.shots + netO, prior.shots / (prior.shots + netPr), w0);
    const opp = { id: cfg.opponent, name: cfg.opponentName, level: 'team', manUpShift: cfg.manUpShift ?? v('manUpFinishShift'), opposingFinishShift: 0,
      rates: { shotVsTO: R.shotVsTO, clear: R.clear, blocked: R.blocked, pipeOfOff: R.pipeOfOff, caused: R.caused, assist: R.assist, foulPerAction: refFoul(off), teamTurnoverShare: 1 },
      shooters: [{ id: MS.TEAM, share: 1, q: R.onGoal, r: R.finish }], turnoverShares: {}, assistShares: {}, causedShares: null, gbShares: null, penaltyShares: null, rotation: { attack: [], lines: [], defense: [], goalie: null, fogo: [] } };
    inputs.push(row(`${cfg.opponentName}: penalties per action`, refFoul(off), 'assumption', 'penalties / (shots + turnovers)', srcPr, off.penalties));

    // Goalies: each side's effect goes on the opposing finishing once. No separate defense effect.
    const savePct = (sv, n) => sv / n, PG = ev.practice.goalies, tot = Object.values(PG).reduce((a, x) => ({ s: a.s + x.saves, g: a.g + x.goals }), { s: 0, g: 0 }), svT = savePct(tot.s, tot.s + tot.g), G = PG[rot.goalie] || { saves: 0, goals: 0 }, k = v('goalieShrinkShots');
    const svG = (G.saves + k * svT) / (G.saves + G.goals + k);
    W.opposingFinishShift = MS.logit(1 - svG) - MS.logit(1 - svT);
    add(`#${rot.goalie} save rate vs team goalies`, svG, 'observed with prior', 'saves / (saves + goals allowed), posterior mean', `2027 practices; team ${svT.toFixed(3)}, prior weight ${k}`, G.saves + G.goals, { raw: `${G.saves} saves, ${G.goals} goals allowed` });
    const oSaves = O.team.sog - O.team.goals, svPrior = pr.saves / (pr.saves + pr.goalsAllowed), svO = (oSaves + k * svPrior) / (O.team.sog + k), svSource = (t.sog - t.goals) / t.sog;
    opp.opposingFinishShift = MS.logit(1 - svO) - MS.logit(1 - svSource);
    inputs.push(row(`${cfg.opponentName}: goalie save rate (team level)`, svO, 'observed with prior', 'saves / (saves + goals allowed), posterior mean', `Our logs, ${oSaves} saves on ${O.team.sog}; prior ${svPrior.toFixed(3)} from ${srcPr}`, O.team.sog));
    add('Save rate W&L shooters faced in this cohort', svSource, 'observed', 'saves / shots on goal', `${label}. Baseline for the opposing goalie adjustment`, t.sog);

    // Faceoffs: logged head-to-head, shrunk toward even. Provisional, not a fitted opponent-adjusted model.
    const fo = ev.faceoffs.byOpponent[cfg.opponent] || { won: 0, att: 0, by: {} }, fw = v('faceoffPriorWeight');
    const faceoff = MS.betaPosterior(fo.won, fo.att, 0.5, fw);
    inputs.push(row('W&L faceoff chance vs opponent', faceoff.a / (faceoff.a + faceoff.b), 'observed with assumed prior', 'P(W&L wins a faceoff)', `Our logs: raw ${fo.won} of ${fo.att} = ${fo.att ? (100 * fo.won / fo.att).toFixed(1) : '—'}%. Blend = (${fo.won} + ${fw} x 0.5) / (${fo.att} + ${fw}) = ${(100 * faceoff.a / (faceoff.a + faceoff.b)).toFixed(1)}%. The prior (50%, weight ${fw}) is an assumption, not a fit`, fo.att));
    const fogo = (rot.fogoPlayers || []).map(j => { const scr = Object.values(ev.faceoffs.byOpponent).reduce((a, x) => a + ((x.by[j] || {}).att || 0), 0); return { id: j, weight: scr + 1 }; });
    W.rotation = Object.assign({}, rot, { fogo }); delete W.rotation.fogoPlayers;

    ['groundBalls', 'penalties', 'clock', 'clears'].forEach(m => inputs.push(row(`Not available: ${m}`, null, 'missing', '—', ev.missing[m], 0)));
    Object.entries(C).forEach(([nm, c]) => inputs.push(row(`Setting: ${nm}`, c.value, c.cls, c.unit, c.source)));
    const P = { uncertainty: cfg.uncertainty || 'posterior', tempo: tempoFrom(cfg.tempo), retention: retentionFrom(cfg.retention), penalties: penaltiesFrom(), faceoff, lineShiftSec: v('lineShiftSec'), clearRequired: v('clearRequiredShare'), teams: [W, opp], overrides: cfg.overrides || [], snapshotHash: MS.hashOf([Object.assign({}, ev, { exportedAt: undefined }), cfg.reference, cfg.opponentImport || null, cfg.rotation, cfg.cohort]) };   // the data, not when it was exported
    if (cfg.opponentImport && cfg.opponentImport.causedByTeam !== undefined) { W.rates.caused = weighted(cfg.opponentImport.causedByTeam / cfg.opponentImport.opponentTurnovers, v('teamPriorWeight')); inputs.push(row('W&L: share of turnovers caused by the opponent (replaces W&L reference)', cfg.opponentImport.causedByTeam / cfg.opponentImport.opponentTurnovers, 'historical reference', `${cfg.opponentName} caused turnovers / its opponents' turnovers`, cfg.opponentImport.source, cfg.opponentImport.opponentTurnovers)); }
    return { P, inputs };
  }

  // Reference game from official team totals only, used to fit tempo and the extra-man shift. Not a validation.
  function referenceParams(ref, o) {
    const t = (s, id) => { const unb = s.shots * 0.974; return { id, name: id, opposingFinishShift: 0, manUpShift: o.manUpShift, rates: { shotVsTO: weighted(s.shots / (s.shots + netTurnovers(s.shots, s.turnovers, s)), 400), clear: weighted(s.clears / s.clearAtt, 400), blocked: weighted(0.026, 400), pipeOfOff: weighted(0.14, 400), caused: weighted(0.5, 400), assist: weighted(s.assists / s.goals, 400), foulPerAction: s.penalties / (s.shots + s.turnovers), teamTurnoverShare: 1 }, shooters: [{ id: MS.TEAM, share: 1, q: weighted(s.sog / unb, 400), r: weighted(s.goals / s.sog, 400) }], turnoverShares: {}, assistShares: {}, causedShares: null, gbShares: null, penaltyShares: null, rotation: { attack: [], lines: [], defense: [], goalie: null, fogo: [] } }; };
    return { uncertainty: 'fixed', tempo: tempoFrom({ actionMeanSec: o.actionMeanSec }), retention: retentionFrom(Object.assign({ turnoverGroundBall: o.turnoverGroundBall ?? v('turnoverGroundBall') }, o.retention)), penalties: penaltiesFrom(), faceoff: weighted(ref.wl.faceoffsWon / (ref.wl.faceoffsWon + ref.opp.faceoffsWon), 400), lineShiftSec: v('lineShiftSec'), clearRequired: o.clearRequired ?? v('clearRequiredShare'), teams: [t(ref.wl, 'REF_W'), t(ref.opp, 'REF_O')] };
  }

  // Calibration from practice to opponent scrimmages, on on-goal share and shots vs turnovers only. Finishing isn't shifted, because
  // the opposing goalie adjustment already covers it. Returned with a leave-one-scrimmage-out test; it's never applied silently.
  function practiceShift(pr, sc) {
    const qp = pr.sog / (pr.shots - pr.blocked), qs = sc.sog / (sc.shots - sc.blocked), sp = pr.shotsWhereTurnoversLogged / (pr.shotsWhereTurnoversLogged + pr.turnovers), ss = sc.shotsWhereTurnoversLogged + sc.turnovers ? sc.shotsWhereTurnoversLogged / (sc.shotsWhereTurnoversLogged + sc.turnovers) : null;
    return { onGoal: MS.logit(qs) - MS.logit(qp), shotVsTO: ss === null ? 0 : MS.logit(ss) - MS.logit(sp) };
  }
  function pool(list) { const o = {}; list.forEach(x => Object.keys(x).forEach(k => { if (typeof x[k] === 'number') o[k] = (o[k] || 0) + x[k]; })); return o; }
  function calibrationTest(ev) {
    const P = ev.practice, ids = Object.keys(ev.scrimmages), ll = (k, n, p) => -(k * Math.log(p) + (n - k) * Math.log(1 - p)), rows = [];
    const qPr = P.team.sog / (P.team.shots - P.team.blocked), sPr = P.team.shotsWhereTurnoversLogged / (P.team.shotsWhereTurnoversLogged + P.team.turnovers);
    let raw = 0, cal = 0, n = 0, rawTO = 0, calTO = 0, nTO = 0;
    ids.forEach(id => {
      const test = ev.scrimmages[id].team, train = pool(ids.filter(x => x !== id).map(x => ev.scrimmages[x].team)), S = practiceShift(P.team, train);
      const un = test.shots - test.blocked, a = ll(test.sog, un, qPr), b = ll(test.sog, un, MS.invLogit(MS.logit(qPr) + S.onGoal)); raw += a; cal += b; n += un;
      const r = { session: id, onGoalShots: un, onGoalLossRaw: a / un, onGoalLossCalibrated: b / un };
      if (test.turnoverSessions && train.turnoverSessions) { const m = test.shotsWhereTurnoversLogged + test.turnovers, c = ll(test.shotsWhereTurnoversLogged, m, sPr), d = ll(test.shotsWhereTurnoversLogged, m, MS.invLogit(MS.logit(sPr) + S.shotVsTO)); rawTO += c; calTO += d; nTO += m; Object.assign(r, { turnoverN: m, turnoverLossRaw: c / m, turnoverLossCalibrated: d / m }); }
      rows.push(r);
    });
    const shift = practiceShift(P.team, ev.opponent_scrimmage.team);
    return { shift, adopted: { onGoal: cal < raw ? shift.onGoal : 0, shotVsTO: calTO < rawTO ? shift.shotVsTO : 0 }, rows, onGoal: { n, lossRaw: raw / n, lossCalibrated: cal / n, helped: cal < raw }, shotVsTO: { n: nTO, lossRaw: nTO ? rawTO / nTO : null, lossCalibrated: nTO ? calTO / nTO : null, helped: calTO < rawTO }, note: `Only ${ids.length} scrimmages. Low power; this can't validate game prediction.` };
  }
  Object.assign(MS, { compileMatchup, referenceParams, calibrationTest, practiceShift });
})(globalThis);

// Model v2 candidate: opponent-adjusted team strengths and team-specific ball control. All inputs use only games dated before the game.
// Doesn't change validate.js, which stays the record of v1. Every setting named here is classified in the v2 protocol.
(function (g) {
  const MS = g.MS, C = MS.CONSTANTS, v = k => C[k].value;
  const BLOCKED = 0.026, PIPE_OF_OFF = 0.14;
  const non = x => (x.clearAtt - x.clears) + x.penalties * (1 - v('defenseFoulShare'));
  const STATS = {
    q: (s) => [s.sog, s.shots * (1 - BLOCKED)],
    r: (s) => [s.goals, s.sog],
    s: (s) => [s.shots, s.shots + Math.max(1, s.turnovers - non(s))],
    clear: (s) => [s.clears, s.clearAtt],
    fo: (s, o) => [s.faceoffsWon, s.faceoffsWon + o.faceoffsWon],
    ctl: (s, o) => [s.shots + s.turnovers, s.shots + s.turnovers + o.shots + o.turnovers]
  };
  // Ridge two-way fit on the logit scale, weighted by information. lambda is in the same units as n (shots, for example).
  function fitStat(games, def, lambda) {
    const rows = [], teams = new Set(); let K = 0, N = 0;
    games.forEach(G => [[G.a, G.b, G.aStats, G.bStats], [G.b, G.a, G.bStats, G.aStats]].forEach(([t, o, x, y]) => { const [k, n] = def(x, y); if (!(n > 0)) return; const kk = Math.min(Math.max(k, 0), n); rows.push({ t, o, k: kk, n }); K += kk; N += n; teams.add(t); teams.add(o); }));
    const p0 = Math.min(0.98, Math.max(0.02, K / N)), mu = MS.logit(p0), info = p0 * (1 - p0), own = {}, opp = {}, ownN = {}; teams.forEach(t => { own[t] = 0; opp[t] = 0; ownN[t] = 0; });
    rows.forEach(r => { r.y = MS.logit((r.k + 0.5) / (r.n + 1)); r.w = r.n * info; ownN[r.t] += r.n; });
    const lam = lambda * info;
    for (let it = 0; it < 25; it++) { const a = {}, b = {}, wa = {}, wb = {}; rows.forEach(r => { a[r.t] = (a[r.t] || 0) + r.w * (r.y - mu - opp[r.o]); wa[r.t] = (wa[r.t] || 0) + r.w; }); teams.forEach(t => { own[t] = wa[t] ? a[t] / (wa[t] + lam) : 0; }); rows.forEach(r => { b[r.o] = (b[r.o] || 0) + r.w * (r.y - mu - own[r.t]); wb[r.o] = (wb[r.o] || 0) + r.w; }); teams.forEach(t => { opp[t] = wb[t] ? b[t] / (wb[t] + lam) : 0; }); }
    return { mu, own, opp, ownN, lambda, rate: (a, z) => MS.invLogit(mu + (own[a] || 0) + (opp[z] || 0)), effect: (a, z) => (own[a] || 0) + (opp[z] || 0), n: t => ownN[t] || 0 };
  }
  const before = (games, date) => games.filter(G => G.date < date && MS.gameComplete(G.aStats) && MS.gameComplete(G.bStats));
  const beta = (m, n) => ({ a: m * n, b: (1 - m) * n });
  function paramsV2(a, z, gamesBefore, S, opt) {
    const lam = opt.lambda, fit = {}; for (const k of Object.keys(STATS)) fit[k] = fitStat(gamesBefore, STATS[k], k === 'fo' ? v('faceoffPriorWeight') : k === 'ctl' ? lam * 4 : lam);
    const H = MS.historyBefore(gamesBefore, '9999'), L = H.league;
    const T = (me, ot) => { const t = H.teams[me], N = f => fit[f].n(me) + lam; return { id: me, name: me, opposingFinishShift: 0, manUpShift: S.manUpShift, retentionShift: opt.beta * fit.ctl.effect(me, ot),
      rates: { shotVsTO: beta(fit.s.rate(me, ot), N('s')), clear: beta(fit.clear.rate(me, ot), N('clear')), blocked: beta(BLOCKED, 400), pipeOfOff: beta(PIPE_OF_OFF, 400), caused: beta(0.5, 400), assist: MS.betaPosterior(t.assists, t.goals, L.assists / L.goals, lam), foulPerAction: (t.penalties + lam * L.penalties / (L.shots + L.turnovers)) / (t.shots + t.turnovers + lam), teamTurnoverShare: 1 },
      shooters: [{ id: MS.TEAM, share: 1, q: beta(fit.q.rate(me, ot), N('q')), r: beta(fit.r.rate(me, ot), N('r')) }], turnoverShares: {}, assistShares: {}, causedShares: null, gbShares: null, penaltyShares: null, rotation: { attack: [], lines: [], defense: [], goalie: null, fogo: [] } }; };
    const pf = fit.fo.rate(a, z), nf = fit.fo.n(a) + fit.fo.n(z) + 2 * v('faceoffPriorWeight');
    return { uncertainty: 'posterior', tempo: { actionMeanSec: S.actionMeanSec, faceoffMeanSec: v('faceoffMeanSec'), clearMeanSec: v('clearMeanSec'), looseMeanSec: v('looseMeanSec') }, retention: { saveHeld: v('saveHeldByGoalie'), loose: v('looseToShooters'), wide: v('wideToShooters'), blocked: v('blockedToShooters'), turnoverGroundBall: S.turnoverGroundBall }, penalties: { defenseFoulShare: v('defenseFoulShare'), technicalShare: v('technicalShare'), personalMix: v('personalMix'), nonreleasableShare: v('nonreleasableShare') }, faceoff: beta(pf, nf), lineShiftSec: v('lineShiftSec'), clearRequired: S.clearRequired, teams: [T(a, z), T(z, a)] };
  }
  function testGameV2(G, gamesAll, S, opt) {
    const prior = before(gamesAll, G.date), H = MS.historyBefore(prior, '9999'), P = paramsV2(G.a, G.b, prior, S, opt), seed = MS.hash32(`${G.date}|${G.a}|${G.b}`, opt.seed), r = MS.runBatch(P, { seed, games: opt.games, chunk: opt.games }), T = r.summary.teams, a = G.aStats.goals, b = G.bStats.goals;
    return { date: G.date, a: G.a, b: G.b, aGoals: a, bGoals: b, y: a > b ? 1 : a < b ? 0 : 0.5, model: T[0].winProbability, baseline: MS.baselineGD(G.a, G.b, H), coin: 0.5, simA: T[0].avgScore, simB: T[1].avgScore, simMargin: T[0].avgMargin, marginRange: T[0].marginRange, scoreRangeA: T[0].scoreRange, scoreRangeB: T[1].scoreRange, simShotsA: T[0].shots, simShotsB: T[1].shots, actualShotsA: G.aStats.shots, actualShotsB: G.bStats.shots, invalid: r.record.invalidGames, completed: r.record.completedGames, historyA: H.teams[G.a].n, historyB: H.teams[G.b].n };
  }
  function evaluate(rows) { const within = (x, r) => x >= r.p10 && x <= r.p90, n = rows.length, M = rows.map(r => r.simMargin), Y = rows.map(r => r.aGoals - r.bGoals), mean = a => a.reduce((x, y) => x + y, 0) / a.length, sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }, mm = mean(M), my = mean(Y); const slope = M.reduce((s, x, i) => s + (x - mm) * (Y[i] - my), 0) / M.reduce((s, x) => s + (x - mm) ** 2, 0), D = rows.filter(r => r.y !== 0.5); return { n, coverage: rows.filter(r => within(r.aGoals - r.bGoals, r.marginRange)).length / n, coverageScores: rows.reduce((t, r) => t + (within(r.aGoals, r.scoreRangeA) ? 1 : 0) + (within(r.bGoals, r.scoreRangeB) ? 1 : 0), 0) / (2 * n), marginError: mean(rows.map(r => Math.abs(r.simMargin - (r.aGoals - r.bGoals)))), residualSd: Math.sqrt(mean(rows.map(r => (r.simMargin - (r.aGoals - r.bGoals)) ** 2))), marginSlope: slope, predictedMarginSd: sd(M), actualMarginSd: sd(Y), brier: MS.score(D, 'model').brier, logLoss: MS.score(D, 'model').logLoss, accuracy: MS.score(D, 'model').accuracy, baselineBrier: MS.score(D, 'baseline').brier, calibrationSlope: MS.slopeFit(D, 'model').slope }; }
  Object.assign(MS, { fitStat, paramsV2, testGameV2, evaluateRows: evaluate, gamesBefore: before, V2_STATS: STATS });
})(globalThis);

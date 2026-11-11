// W&L Matchup Studio: opponent-specific, pre-game validation. Inputs for a game use only rows dated before it. See docs/VALIDATION_PROTOCOL.md.
(function (g) {
  const MS = g.MS, C = MS.CONSTANTS, v = k => C[k].value;
  const FIELDS = ['goals', 'assists', 'shots', 'sog', 'gb', 'turnovers', 'faceoffsWon', 'clears', 'clearAtt', 'penalties', 'emGoals'];
  const complete = s => ['goals', 'shots', 'sog', 'turnovers', 'faceoffsWon', 'clears', 'clearAtt', 'penalties'].every(k => s[k] !== null && s[k] !== undefined);
  const blank = () => { const o = { n: 0, ag: {} }; FIELDS.forEach(k => { o[k] = 0; o.ag[k] = 0; }); return o; };
  const addTo = (o, us, them) => { o.n++; FIELDS.forEach(k => { o[k] += us[k] || 0; o.ag[k] += them[k] || 0; }); };
  // Strictly before the date. This is the only door to history.
  function historyBefore(games, date) {
    const teams = {}, league = blank(), margins = [];
    games.forEach(G => { if (G.date >= date || !complete(G.aStats) || !complete(G.bStats)) return; addTo(teams[G.a] || (teams[G.a] = blank()), G.aStats, G.bStats); addTo(teams[G.b] || (teams[G.b] = blank()), G.bStats, G.aStats); addTo(league, G.aStats, G.bStats); addTo(league, G.bStats, G.aStats); margins.push(G.aStats.goals - G.bStats.goals); });
    return { teams, league, margins };
  }
  const B = (k, n, mu, w) => MS.betaPosterior(k, n, mu, w);
  const shiftBeta = (p, s) => { const n = p.a + p.b, m = MS.invLogit(MS.logit(p.a / n) + s); return { a: m * n, b: (1 - m) * n }; };
  const weighted = (m, n) => ({ a: m * n, b: (1 - m) * n });
  const BLOCKED = 0.026, PIPE_OF_OFF = 0.14;   // Tracker logs only; classified as assumptions for official-data teams, which don't report them.
  function teamFrom(id, s, o, L, S) {
    const w = v('teamPriorWeight'), netShare = (shots, to, x) => { const non = (x.clearAtt - x.clears) + x.penalties * (1 - v('defenseFoulShare')); return { shots, net: Math.max(1, to - non) }; };
    const unb = x => x.shots * (1 - BLOCKED), Lq = L.sog / unb(L), Lr = L.goals / L.sog, nL = netShare(L.shots, L.turnovers, L), Ls = nL.shots / (nL.shots + nL.net);
    const me = netShare(s.shots, s.turnovers, s), ag = netShare(o.ag.shots, o.ag.turnovers, o.ag);
    const sOwn = B(me.shots, me.shots + me.net, Ls, w), sAg = (ag.shots + w * Ls) / (ag.shots + ag.net + w), LsAg = Ls;
    return { id, name: id, opposingFinishShift: 0, manUpShift: S.manUpShift, rates: { shotVsTO: shiftBeta(sOwn, MS.logit(sAg) - MS.logit(LsAg)), clear: B(s.clears, s.clearAtt, L.clears / L.clearAtt, w), blocked: weighted(BLOCKED, 400), pipeOfOff: weighted(PIPE_OF_OFF, 400), caused: weighted(0.5, 400), assist: B(s.assists, s.goals, L.assists / L.goals, w), foulPerAction: (s.penalties + w * L.penalties / (L.shots + L.turnovers)) / (s.shots + s.turnovers + w), teamTurnoverShare: 1 },
      shooters: [{ id: MS.TEAM, share: 1, q: B(Math.min(s.sog, unb(s)), unb(s), Lq, w), r: B(s.goals, s.sog, Lr, w) }], turnoverShares: {}, assistShares: {}, causedShares: null, gbShares: null, penaltyShares: null, rotation: { attack: [], lines: [], defense: [], goalie: null, fogo: [] } };
  }
  function paramsForGame(a, b, H, S) {
    const L = H.league, A = H.teams[a], Z = H.teams[b], TA = teamFrom(a, A, A, L, S), TB = teamFrom(b, Z, Z, L, S), k = v('goalieShrinkShots');
    const Lsv = 1 - L.goals / L.sog, sv = x => ((x.ag.sog - x.ag.goals) + k * Lsv) / (x.ag.sog + k);
    TA.opposingFinishShift = MS.logit(1 - sv(A)) - MS.logit(1 - Lsv); TB.opposingFinishShift = MS.logit(1 - sv(Z)) - MS.logit(1 - Lsv);
    // Replaces the placeholder from teamFrom: A's turnover rate meets B's defensive history, and the reverse.
    const swap = (me, mine, opp) => { const w = v('teamPriorWeight'), non = x => (x.clearAtt - x.clears) + x.penalties * (1 - v('defenseFoulShare')), Ls = L.shots / (L.shots + Math.max(1, L.turnovers - non(L))), own = B(mine.shots, mine.shots + Math.max(1, mine.turnovers - non(mine)), Ls, w), ag = opp.ag, sAg = (ag.shots + w * Ls) / (ag.shots + Math.max(1, ag.turnovers - non(ag)) + w); me.rates.shotVsTO = shiftBeta(own, MS.logit(sAg) - MS.logit(Ls)); };
    swap(TA, A, Z); swap(TB, Z, A);
    const fr = x => { const att = x.faceoffsWon + x.ag.faceoffsWon, fw = v('faceoffPriorWeight'); return { p: (x.faceoffsWon + fw * 0.5) / (att + fw), n: att + fw }; }, fa = fr(A), fb = fr(Z), p = MS.faceoffMatchup(fa.p, fb.p);
    return { uncertainty: 'posterior', tempo: { actionMeanSec: S.actionMeanSec, faceoffMeanSec: v('faceoffMeanSec'), clearMeanSec: v('clearMeanSec'), looseMeanSec: v('looseMeanSec') }, retention: { saveHeld: v('saveHeldByGoalie'), loose: v('looseToShooters'), wide: v('wideToShooters'), blocked: v('blockedToShooters'), turnoverGroundBall: S.turnoverGroundBall }, penalties: { defenseFoulShare: v('defenseFoulShare'), technicalShare: v('technicalShare'), personalMix: v('personalMix'), nonreleasableShare: v('nonreleasableShare') }, faceoff: weighted(p, fa.n + fb.n), lineShiftSec: v('lineShiftSec'), clearRequired: S.clearRequired, teams: [TA, TB] };
  }
  function phi(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function baselineGD(a, b, H) { const gd = x => { const t = H.teams[x]; return ((t.goals - t.ag.goals) / t.n) * (t.n / (t.n + 3)); }, m = H.margins, mean = 0, sd = Math.sqrt(m.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, m.length)); return phi((gd(a) - gd(b)) / Math.max(1, sd)); }
  const brier = (p, y) => (p - y) ** 2, ll = (p, y) => { const q = Math.min(0.999, Math.max(0.001, p)); return -(y * Math.log(q) + (1 - y) * Math.log(1 - q)); };
  function slopeFit(rows, key) { let a = 0, s = 1; for (let it = 0; it < 50; it++) { let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0; rows.forEach(r => { const q = Math.min(0.999, Math.max(0.001, r[key])), x = MS.logit(q), p = MS.invLogit(a + s * x), w = p * (1 - p); g0 += r.y - p; g1 += (r.y - p) * x; h00 += w; h01 += w * x; h11 += w * x * x; }); const det = h00 * h11 - h01 * h01; if (Math.abs(det) < 1e-9) break; const da = (h11 * g0 - h01 * g1) / det, ds = (h00 * g1 - h01 * g0) / det; a += da; s += ds; if (Math.abs(da) + Math.abs(ds) < 1e-8) break; } return { intercept: a, slope: s }; }
  function score(rows, key) { const n = rows.length; if (!n) return null; const m = f => rows.reduce((t, r) => t + f(r), 0) / n; return { n, brier: m(r => brier(r[key], r.y)), logLoss: m(r => ll(r[key], r.y)), accuracy: m(r => ((r[key] > 0.5 ? 1 : r[key] < 0.5 ? 0 : 0.5) === r.y ? 1 : r[key] === 0.5 ? 0.5 : 0)) }; }
  function bootstrapDiff(rows, kA, kB, N, seed) { const u = MS.makeStreams(seed)('boot'), n = rows.length, D = rows.map(r => brier(r[kA], r.y) - brier(r[kB], r.y)), out = []; for (let i = 0; i < N; i++) { let t = 0; for (let j = 0; j < n; j++) t += D[Math.floor(u() * n)]; out.push(t / n); } out.sort((a, b) => a - b); return { mean: D.reduce((a, b) => a + b, 0) / n, lo: out[Math.floor(0.05 * N)], hi: out[Math.floor(0.95 * N)] }; }
  function reliability(rows, key) { const bins = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0001]]; return bins.map(([lo, hi]) => { const x = rows.filter(r => r[key] >= lo && r[key] < hi); return { range: `${lo}-${Math.min(hi, 1).toFixed(1)}`, n: x.length, predicted: x.length ? x.reduce((t, r) => t + r[key], 0) / x.length : null, actual: x.length ? x.reduce((t, r) => t + r.y, 0) / x.length : null }; }); }
  // One test game. Uses a seed from the run seed and the game, so nothing depends on run order.
  function testGame(G, H, S, opt) {
    const P = paramsForGame(G.a, G.b, H, S), seed = MS.hash32(`${G.date}|${G.a}|${G.b}`, opt.seed), r = MS.runBatch(P, { seed, games: opt.games, chunk: opt.games }), T = r.summary.teams, a = G.aStats.goals, b = G.bStats.goals;
    return { date: G.date, a: G.a, b: G.b, aLocation: G.aLocation, aGoals: a, bGoals: b, y: a > b ? 1 : a < b ? 0 : 0.5, model: T[0].winProbability, baseline: baselineGD(G.a, G.b, H), coin: 0.5, simA: T[0].avgScore, simB: T[1].avgScore, simMargin: T[0].avgMargin, marginRange: T[0].marginRange, scoreRangeA: T[0].scoreRange, scoreRangeB: T[1].scoreRange, invalid: r.record.invalidGames, completed: r.record.completedGames, historyA: H.teams[G.a].n, historyB: H.teams[G.b].n };
  }
  Object.assign(MS, { historyBefore, paramsForGame, baselineGD, slopeFit, score, bootstrapDiff, reliability, testGame, gameComplete: complete });
})(globalThis);

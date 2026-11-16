// Engine v3 backtest (team level). Protocol: docs/BACKTEST_V3.md. Reads a LacrosseReference team export (the records the
// tracker stores) and its meta; writes results to an output folder. Nothing is read from or written to the tracker.
// Usage (from matchup/): deno run --check=none --allow-read --allow-write v3/tools_v3_backtest.js <lr_teams.json> <lr_meta.json> <outDir> <mode> [sims]
//   mode: dev   = grid on games before 2026-04-01
//         hold  = score games on/after 2026-04-01 with the settings in <outDir>/settings.json (written by dev)
await import(new URL('./model.js', import.meta.url)); await import(new URL('./engine.js', import.meta.url));
const V3 = globalThis.MS.V3;
const [teamsPath, metaPath, outDir, mode, simsArg, gridArg] = Deno.args, SIMS = Number(simsArg) || 1000;
// Optional grid override for development runs: '{"lam":[...],"form":[...]}' (see the protocol's deviation note).
const GRID = Object.assign({ lam: [100, 200, 400, 800, 1600], form: [0, 0.1, 0.15, 0.2, 0.25, 0.3] }, gridArg ? JSON.parse(gridArg) : {});
const T = JSON.parse(Deno.readTextFileSync(teamsPath)), meta = JSON.parse(Deno.readTextFileSync(metaPath));
const SPLIT = Date.UTC(2026, 3, 1) / 1000;
const logit = p => Math.log(p / (1 - p)), unlogit = x => 1 / (1 + Math.exp(-x));

// ---- games: one row per game, both sides ----
const byId = {};
for (const t of T) for (const g of t.games || []) {
  if (!String(g.status || '').startsWith('completed')) continue;
  const m = /([WLT])\s*(\d+)-(\d+)/.exec(g.score_str_html || ''); if (!m) continue;
  (byId[g.ID] = byId[g.ID] || []).push({ team: t.id, opp: g.opponentID, gf: +m[2], ga: +m[3], eff: g.off_efficiency, fo: g.faceoff_win_rate, home: g.home_ID, ep: g.game_epoch, lrHome: g.pregame_home_wp });
}
const games = [];
for (const [id, v] of Object.entries(byId)) {
  if (v.length !== 2) continue; const [a, b] = v[0].home === v[0].team ? v : [v[1], v[0]];
  if (a.home !== a.team || a.gf !== b.ga || a.ga !== b.gf) continue; // home side first; scores must agree
  // Each team's own possessions (goals / its offensive efficiency): LacrosseReference's counts differ between the two teams
  // (mean gap ~12), so one shared count is wrong for both. A team with 0 goals has no efficiency: it gets the other count.
  // Fix of Nov 16 (see the protocol's third note): the first holdout run averaged the two, which broke every fit after one
  // 30-1 game (a scoring rate over 100%).
  let ph = a.eff > 0 ? a.gf / a.eff : null, pv = b.eff > 0 ? b.gf / b.eff : null; ph = ph || pv; pv = pv || ph;
  if (!ph || !pv || ph < 15 || pv < 15 || ph > 80 || pv > 80) continue;
  ph = Math.max(ph, a.gf + 1); pv = Math.max(pv, a.ga + 1);
  games.push({ id: +id, ep: a.ep, h: a.team, a: b.team, hg: a.gf, ag: a.ga, ph, pv, poss: (ph + pv) / 2, fo: a.fo != null ? a.fo : (b.fo != null ? 1 - b.fo : null), lrHome: a.lrHome });
}
games.sort((x, y) => x.ep - y.ep || x.id - y.id);

// ---- ratings from earlier games only ----
// Goals per possession on the log-odds scale: y = mu + o[off] + d[def] + h*(+1 home offense, -1 away offense), weight = possessions.
// Ridge pull of o and d toward 0 with weight lam (possessions). Faceoffs: f[a] - f[b] + hf, weight = draws.
function fit(prior, lam) {
  const rows = [], fr = [];
  for (const g of prior) {
    rows.push({ o: g.h, d: g.a, s: 1, y: logit((g.hg + 0.5) / (g.ph + 1)), w: g.ph }, { o: g.a, d: g.h, s: -1, y: logit((g.ag + 0.5) / (g.pv + 1)), w: g.pv });
    if (g.fo != null) { const n = g.hg + g.ag + 4; fr.push({ a: g.h, b: g.a, y: logit((g.fo * n + 0.5) / (n + 1)), w: n }); }
  }
  if (rows.some(r => !isFinite(r.y) || !isFinite(r.w)) || fr.some(r => !isFinite(r.y))) throw new Error('non-finite rating input');
  const o = {}, d = {}, f = {}; let mu = 0, h = 0, hf = 0;
  for (let it = 0; it < 40; it++) {
    let sw = 0, sr = 0; rows.forEach(r => { sw += r.w; sr += r.w * (r.y - (o[r.o] || 0) - (d[r.d] || 0) - h * r.s); }); mu = sr / sw;
    sr = 0; rows.forEach(r => { sr += r.w * r.s * (r.y - mu - (o[r.o] || 0) - (d[r.d] || 0)); }); h = sr / sw;
    const no = {}, wo = {}, nd = {}, wd = {};
    rows.forEach(r => { const e = r.y - mu - (d[r.d] || 0) - h * r.s; no[r.o] = (no[r.o] || 0) + r.w * e; wo[r.o] = (wo[r.o] || 0) + r.w; });
    Object.keys(no).forEach(k => { o[k] = no[k] / (wo[k] + lam); });
    rows.forEach(r => { const e = r.y - mu - (o[r.o] || 0) - h * r.s; nd[r.d] = (nd[r.d] || 0) + r.w * e; wd[r.d] = (wd[r.d] || 0) + r.w; });
    Object.keys(nd).forEach(k => { d[k] = nd[k] / (wd[k] + lam); });
    // faceoffs
    let fw = 0, fs = 0; fr.forEach(r => { fw += r.w; fs += r.w * (r.y - (f[r.a] || 0) + (f[r.b] || 0)); }); hf = fw ? fs / fw : 0;
    const nf = {}, wf = {};
    fr.forEach(r => { const e = r.y - hf; nf[r.a] = (nf[r.a] || 0) + r.w * (e + (f[r.b] || 0)); wf[r.a] = (wf[r.a] || 0) + r.w; nf[r.b] = (nf[r.b] || 0) + r.w * (-e + (f[r.a] || 0)); wf[r.b] = (wf[r.b] || 0) + r.w; });
    Object.keys(nf).forEach(k => { f[k] = nf[k] / (wf[k] + 40); });
  }
  const n = {}, pace = {}; prior.forEach(g => { [g.h, g.a].forEach(t => { n[t] = (n[t] || 0) + 1; pace[t] = (pace[t] || 0) + g.poss; }); });
  const lp = prior.reduce((a, g) => a + g.poss, 0) / prior.length;
  Object.keys(pace).forEach(t => { pace[t] = (pace[t] + 3 * lp) / (n[t] + 3); });
  const W = {}; rows.forEach(r => { W[r.o] = (W[r.o] || 0) + r.w; });
  return { mu, h, hf, o, d, f, n, pace, lp, W };
}

// ---- one game's parameters through v3's own builders ----
const d3 = { eff: null, emo: 0.358231, by_type: meta.sb_league.by_type, pick: meta.sb_league.pick, no_pick: meta.sb_league.no_pick };
function mkTeam(id, R, home, S) {
  // The fit's home term h applies once per possession; v3 multiplies offense by the other team's defense (log5), so each
  // side carries half: home offense +h/2 and the away defense +h/2 give the home offense +h in total.
  const p = R.pace[id] || R.lp, sgn = home ? 1 : -1, hh = S.home ? R.h / 2 : 0;
  const off = unlogit(R.mu + (R.o[id] || 0) + sgn * hh), def = unlogit(R.mu + (R.d[id] || 0) - sgn * hh);
  return { id, name: String(id), roster: [], stats: { adjusted_off_efficiency: off, adjusted_def_efficiency: def, clear_rate: 0.86, adjusted_true_faceoff_win_rate: unlogit((R.f[id] || 0) + sgn * (S.home ? R.hf : 0) / 2) },
    ev: { poss: { per_game: p, off_len: 1800 / p }, emo: { goals: 0, chances: 0 }, mdd: { goals_allowed: 0, chances: 0 }, pens_pg: 0, n_games: R.n[id] }, sb: { fo_by_man: [] } };
}
function params(g, R, S) {
  d3.eff = unlogit(R.mu);
  const H = V3.team(mkTeam(g.h, R, true, S), { d3 }), A = V3.team(mkTeam(g.a, R, false, S), { d3 });
  const P = V3.matchup(H, A, { d3, variance: false }); // the backtest sets its own variation below (and none in the pull step)
  if (S.form != null || S.param) {
    // How sure we are of each level: 1 / sqrt(info) on the log-odds scale, info = p(1-p) * (possessions + lam).
    const u = (id, p) => S.param ? 1 / Math.sqrt(p * (1 - p) * ((R.W[id] || 0) + S.lam)) : 0;
    const uo = [u(g.h, H.adjOff), u(g.a, A.adjOff)], ud = [u(g.h, H.adjDef), u(g.a, A.adjDef)];
    // Same rule as model.js matchup(): level uncertainty (log-odds) scaled to the log of the rate by (1 - rate), plus form.
    const vs = (ul, rate) => Math.sqrt(((1 - rate) * ul) ** 2 + (S.form || 0) ** 2);
    P.var = { sd: [vs(Math.hypot(uo[0], ud[1]), V3.gpp(P.t[0])), vs(Math.hypot(uo[1], ud[0]), V3.gpp(P.t[1]))], fo: S.foForm || 0, pace: S.pace || 0 };
  }
  return P;
}
function simGame(P, seed) {
  const hs = [], as = [], ps = []; let w = 0;
  for (let i = 0; i < SIMS; i++) { const E = V3.simulateGame(P, seed * 7919 + i), e = E[E.length - 1]; hs.push(e.score[0]); as.push(e.score[1]); if (e.score[0] > e.score[1]) w++;
    let n = 0; for (const x of E) if (x.type === 'possession' && x.q < 4) n++; ps.push(n / 2); }
  return { w: w / SIMS, hs, as, ps };
}
const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

// ---- run over a set of games ----
function run(set, S, tag) {
  let cache = { ep: null, R: null }, out = [];
  for (const g of set) {
    const day = Math.floor(g.ep / 86400);
    if (cache.ep !== day) { cache = { ep: day, R: fit(games.filter(x => Math.floor(x.ep / 86400) < day), S.lam) }; }
    const R = cache.R; if ((R.n[g.h] || 0) < 3 || (R.n[g.a] || 0) < 3) continue;
    const P = params(g, R, S), r = simGame(P, g.id), m = r.hs.map((x, i) => x - r.as[i]), am = g.hg - g.ag;
    const lo = q(m, 0.1), hi = q(m, 0.9), below = m.filter(x => x < am).length + 0.5 * m.filter(x => x === am).length;
    out.push({ id: g.id, ep: g.ep, win: g.hg > g.ag ? 1 : 0, p: Math.min(0.999, Math.max(0.001, r.w)), lr: g.lrHome, am, pm: m.reduce((a, b) => a + b, 0) / m.length, cov: am >= lo && am <= hi ? 1 : 0,
      pit: below / m.length, tot: g.hg + g.ag, ptot: (r.hs.reduce((a, b) => a + b, 0) + r.as.reduce((a, b) => a + b, 0)) / SIMS, simTotSd: sd(r.hs.map((x, i) => x + r.as[i])), simMarSd: sd(m), poss: g.poss, simPossMean: r.ps.reduce((a, b) => a + b, 0) / SIMS, simPossSd: sd(r.ps) });
  }
  return score(out, tag);
}
function score(o, tag) {
  const n = o.length, brier = o.reduce((a, x) => a + (x.p - x.win) ** 2, 0) / n, ll = -o.reduce((a, x) => a + (x.win ? Math.log(x.p) : Math.log(1 - x.p)), 0) / n;
  const L = o.filter(x => x.lr != null), lrBrier = L.reduce((a, x) => a + (x.lr - x.win) ** 2, 0) / L.length, v3OnL = L.reduce((a, x) => a + (x.p - x.win) ** 2, 0) / L.length;
  const mx = o.reduce((a, x) => a + x.pm, 0) / n, my = o.reduce((a, x) => a + x.am, 0) / n;
  const slope = o.reduce((a, x) => a + (x.pm - mx) * (x.am - my), 0) / o.reduce((a, x) => a + (x.pm - mx) ** 2, 0);
  const pit = Array(10).fill(0); o.forEach(x => { pit[Math.min(9, Math.floor(x.pit * 10))]++; });
  const bins = Array.from({ length: 10 }, () => [0, 0, 0]); o.forEach(x => { const b = bins[Math.min(9, Math.floor(x.p * 10))]; b[0]++; b[1] += x.p; b[2] += x.win; });
  // spread of real outcomes around predictions vs simulated spread
  const resTot = sd(o.map(x => x.tot - x.ptot)), resMar = sd(o.map(x => x.am - x.pm)), simTot = Math.sqrt(o.reduce((a, x) => a + x.simTotSd ** 2, 0) / n), simMar = Math.sqrt(o.reduce((a, x) => a + x.simMarSd ** 2, 0) / n);
  const resPoss = sd(o.map(x => x.poss - x.simPossMean)), simPoss = Math.sqrt(o.reduce((a, x) => a + x.simPossSd ** 2, 0) / n);
  return { tag, n, brier, logLoss: ll, lrN: L.length, lrBrier, v3BrierOnLrGames: v3OnL, coverage80: o.reduce((a, x) => a + x.cov, 0) / n, marginSlope: slope, pit: pit.map(c => c / n),
    calib: bins.filter(b => b[0]).map(b => ({ n: b[0], pred: b[1] / b[0], actual: b[2] / b[0] })), spread: { realTotalResidSd: resTot, simTotalSd: simTot, realMarginResidSd: resMar, simMarginSd: simMar, realPossResidSd: resPoss, simPossSd: simPoss }, rows: o };
}
const strip = r => { const x = Object.assign({}, r); delete x.rows; return x; };

Deno.mkdirSync(outDir, { recursive: true });
const dev = games.filter(g => g.ep < SPLIT), hold = games.filter(g => g.ep >= SPLIT);
console.log(`games ${games.length}: development ${dev.length}, holdout ${hold.length}; sims ${SIMS}`);
if (mode === 'dev') {
  const res = [];
  // 1. lam, no variation: lowest log loss
  for (const lam of GRID.lam) { const r = run(dev, { lam, home: true }, `lam ${lam}`); res.push(strip(r)); console.log(r.tag, 'n', r.n, 'brier', r.brier.toFixed(4), 'logloss', r.logLoss.toFixed(4), 'cov80', r.coverage80.toFixed(3), 'slope', r.marginSlope.toFixed(2)); }
  const lam = res.filter(r => r.tag.startsWith('lam')).sort((a, b) => a.logLoss - b.logLoss)[0].tag.split(' ')[1] * 1;
  // 2. pace: match possession spread (no form yet)
  const base = run(dev, { lam, home: true, param: true, form: 0 }, 'pace 0'); const sp = base.spread;
  const extra = Math.max(0, sp.realPossResidSd ** 2 - sp.simPossSd ** 2), pace = Math.sqrt(extra) / (base.rows.reduce((a, x) => a + x.poss, 0) / base.n);
  console.log('poss spread real', sp.realPossResidSd.toFixed(2), 'sim', sp.simPossSd.toFixed(2), '-> pace sd', pace.toFixed(3));
  // 3. form sigma: 80% coverage closest to 0.80
  for (const form of GRID.form) { const r = run(dev, { lam, home: true, param: true, form, pace }, `form ${form}`); res.push(strip(r)); console.log(r.tag, 'brier', r.brier.toFixed(4), 'logloss', r.logLoss.toFixed(4), 'cov80', r.coverage80.toFixed(3), 'slope', r.marginSlope.toFixed(2), 'marSd real/sim', r.spread.realMarginResidSd.toFixed(2), r.spread.simMarginSd.toFixed(2)); }
  const F = res.filter(r => r.tag.startsWith('form')).sort((a, b) => Math.abs(a.coverage80 - 0.8) - Math.abs(b.coverage80 - 0.8) || a.logLoss - b.logLoss)[0];
  const R0 = fit(dev, lam), settings = { lam, pace, form: +F.tag.split(' ')[1], home: true, param: true, homeLogit: R0.h, homeFoLogit: R0.hf, chosenOn: 'development games before 2026-04-01', at: new Date().toISOString() };
  Deno.writeTextFileSync(`${outDir}/settings.json`, JSON.stringify(settings, null, 1)); Deno.writeTextFileSync(`${outDir}/dev_results.json`, JSON.stringify(res, null, 1));
  console.log('settings', JSON.stringify(settings));
} else if (mode === 'joint') {
  // Second deviation (protocol): pull and form chosen together. Rule: among settings whose 80% margin range covers 75-85%
  // of development games, the lowest log loss. Pace from the possession spread as before.
  const res = []; let pace = null;
  for (const lam of GRID.lam) {
    if (pace == null) { const b0 = run(dev, { lam, home: true, param: true, form: 0 }, 'pace'), sp = b0.spread; pace = Math.sqrt(Math.max(0, sp.realPossResidSd ** 2 - sp.simPossSd ** 2)) / (b0.rows.reduce((a, x) => a + x.poss, 0) / b0.n); console.log('pace sd', pace.toFixed(3)); }
    for (const form of GRID.form) { const r = run(dev, { lam, home: true, param: true, form, pace }, `lam ${lam} form ${form}`); res.push(Object.assign(strip(r), { lam, form }));
      console.log(r.tag, 'brier', r.brier.toFixed(4), 'logloss', r.logLoss.toFixed(4), 'cov80', r.coverage80.toFixed(3), 'slope', r.marginSlope.toFixed(2), 'marSd real/sim', r.spread.realMarginResidSd.toFixed(2), r.spread.simMarginSd.toFixed(2)); }
  }
  const okc = res.filter(r => r.coverage80 >= 0.75 && r.coverage80 <= 0.85).sort((a, b) => a.logLoss - b.logLoss), pickR = okc[0] || res.sort((a, b) => Math.abs(a.coverage80 - 0.8) - Math.abs(b.coverage80 - 0.8))[0];
  const R0 = fit(dev, pickR.lam), oS = Object.values(R0.o), sdO = Math.sqrt(oS.reduce((a, x) => a + x * x, 0) / oS.length);
  const settings = { lam: pickR.lam, pace, form: pickR.form, home: true, param: true, homeLogit: R0.h, homeFoLogit: R0.hf, teamOffSd: sdO, chosenOn: 'development games before 2026-04-01 (joint rule)', at: new Date().toISOString() };
  Deno.writeTextFileSync(`${outDir}/settings.json`, JSON.stringify(settings, null, 1)); Deno.writeTextFileSync(`${outDir}/dev_results.json`, JSON.stringify(res, null, 1));
  console.log('settings', JSON.stringify(settings));
} else if (mode === 'inspect') {
  // Diagnostics only (no simulation, no scoring): expected goals from the parameters vs the real score, worst first.
  const S = JSON.parse(Deno.readTextFileSync(`${outDir}/settings.json`)); let cache = { ep: null }, out = [];
  for (const g of hold) { const day = Math.floor(g.ep / 86400); if (cache.ep !== day) cache = { ep: day, R: fit(games.filter(x => Math.floor(x.ep / 86400) < day), S.lam) };
    const R = cache.R; if ((R.n[g.h] || 0) < 3 || (R.n[g.a] || 0) < 3) continue; const P = params(g, R, S);
    const poss = (R.pace[g.h] + R.pace[g.a]) / 2, eh = V3.gpp(P.t[0]) * poss, ea = V3.gpp(P.t[1]) * poss;
    out.push({ id: g.id, h: g.h, a: g.a, nh: R.n[g.h], na: R.n[g.a], real: [g.hg, g.ag], exp: [+eh.toFixed(1), +ea.toFixed(1)], poss: +poss.toFixed(1), realPoss: +g.poss.toFixed(1), oh: +(R.o[g.h] || 0).toFixed(2), dh: +(R.d[g.h] || 0).toFixed(2), oa: +(R.o[g.a] || 0).toFixed(2), da: +(R.d[g.a] || 0).toFixed(2), mu: +R.mu.toFixed(3) }); }
  out.sort((x, y) => Math.abs(y.real[0] + y.real[1] - y.exp[0] - y.exp[1]) - Math.abs(x.real[0] + x.real[1] - x.exp[0] - x.exp[1]));
  const bad = out.filter(x => !isFinite(x.exp[0]) || !isFinite(x.exp[1])); console.log('non-finite', bad.length, JSON.stringify(bad.slice(0, 3)));
  if (bad.length) { const g = hold.find(x => x.id === bad[0].id), day = Math.floor(g.ep / 86400), R = fit(games.filter(x => Math.floor(x.ep / 86400) < day), S.lam), P = params(g, R, S); console.log('first bad', JSON.stringify({ t0: P.t[0], fo: P.fo, f: [R.f[g.h], R.f[g.a]], pace: [R.pace[g.h], R.pace[g.a]] }).slice(0, 1500)); }
  console.log(JSON.stringify(out.filter(x => isFinite(x.exp[0])).slice(0, 3))); const r = out.map(x => x.real[0] + x.real[1] - x.exp[0] - x.exp[1]); console.log('n', out.length, 'resid total sd', Math.sqrt(r.reduce((a, b) => a + b * b, 0) / r.length).toFixed(2));
} else if (mode === 'hold') {
  const S = JSON.parse(Deno.readTextFileSync(`${outDir}/settings.json`));
  const plain = run(hold, { lam: S.lam, home: false }, 'v3 as before (no home, no variation)'), full = run(hold, S, 'v3 calibrated');
  // paired bootstrap of Brier differences
  const boot = (A, B, key) => { const byA = new Map(A.rows.map(x => [x.id, x])), pairs = B.rows.filter(x => byA.has(x.id)).map(x => [byA.get(x.id), x]); const rnd = V3.rng(2026); // (the first version's LCG lost precision in floating point; Nov 16)
    const d = []; for (let b = 0; b < 2000; b++) { let t = 0; for (let i = 0; i < pairs.length; i++) { const [a, c] = pairs[Math.floor(rnd() * pairs.length)]; t += key(c) - key(a); } d.push(t / pairs.length); } d.sort((x, y) => x - y); return { mean: d.reduce((a, b) => a + b, 0) / d.length, lo: d[100], hi: d[1899], n: pairs.length }; };
  const vsPlain = boot(plain, full, x => (x.p - x.win) ** 2);
  const lrRows = full.rows.filter(x => x.lr != null), vsLr = boot({ rows: lrRows.map(x => Object.assign({}, x, { p: x.lr })) }, { rows: lrRows }, x => (x.p - x.win) ** 2);
  const direct = (A, B) => { const m = new Map(A.map(x => [x.id, x])), P = B.filter(x => m.has(x.id)); return P.reduce((a, x) => a + (x.p - x.win) ** 2 - (m.get(x.id).p - x.win) ** 2, 0) / P.length; };
  const out = { settings: S, plain: strip(plain), calibrated: strip(full), brierCalibratedMinusPlain: Object.assign(vsPlain, { direct: direct(plain.rows, full.rows) }), brierCalibratedMinusLR: Object.assign(vsLr, { direct: direct(lrRows.map(x => Object.assign({}, x, { p: x.lr })), lrRows) }) };
  Deno.writeTextFileSync(`${outDir}/holdout_rows.json`, JSON.stringify({ plain: plain.rows, calibrated: full.rows }));
  Deno.writeTextFileSync(`${outDir}/holdout_results.json`, JSON.stringify(out, null, 1));
  for (const r of [plain, full]) console.log(r.tag, 'n', r.n, 'brier', r.brier.toFixed(4), 'logloss', r.logLoss.toFixed(4), 'LR brier same games', r.lrBrier.toFixed(4), 'cov80', r.coverage80.toFixed(3), 'slope', r.marginSlope.toFixed(2), 'marSd real/sim', r.spread.realMarginResidSd.toFixed(2), r.spread.simMarginSd.toFixed(2), 'totSd real/sim', r.spread.realTotalResidSd.toFixed(2), r.spread.simTotalSd.toFixed(2));
  console.log('calibrated - plain brier', JSON.stringify(vsPlain)); console.log('calibrated - LR brier', JSON.stringify(vsLr));
}

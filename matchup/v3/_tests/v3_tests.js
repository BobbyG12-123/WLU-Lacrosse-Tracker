// Engine v3 tests. Synthetic only. Run from the repo root: deno run --check=none --allow-read=. matchup/v3/_tests/v3_tests.js
await import(new URL('../model.js', import.meta.url)); await import(new URL('../engine.js', import.meta.url));
const V3 = globalThis.MS.V3; const results = [];
const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log((cond ? '  OK   ' : '  FAIL ') + name + (cond || info === undefined ? '' : '  ' + JSON.stringify(info).slice(0, 500))); };
const near = (a, b, t) => Math.abs(a - b) <= t;

// ---- synthetic D3 baseline and teams (made up)
const D3 = { eff: 0.26, emo: 0.36, by_type: { transition: { n: 1000, goal_pct: 0.14 }, early: { n: 300, goal_pct: 0.15 }, settled: { n: 2500, goal_pct: 0.26 } }, pick: { n: 700, goal_pct: 0.27 }, no_pick: { n: 1800, goal_pct: 0.255 } };
const side0 = () => ({ by_type: { transition: { n: 100, goal_pct: 0.14 }, early: { n: 30, goal_pct: 0.15 }, settled: { n: 250, goal_pct: 0.26 } }, pick: { n: 70, goal_pct: 0.27 }, no_pick_settled: { n: 180, goal_pct: 0.255 }, pick_dodge: { n: 30, goal_pct: 0.3 }, dodge: { n: 150, goal_pct: 0.3 } });
const filmEff = sd => ['transition', 'early', 'settled'].reduce((a, t) => a + sd.by_type[t].n * sd.by_type[t].goal_pct, 0) / ['transition', 'early', 'settled'].reduce((a, t) => a + sd.by_type[t].n, 0);
function mkTeam(id, name, o) {
  o = o || {};
  const roster = [
    { jersey_number: '1', player: 'Alder Sample', team_listed_class: 'SR', shots: 100, goals: 40, sog_faced: 0 },
    { jersey_number: '2', player: 'Birch Sample', team_listed_class: 'JR', shots: 80, goals: 24, sog_faced: 0 },
    { jersey_number: '3', player: 'Cedar Sample', team_listed_class: 'SO', shots: 60, goals: 15, sog_faced: 0 },
    { jersey_number: '4', player: 'Dogwood Sample', team_listed_class: 'FR', shots: 40, goals: 9, sog_faced: 0 },
    { jersey_number: '30', player: 'Elm Sample', team_listed_class: 'JR', shots: 0, goals: 0, sog_faced: 300, save_pct: 0.5 },
    { jersey_number: '31', player: 'Fir Sample', team_listed_class: 'FR', shots: 0, goals: 0, sog_faced: 100, save_pct: 0.45 }
  ];
  const off = side0(), def = side0();
  return { id, name, roster, stats: { adjusted_off_efficiency: o.off ?? filmEff(off) * 0 + 0.26, adjusted_def_efficiency: o.def ?? 0.26, clear_rate: o.clear ?? 0.88, adjusted_true_faceoff_win_rate: 0.5 },
    ev: { poss: { per_game: 45, off_len: 30 }, pens_pg: 3, emo: { goals: 36, chances: 100 }, mdd: { goals_allowed: 36, chances: 100 } },
    sb: { off, def, fo_by_man: o.fo || [] } };
}
const A0 = mkTeam(1, 'Testa College'), B0 = mkTeam(2, 'Sample State');

// ---- team()
{
  const A = V3.team(A0), R = V3.team(A0, { returning: true }), G = V3.team(A0, { roster: ['2', '30'] });
  ok('shooter shares add to 1', near(A.shooters.reduce((a, s) => a + s.share, 0), 1, 1e-9));
  ok('finishing is pulled toward the team with weight 80 (fitted)', V3.K.shooter === 80 && near(A.shooters[0].fin, (40 + 80 * (88 / 280)) / (100 + 80), 1e-9), A.shooters[0]);
  ok('returning drops SR players and lists who was removed', !R.shooters.some(s => s.j === '1') && R.removed.some(x => x.j === '1') && near(R.shooters.reduce((a, s) => a + s.share, 0), 1, 1e-9));
  ok('a given roster wins over the returning rule', G.shooters.length === 1 && G.shooters[0].j === '2' && G.goalies.length === 1 && G.rosterNote === 'given roster');
  let threw = false; try { V3.team(Object.assign({}, A0, { sb: null })); } catch (e) { threw = true; } ok('a team without film-tag data is refused', threw);
}
// ---- roster turnover
{
  const T = mkTeam(1, 'Testa College', { off: 0.36, def: 0.2 });
  T.roster[0].offensive_EGA = 30; T.roster[1].offensive_EGA = 10; T.roster[2].offensive_EGA = 10; T.roster[3].offensive_EGA = -2; T.roster[4].defensive_EGA = 8; T.roster[5].defensive_EGA = 2;
  T.roster[4].team_listed_class = 'SR';
  let threw = false; try { V3.team(T, { returning: true }); } catch (e) { threw = true; } ok('removing players without the D3 average is refused', threw);
  const R = V3.team(T, { returning: true, d3eff: 0.26 }), F = V3.team(T, { d3eff: 0.26 });
  ok('returning offensive value = kept positive EGA / all positive EGA (20 of 50)', near(R.retOff, 20 / 50, 1e-12) && near(R.retDef, 2 / 10, 1e-12), [R.retOff, R.retDef]);
  const L = p => Math.log(p / (1 - p));
  ok('offense moves toward D3 by the share that left, on the log-odds scale', near(L(R.adjOff), L(0.26) + 0.4 * (L(0.36) - L(0.26)), 1e-9) && R.adjOff < 0.36 && R.adjOff > 0.26);
  ok('full roster keeps the 2026 level exactly', F.adjOff === 0.36 && F.adjDef === 0.2 && F.retOff === 1);
  const N = V3.team(T, { names: ['  birch sample', 'CEDAR SAMPLE', 'Elm Sample'], d3eff: 0.26 });
  ok('a next-season roster is matched by name, not jersey', N.shooters.map(s => s.j).join() === '2,3' && N.goalies.length === 1 && /by name/.test(N.rosterNote), N.shooters.map(s => s.j));
}
// ---- faceoffs
{
  const fa = [['13', 'Alder FO', 60, 40, [['Pine FO', 2, 12, 3], ['Oak FO', 9, 10, 10]]]], fb = [['7', 'Pine FO', 50, 50, [['#13', 1, 3, 12], ['Oak FO', 9, 5, 15]]]];
  const A = V3.team(mkTeam(1, 'Testa College', { fo: fa })), B = V3.team(mkTeam(2, 'Sample State', { fo: fb }));
  const c = V3.foPair(A.fogos[0], B.fogos[0], 1, 2);
  ok('head-to-head is found from either side (12-3)', c.dir && c.dir[0] === 12 && c.dir[1] === 3, c);
  { const L = x => Math.log(x / (1 - x)), want = 1 / (1 + Math.exp(-((85 * L(c.p0) + 15 * L(12.5 / 16) + 10 * L(c.ind[0].p)) / (85 + 15 + 10))));
    ok('head-to-head pulls the chance above the season-record prior, weighted against 85 draws (fitted)', V3.K.fogo === 85 && c.p > c.p0 && near(c.p, want, 1e-12), { c, want }); }
  ok('a common opponent adds an indirect read', c.ind.length === 1 && c.ind[0].via === 'Oak FO');
  const f = V3.faceoffs(A, B); ok('one FOGO each: the game chance is that pair', near(f.p, c.p, 1e-12));
  const none = V3.faceoffs(V3.team(A0), V3.team(B0)); ok('no FOGO data: team season rates, and it says so', near(none.p, 0.5, 1e-12) && /season/.test(none.note));
}
// ---- goalie zones
{
  const shots = []; for (let i = 0; i < 40; i++) shots.push({ goalieJersey: '30', goalX: 0.1, goalY: 0.1, goal: i < 30 ? 1 : 0, onKeeper: 1 }); for (let i = 0; i < 40; i++) shots.push({ goalieJersey: '30', goalX: 0.9, goalY: 0.9, goal: i < 10 ? 1 : 0, onKeeper: 1 });
  const gz = V3.goalieZones(shots).g30 || V3.goalieZones(shots)['30'];
  { const pz = (10 + 8 * 0.5) / 48, want = pz + (40 / 140) * (10 / 40 - pz);
    ok('zone saves: weak low left, strong high right; pool pattern (weight 8), then his own deviation (weight 100)', gz.zr['Low Left'] < gz.base && gz.zr['High Right'] > gz.base && near(gz.zr['Low Left'], want, 1e-12), { zr: gz.zr, want }); }
  // Two goalies: the zone pattern is shared, each level is pulled toward the pool with 150 shots.
  const two = []; for (let i = 0; i < 100; i++) two.push({ goalieJersey: '1', goalX: (i % 3) / 3 + 0.1, goalY: 0.5, goal: i < 40 ? 1 : 0, onKeeper: 1 }); for (let i = 0; i < 50; i++) two.push({ goalieJersey: '2', goalX: (i % 3) / 3 + 0.1, goalY: 0.5, goal: i < 30 ? 1 : 0, onKeeper: 1 });
  const g2 = V3.goalieZones(two), pm = (60 + 20) / 150;
  ok('goalie level is pulled toward the pool with weight 150 (raw kept)', near(g2['1'].base, (60 + 150 * pm) / 250, 1e-12) && near(g2['2'].base, (20 + 150 * pm) / 200, 1e-12) && g2['2'].raw === 0.4, [g2['1'].base, g2['2'].base, g2['2'].raw]);
  ok('a 50-shot goalie at 40% isn\'t rated far below a 100-shot goalie at 60% (gap under 8 points)', g2['1'].base - g2['2'].base > 0 && g2['1'].base - g2['2'].base < 0.08, g2['1'].base - g2['2'].base);
  ok('save rate against a mix is the mix-weighted zone rate', near(V3.saveVs(gz, { 'Low Left': 1 }), gz.zr['Low Left'], 1e-12));
}
// ---- matchup and calibration
const ctx = { d3: D3 };
{
  const P = V3.matchup(V3.team(A0), V3.team(B0), ctx);
  ok('identical average teams get identical rates on both sides', JSON.stringify(P.t[0].rate) === JSON.stringify(P.t[1].rate) && near(P.t[0].noPickRate, P.t[1].noPickRate, 1e-12));
  const wm = P.t[0].shooters.reduce((a, s) => a + s.share * s.m, 0); ok('shooter finishing multipliers average 1 (team level kept)', near(wm, 1, 1e-9), wm);
  const G = V3.runBatch(P, 3000, 5), poss = G.reduce((a, b) => a + b.poss[0] + b.poss[1], 0) / G.length / 2, gpp = G.reduce((a, b) => a + b.score[0] + b.score[1], 0) / G.reduce((a, b) => a + b.poss[0] + b.poss[1], 0);
  ok('possessions per team match the input (45) within 5%', near(poss, 45, 2.3), poss);
  // Expected goals per possession from the parameters: failed-clear possessions are transition, the rest draw from the adjusted shares.
  const q = P.t[0], f = q.failedClearShare, even = k => k === 'transition' ? q.rate.transition : k === 'early' ? q.rate.early : q.pickShare * q.pickRate + (1 - q.pickShare) * q.noPickRate;
  const exp = (1 - q.emoChance) * (f * q.rate.transition + (1 - f) * ['transition', 'early', 'settled'].reduce((a, k) => a + q.shares[k] * even(k), 0)) + q.emoChance * q.emoRate;
  const G2 = V3.runBatch(P, 3000, 5), gpp2 = G2.reduce((a, b) => a + b.score[0] + b.score[1], 0) / G2.reduce((a, b) => a + b.poss[0] + b.poss[1], 0);
  ok('goals per possession match the parameters within 0.006', near(gpp2, exp, 0.006), { gpp2, exp });
  ok('evenly matched teams win about half', near(V3.winPct(G), 0.5, 0.04), V3.winPct(G));
  // Transition share in play matches the film share once failed-clear transitions are counted (no double count).
  let tr = 0, tot = 0; for (let i = 0; i < 1500; i++) for (const e of V3.simulateGame(P, 7000 + i)) if (e.type === 'possession' && e.team === 0 && e.kind !== 'man-up') { tot++; if (e.kind === 'transition') tr++; }
  ok('transition share in play matches the film share within 0.012', near(tr / tot, q.sharesFilm.transition, 0.012), { play: tr / tot, film: q.sharesFilm.transition, f });
  const fc = G2.reduce((a, b) => a + b.failedClears[0], 0) / G2.length;
  ok('failed clears follow the clear rate when no per-game record is given', fc > 0 && near(1 - fc / q.clearAttempts, q.clear, 0.03), { fc, clear: q.clear, att: q.clearAttempts });
}
// ---- determinism, validation, changes
{
  const P = V3.matchup(V3.team(A0), V3.team(B0), ctx);
  ok('same seed gives the same game', JSON.stringify(V3.simulateGame(P, 42)) === JSON.stringify(V3.simulateGame(P, 42)));
  ok('different seeds give different games', JSON.stringify(V3.simulateGame(P, 42)) !== JSON.stringify(V3.simulateGame(P, 43)));
  let bad = 0, first = null; for (let i = 0; i < 2000; i++) { const v = V3.validate(V3.simulateGame(P, 1000 + i)); if (!v.ok) { bad++; first = first || v.errs; } }
  ok('2,000 games pass validation (score from events, no ties, time in order)', bad === 0, first);
  const base = V3.runBatch(P, 1500, 9), same = V3.runBatch(P, 1500, 9, { 'wl.transition': 1, 'opp.six': 1 });
  ok('a change of 1 (no change) gives exactly the same games', JSON.stringify(base) === JSON.stringify(same));
  ok('more faceoffs for us means more wins', V3.winPct(V3.runBatch(P, 1500, 9, { fo: 0.65 })) > V3.winPct(base) + 0.03);
  ok('fewer goals for them means more wins', V3.winPct(V3.runBatch(P, 1500, 9, { 'opp.six': 0.8 })) > V3.winPct(base) + 0.03);
  let threw = false; try { V3.applySets(P, { 'wl.banana': 2 }); } catch (e) { threw = true; } ok('an unknown change is refused', threw);
  ok('changes do not modify the original parameters', (() => { const before = JSON.stringify(P); V3.applySets(P, { fo: 0.9, 'wl.pick': 1.5 }); return JSON.stringify(P) === before; })());
}
// ---- fixes from the formula review
{
  const T = mkTeam(5, 'Testa College'); T.sb.fo_by_man = [['5', 'Old Fogo', 200, 100, []], ['6', 'Young Fogo', 50, 50, []]];
  T.roster.push({ jersey_number: '5', player: 'Old Fogo', team_listed_class: 'SR', shots: 0 }, { jersey_number: '6', player: 'Young Fogo', team_listed_class: 'SO', shots: 0 });
  ok('a next-season roster given by name drops a departed faceoff man', V3.team(T, { names: ['Young Fogo', 'Birch Sample'], d3eff: 0.26 }).fogos.map(f => f.j).join() === '6');
  const U = mkTeam(9, 'Testa College'); U.sb.fo_by_man = [['13', null, 99, 53, []]];
  const Uf = V3.team(U, { names: ['Birch Sample'], namesByJersey: { 13: 'Nutmeg Sample' }, d3eff: 0.26 }).fogos;
  ok('an unnamed FOGO with no roster row is kept, labeled from the next-season roster by number', Uf.length === 1 && Uf[0].name === 'Nutmeg Sample' && /number/.test(Uf[0].nameBy), Uf);
  const E = mkTeam(6, 'Sample State'); E.ev.emo = { goals: 5, chances: 5 }; E.ev.mdd = { goals_allowed: 0, chances: 0 };
  const Pe = V3.matchup(V3.team(E), V3.team(E), ctx); ok('a perfect or empty man-up record stays a real rate (pulled toward D3)', isFinite(Pe.t[0].emoRate) && Pe.t[0].emoRate > 0.36 && Pe.t[0].emoRate < 0.9, Pe.t[0].emoRate);
  const fa = V3.team(mkTeam(1, 'Testa College', { fo: [['13', 'Alder FO', 60, 40, []]] })), fb = V3.team(mkTeam(2, 'Sample State', { fo: [['7', 'Pine FO', 50, 50, []]] }));
  ok('faceoff usage that names nobody falls back to film usage, not 0%', V3.faceoffs(fa, fb, { theirs: { 99: 1 }, ours: { 98: 1 } }).p > 0.4);
  const Z = mkTeam(7, 'Testa College'); Z.roster.forEach(r => { r.goals = 0; });
  const Pz = V3.matchup(V3.team(Z), V3.team(B0), ctx); ok('a team with zero logged goals keeps finite shooter multipliers', Pz.t[0].shooters.every(s => isFinite(s.m) && s.m === 1));
  const P = V3.matchup(V3.team(A0), V3.team(B0), ctx); const wm = P.t[0].shooters.reduce((a, s) => a + s.share * s.m, 0);
  ok('shooter multipliers average exactly 1 on the probability scale', near(wm, 1, 1e-12));
  const shots = []; for (const [j, gr] of [['30', 0.5], ['31', 0.6]]) for (let i = 0; i < 90; i++) shots.push({ goalieJersey: j, goalX: (i % 3) / 3 + 0.1, goalY: (Math.floor(i / 3) % 3) / 3 + 0.1, goal: i < gr * 90 ? 1 : 0, onKeeper: 1 });
  const gz = V3.goalieZones(shots), P31 = V3.matchup(V3.team(A0), V3.team(B0), Object.assign({}, ctx, { wl: { goalieZones: gz, goalie: '31' } }));
  const refSave = (300 * V3.saveVs(gz['30'], Object.fromEntries(V3.ZONES.map(z => [z, 1 / 9]))) + 100 * V3.saveVs(gz['31'], Object.fromEntries(V3.ZONES.map(z => [z, 1 / 9])))) / 400;
  ok('goalie effect = (1 - save in net) / (1 - usual save), on the probability scale', near(P31.t[0].shooters[0].g, (1 - V3.saveVs(gz['31'], Object.fromEntries(V3.ZONES.map(z => [z, 1 / 9])))) / (1 - refSave), 1e-12), P31.t[0].shooters[0].g);
  const flat = { rows: [{ coverage: 'Switch', share: 0.5, ourRate: 0.3, theirRate: 0.25 }, { coverage: 'Go under', share: 0.5, ourRate: 0.3, theirRate: 0.25 }] };
  const Pf = V3.matchup(V3.team(A0), V3.team(B0), Object.assign({}, ctx, { wl: { picks: flat, pickTeams: { off: 0.3, def: 0.25 } } }));
  ok('coverage rows equal to the team rates leave the pick level unchanged', Pf.t[0].cov.every(c => near(c.rate, Pf.t[0].pickRate, 1e-12)), [Pf.t[0].cov[0].rate, Pf.t[0].pickRate]);
  const base = V3.runBatch(P, 2000, 21), more = V3.runBatch(P, 2000, 21, { 'opp.clearfail': 2 });
  ok('more failed clears by them means more wins for us', V3.winPct(more) > V3.winPct(base) + 0.01 && more.reduce((a, b) => a + b.failedClears[1], 0) > 1.6 * base.reduce((a, b) => a + b.failedClears[1], 0));
  const R = mkTeam(8, 'Testa College'); R.ev.failed_clears_pg = 2; const Pr = V3.matchup(V3.team(R), V3.team(B0), ctx), Gr = V3.runBatch(Pr, 3000, 22);
  ok('failed clears per game match the team record (2.0)', near(Gr.reduce((a, b) => a + b.failedClears[0], 0) / Gr.length, 2, 0.15), Gr.reduce((a, b) => a + b.failedClears[0], 0) / Gr.length);
}
// ---- goalie in net and pick coverage
{
  const shots = []; for (const [j, gr] of [['30', 0.4], ['31', 0.6]]) for (let i = 0; i < 100; i++) shots.push({ goalieJersey: j, goalX: (i % 3) / 3 + 0.1, goalY: (Math.floor(i / 3) % 3) / 3 + 0.1, goal: i < gr * 100 ? 1 : 0, onKeeper: 1 });
  const gz = V3.goalieZones(shots), A = V3.team(A0), B = V3.team(B0);
  const P30 = V3.matchup(A, B, Object.assign({}, ctx, { wl: { goalieZones: gz, goalie: '30' } })), P31 = V3.matchup(A, B, Object.assign({}, ctx, { wl: { goalieZones: gz, goalie: '31' } }));
  ok('their better goalie in net lowers our scoring; their weaker one raises it', P30.t[0].shooters[0].g < 1 && P31.t[0].shooters[0].g > 1, [P30.t[0].shooters[0].g, P31.t[0].shooters[0].g]);
  ok('…and that shows in results', V3.winPct(V3.runBatch(P31, 2000, 3)) > V3.winPct(V3.runBatch(P30, 2000, 3)));
  const picks = { rows: [{ coverage: 'Switch', share: 0.5, ourRate: 0.27, theirRate: 0.2 }, { coverage: 'Hedge & recover', share: 0.5, ourRate: 0.27, theirRate: 0.4 }] };
  const Pc = V3.matchup(A, B, Object.assign({}, ctx, { wl: { picks, pickTeams: { off: 0.27, def: 0.3 } } }));
  const G = V3.runBatch(Pc, 3000, 4), tot = c => G.reduce((a, b) => [a[0] + ((b.pickCov[c] || [0, 0])[0]), a[1] + ((b.pickCov[c] || [0, 0])[1])], [0, 0]);
  const sw = tot('Switch'), he = tot('Hedge & recover');
  ok('pick coverage split: our picks score more against the weaker coverage', he[0] / he[1] > sw[0] / sw[1] + 0.1 && near(sw[1] / (sw[1] + he[1]), 0.5, 0.05), { sw, he });
  // Shooter and goalie factors are probability ratios: spreading finishing across shooters must not change team goals.
  const rateOf = Q => { const G2 = V3.runBatch(Q, 4000, 11); return G2.reduce((a, b) => a + b.score[0], 0) / G2.reduce((a, b) => a + b.poss[0], 0); };
  const flatP = V3.matchup(V3.team(A0), V3.team(B0), ctx), sprP = V3.matchup(V3.team(A0), V3.team(B0), ctx);
  flatP.t[0].shooters = [{ j: 'a', share: 1 / 3, m: 1, g: 1 }, { j: 'b', share: 1 / 3, m: 1, g: 1 }, { j: 'c', share: 1 / 3, m: 1, g: 1 }];
  sprP.t[0].shooters = [{ j: 'a', share: 1 / 3, m: 5 / 3, g: 1 }, { j: 'b', share: 1 / 3, m: 1 / 3, g: 1 }, { j: 'c', share: 1 / 3, m: 1, g: 1 }];
  const rf = rateOf(flatP), rs = rateOf(sprP);
  ok('spread-out shooter finishing keeps the team goal rate (probability scale, not odds)', Math.abs(rs - rf) < 0.006, { flat: rf, spread: rs });
  const gP = V3.matchup(V3.team(A0), V3.team(B0), ctx); gP.t[0].shooters = flatP.t[0].shooters.map(x => Object.assign({}, x, { g: 1.2 }));
  const rg = rateOf(gP); ok('a goalie factor of 1.2 raises goals about 20% (probability scale)', Math.abs(rg / rf - 1.2) < 0.04, { flat: rf, g12: rg });
  // ---- calibration: level pull, uncertainty, home field, game-to-game variation (docs/BACKTEST_V3.md)
  const C = V3.CAL, Lg = x => Math.log(x / (1 - x)), Ug = x => 1 / (1 + Math.exp(-x));
  const S1 = mkTeam(5, 'Testa College', { off: 0.34, def: 0.20 }); S1.stats.games_played = 10;
  const same = V3.team(S1, { d3eff: 0.26 }), last = V3.team(S1, { d3eff: 0.26, priorSeason: true }), unk = V3.team(mkTeam(6, 'Sample State', { off: 0.34 }), { d3eff: 0.26 });
  ok('same-season level is pulled toward D3 by possessions / (possessions + lam)', near(Lg(same.adjOff), Lg(0.26) + (450 / (450 + C.lam)) * (Lg(0.34) - Lg(0.26)), 1e-12) && same.info === 450 + C.lam, [same.adjOff, same.info]);
  ok("last season's record keeps its level, counts as priorInfo possessions", last.adjOff === 0.34 && last.info === C.priorInfo && near(last.unc.off, 1 / Math.sqrt(0.34 * 0.66 * C.priorInfo), 1e-12), last);
  ok('a record with no game count is not pulled to D3 (unknown sample)', unk.adjOff === 0.34 && unk.info === C.priorInfo, unk.adjOff);
  ok('more possessions, less uncertainty', same.unc.off < last.unc.off || 450 + C.lam < C.priorInfo);
  const HA = V3.team(A0), HB = V3.team(B0), Pn = V3.matchup(HA, HB, ctx), Ph = V3.matchup(HA, HB, Object.assign({}, ctx, { home: 0 })), Pa = V3.matchup(HA, HB, Object.assign({}, ctx, { home: 1 }));
  ok('home: our offense +home/2 and their defense +home/2 on the log-odds scale (home offense gets +home in total)', near(Lg(Ph.teams[0].adjOff) - Lg(HA.adjOff), C.home / 2, 1e-12) && near(Lg(Ph.teams[1].adjDef) - Lg(HB.adjDef), C.home / 2, 1e-12) && near(Lg(Ph.teams[0].adjDef) - Lg(HA.adjDef), -C.home / 2, 1e-12), [Ph.teams[0].adjOff, HA.adjOff]);
  ok('home: faceoff chance moves by homeFo on the log-odds scale; away is the mirror; neutral unchanged', near(Lg(Ph.fo) - Lg(Pn.fo), C.homeFo, 1e-12) && near(Lg(Pa.fo) - Lg(Pn.fo), -C.homeFo, 1e-12) && Pn.home === null && Ph.home === 0, [Pn.fo, Ph.fo, Pa.fo]);
  ok('the original team objects are not changed by the home edge', HA.adjOff === V3.team(A0).adjOff);
  ok('variation SD = sqrt(((1 - rate) x hypot(our offense unc, their defense unc))^2 + form^2)', near(Pn.var.sd[0], Math.sqrt(((1 - V3.gpp(Pn.t[0])) * Math.hypot(HA.unc.off, HB.unc.def)) ** 2 + C.form ** 2), 1e-12) && Pn.var.pace === C.pace, Pn.var);
  const Pv0 = V3.matchup(HA, HB, Object.assign({}, ctx, { variance: false }));
  ok('variance: false turns it off (same games as before the change)', Pv0.var === null && JSON.stringify(V3.runBatch(Pv0, 5, 3).map(b => b.score)) === JSON.stringify(V3.runBatch(Object.assign({}, Pn, { var: null }), 5, 3).map(b => b.score)));
  const Gv = V3.runBatch(Pn, 3000, 5), G0 = V3.runBatch(Pv0, 3000, 5), sdOf = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const mar = G => G.map(b => b.score[0] - b.score[1]), possN = G => G.map(b => b.poss[0] + b.poss[1]);
  ok('variation widens the margin and possession spread', sdOf(mar(Gv)) > sdOf(mar(G0)) * 1.05 && sdOf(possN(Gv)) > sdOf(possN(G0)) * 1.2, [sdOf(mar(Gv)), sdOf(mar(G0)), sdOf(possN(Gv)), sdOf(possN(G0))]);
  const rate = G => G.reduce((a, b) => a + b.score[0], 0) / G.reduce((a, b) => a + b.poss[0], 0);
  ok('variation keeps the average goal rate (within 1.5%, Monte Carlo noise)', Math.abs(rate(Gv) / rate(G0) - 1) < 0.015, [rate(Gv), rate(G0)]);
  ok('same seed, same game with variation on', JSON.stringify(V3.simulateGame(Pn, 77)) === JSON.stringify(V3.simulateGame(Pn, 77)));
  { const d = []; const r = V3.rng(9); for (let i = 0; i < 20000; i++) d.push(V3.normal(r)); const m = d.reduce((a, b) => a + b, 0) / d.length;
    ok('normal draws have mean 0 and SD 1', Math.abs(m) < 0.03 && Math.abs(sdOf(d) - 1) < 0.03, [m, sdOf(d)]); }
  { const r = V3.rng(4); let a = 0; const N = 40000; for (let i = 0; i < N; i++) a += 1 / V3.gameDraw({ fo: 0.5, var: { sd: [0, 0], fo: 0, pace: 0.3 } }, r).pace;
    ok('pace draws keep the expected number of possessions (mean of 1/length multiplier = 1)', Math.abs(a / N - 1) < 0.005, a / N); }
  { const fa2 = V3.team(mkTeam(1, 'Testa College', { fo: [['13', 'Alder FO', 60, 40, []]] })), fb2 = V3.team(mkTeam(2, 'Sample State', { fo: [['7', 'Pine FO', 50, 50, []]] }));
    const n0 = V3.matchup(fa2, fb2, ctx), h0 = V3.matchup(fa2, fb2, Object.assign({}, ctx, { home: 0 }));
    ok('home edge reaches every head-to-head faceoff cell, so the table matches the headline', near(Lg(h0.foModel.M[0][0].p) - Lg(n0.foModel.M[0][0].p), C.homeFo, 1e-12) && near(h0.foModel.M[0][0].pNeutral, n0.foModel.M[0][0].p, 1e-12), [n0.foModel.M[0][0].p, h0.foModel.M[0][0].p]); }
  { const cal = { home: 0.2, homeFo: 0, form: 0.1, pace: 0 }, Pc2 = V3.matchup(HA, HB, Object.assign({}, ctx, { home: 0, cal }));
    ok('a calibration override (backtest only) is used for home and form', near(Lg(Pc2.teams[0].adjOff) - Lg(HA.adjOff), 0.1, 1e-12) && Pc2.var.pace === 0 && Pc2.var.sd[0] > 0.1, Pc2.var); }
}
const pass = results.filter(r => r.ok).length; console.log(`engine v3: pass ${pass}  fail ${results.length - pass}`); Deno.exit(pass === results.length ? 0 : 1);

// Engine v3 tests. Synthetic only. Run from the repo root: deno run --check=none --allow-read=. _matchup/v3/tests/v3_tests.js
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
  ok('finishing is pulled toward the team with weight 30', near(A.shooters[0].fin, (40 + 30 * (88 / 280)) / (100 + 30), 1e-9), A.shooters[0]);
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
  ok('head-to-head pulls the chance above the season-record prior', c.p > c.p0 && c.p > 0.6, c);
  ok('a common opponent adds an indirect read', c.ind.length === 1 && c.ind[0].via === 'Oak FO');
  const f = V3.faceoffs(A, B); ok('one FOGO each: the game chance is that pair', near(f.p, c.p, 1e-12));
  const none = V3.faceoffs(V3.team(A0), V3.team(B0)); ok('no FOGO data: team season rates, and it says so', near(none.p, 0.5, 1e-12) && /season/.test(none.note));
}
// ---- goalie zones
{
  const shots = []; for (let i = 0; i < 40; i++) shots.push({ goalieJersey: '30', goalX: 0.1, goalY: 0.1, goal: i < 30 ? 1 : 0, onKeeper: 1 }); for (let i = 0; i < 40; i++) shots.push({ goalieJersey: '30', goalX: 0.9, goalY: 0.9, goal: i < 10 ? 1 : 0, onKeeper: 1 });
  const gz = V3.goalieZones(shots).g30 || V3.goalieZones(shots)['30'];
  ok('zone saves: weak low left, strong high right, pulled toward his average', gz.zr['Low Left'] < gz.base && gz.zr['High Right'] > gz.base && near(gz.zr['Low Left'], (10 + 8 * 0.5) / 48, 1e-9), gz.zr);
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
  const target = ['transition', 'early', 'settled'].reduce((a, t) => a, 0);
  const exp = (1 - P.t[0].emoChance) * (P.t[0].shares.transition * P.t[0].rate.transition + P.t[0].shares.early * P.t[0].rate.early + P.t[0].shares.settled * (P.t[0].pickShare * P.t[0].pickRate + (1 - P.t[0].pickShare) * P.t[0].noPickRate)) + P.t[0].emoChance * P.t[0].emoRate;
  ok('goals per possession match the parameters within 0.015', near(gpp, exp, 0.015), { gpp, exp });
  ok('evenly matched teams win about half', near(V3.winPct(G), 0.5, 0.04), V3.winPct(G));
  void target;
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
// ---- goalie in net and pick coverage
{
  const shots = []; for (const [j, gr] of [['30', 0.4], ['31', 0.6]]) for (let i = 0; i < 100; i++) shots.push({ goalieJersey: j, goalX: (i % 3) / 3 + 0.1, goalY: (Math.floor(i / 3) % 3) / 3 + 0.1, goal: i < gr * 100 ? 1 : 0, onKeeper: 1 });
  const gz = V3.goalieZones(shots), A = V3.team(A0), B = V3.team(B0);
  const P30 = V3.matchup(A, B, Object.assign({}, ctx, { wl: { goalieZones: gz, goalie: '30' } })), P31 = V3.matchup(A, B, Object.assign({}, ctx, { wl: { goalieZones: gz, goalie: '31' } }));
  ok('their better goalie in net lowers our scoring; their weaker one raises it', P30.t[0].shooters[0].g < 1 && P31.t[0].shooters[0].g > 1, [P30.t[0].shooters[0].g, P31.t[0].shooters[0].g]);
  ok('…and that shows in results', V3.winPct(V3.runBatch(P31, 2000, 3)) > V3.winPct(V3.runBatch(P30, 2000, 3)));
  const picks = { rows: [{ coverage: 'Switch', share: 0.5, ourRate: 0.27, theirRate: 0.2 }, { coverage: 'Hedge & recover', share: 0.5, ourRate: 0.27, theirRate: 0.4 }] };
  const Pc = V3.matchup(A, B, Object.assign({}, ctx, { wl: { picks } }));
  const G = V3.runBatch(Pc, 3000, 4), tot = c => G.reduce((a, b) => [a[0] + ((b.pickCov[c] || [0, 0])[0]), a[1] + ((b.pickCov[c] || [0, 0])[1])], [0, 0]);
  const sw = tot('Switch'), he = tot('Hedge & recover');
  ok('pick coverage split: our picks score more against the weaker coverage', he[0] / he[1] > sw[0] / sw[1] + 0.1 && near(sw[1] / (sw[1] + he[1]), 0.5, 0.05), { sw, he });
}
const pass = results.filter(r => r.ok).length; console.log(`engine v3: pass ${pass}  fail ${results.length - pass}`); Deno.exit(pass === results.length ? 0 : 1);

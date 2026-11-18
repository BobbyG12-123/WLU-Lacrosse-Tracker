// Lineup unit rating tests (engine v3, Lineups step 1). Synthetic only.
// Run from the repo root: deno run --check=none --allow-read=. matchup/v3/_tests/lineups_tests.js
for (const f of ['../model.js', '../engine.js', '../sheet.js', '../lineups.js', '../../picks.js']) await import(new URL(f, import.meta.url));
const MS = globalThis.MS, V3 = MS.V3, LU = V3.lineups, results = [];
const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log((cond ? '  OK   ' : '  FAIL ') + name + (cond || info === undefined ? '' : '  ' + JSON.stringify(info).slice(0, 500))); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const K = LU.LK;

// ---- Synthetic logs. Two practice sessions (p1, p2) and one scrimmage (s1).
// Offense: #1 10 shots 6 goals unassisted (p1); #2 10 shots 2 goals, all fed by #3 (p1); #3 5 shots 1 goal (p2);
// turnovers: #1 2, #2 4, one unnamed. Man-up: #1 4 shots 3 goals. Scrimmage: their 6 shots on us (OPP), our 3 shots (WLU).
const shots = [], poss = [];
const S1 = (o) => shots.push(Object.assign({ team: 'WLU', context: 'Practice', sid: 'p1', manSituation: 'Even' }, o));
for (let i = 0; i < 10; i++) S1({ shooterJersey: '1', goal: i < 6 ? 1 : 0 });
for (let i = 0; i < 10; i++) S1({ shooterJersey: '2', assistJersey: '3', goal: i < 2 ? 1 : 0 });
for (let i = 0; i < 5; i++) S1({ sid: 'p2', shooterJersey: '3', goal: i < 1 ? 1 : 0 });
for (let i = 0; i < 4; i++) S1({ shooterJersey: '1', goal: i < 3 ? 1 : 0, manSituation: 'Man-Up' });
for (let i = 0; i < 3; i++) S1({ context: 'Scrimmage', sid: 's1', shooterJersey: '1', goal: 1, defender: '40', defBeaten: 'Yes' }); // our scrimmage shots: not our defense
for (let i = 0; i < 6; i++) S1({ context: 'Scrimmage', sid: 's1', team: 'OPP', shooterJersey: '22', goal: i < 2 ? 1 : 0, defender: '41', defBeaten: i < 3 ? 'Yes' : 'No' });
// Defense reps in practice: #40 beaten 2 of 10, #41 beaten 8 of 10. Goals: on beaten reps 5 of 10, on not-beaten 2 of 10.
for (let i = 0; i < 10; i++) S1({ sid: 'p2', shooterJersey: '9', defender: '40', defBeaten: i < 2 ? 'Yes' : 'No', goal: i < 2 ? (i < 1 ? 1 : 0) : (i < 3 ? 1 : 0) });
for (let i = 0; i < 10; i++) S1({ sid: 'p2', shooterJersey: '9', defender: '41', defBeaten: i < 8 ? 'Yes' : 'No', goal: i < 8 ? (i < 4 ? 1 : 0) : (i < 9 ? 1 : 0) });
const P1 = (o) => poss.push(Object.assign({ team: 'WLU', context: 'Practice', sid: 'p1', manSituation: 'Even', end: 'Turnover' }, o));
P1({ turnoverBy: '1' }); P1({ turnoverBy: '1' }); for (let i = 0; i < 4; i++) P1({ turnoverBy: '2' }); P1({});
// Caused turnovers (practice, p2): #42 caused 3, #40 caused 1.
for (let i = 0; i < 3; i++) P1({ sid: 'p2', turnoverBy: '9', causedBy: '42' }); P1({ sid: 'p2', turnoverBy: '9', causedBy: '40' });
const positions = { json: JSON.stringify({ 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'M', 6: 'M', 7: 'M', 8: 'M', 40: 'D', 41: 'D', 42: 'D', 43: 'D', 44: 'L', 45: 'S', 46: 'S', 31: 'G', 32: 'G', 50: 'F', 51: 'F' }), alt: '{}' };
const R = LU.ratings({ shots, poss, stints: [], positions });

// ---- 1. Offense, by hand.
// Even-strength, our team: shots 10 + 10 + 5 + 20 defense-rep shots by #9 (p2) = 45 ... #9's shots count on offense too.
{ const O = R.off, p1 = O.players['1'], p2 = O.players['2'], p3 = O.players['3'];
  ok('player #1: 6 goals on 10 unassisted shots + 2 turnovers + 3 of 3 in the scrimmage = 9 produced on 15 used', near(p1.G, 9) && near(p1.U, 15), p1);
  ok('assisted shots split half to the passer: #2 1 goal on 5 + 4 turnovers, #3 gets 1 goal on 5 from feeds plus his own 1 on 5', near(p2.G, 1) && near(p2.U, 9) && near(p3.G, 2) && near(p3.U, 10), [p2, p3]);
  const ourEven = shots.filter(s => s.team !== 'OPP' && s.manSituation === 'Even'), G = ourEven.filter(s => s.goal).length, U = ourEven.length + poss.filter(p => p.team !== 'OPP' && p.end === 'Turnover').length;
  ok('team rate = all even-strength goals / (shots + turnovers), unnamed turnovers included', near(O.eff, G / U) && O.U === U, [O.eff, G, U]);
  const r1 = LU.offOf(R, '1');
  ok('rating pulled toward the team with weight 30', near(r1.eff, (9 + K.off * O.eff) / (15 + K.off)), r1);
  ok('a player with no logs rates as the team, with team usage', near(LU.offOf(R, '99').eff, O.eff) && near(LU.offOf(R, '99').inv, O.inv) && LU.offOf(R, '99').n === 0);
  ok('man-up rating: his man-up record pulled toward his even rating (3 of 4)', near(LU.offOf(R, '1', 'Man-Up').eff, (3 + K.off * r1.eff) / (4 + K.off))); }

// ---- 2. Defense, by hand.
{ const D = R.def, d40 = LU.defOf(R, '40'), d41 = LU.defOf(R, '41');
  ok('defense uses practice reps and their scrimmage shots, never our scrimmage shots', D.reps === 26 && D.players['40'].reps === 10 && D.players['41'].reps === 16, [D.reps, D.players['40'], D.players['41']]);
  ok('beaten rate pulled with weight 12', near(d40.r, (2 + K.beaten * D.beatTeam) / (10 + K.beaten)) && near(D.beatTeam, (2 + 8 + 3) / 26));
  ok('goal rate on beaten and not-beaten reps', near(D.gb, (1 + 4 + 2) / 13) && near(D.gn, (1 + 1 + 0) / 13), [D.gb, D.gn]);
  const u = LU.defUnit(R, ['40']), v = LU.defUnit(R, ['41']);
  ok('a unit with the less-beaten defender allows fewer goals', u.value < v.value, [u.value, v.value]);
  ok('caused turnovers pull the unit down too: #42 (3 caused) beats a no-log defender', LU.defUnit(R, ['42']).value < LU.defUnit(R, ['98']).value); }

// ---- 3. Units and chance-better.
{ const a = ['1', '2', '3'], b = ['4', '2', '3'];
  const ua = LU.offUnit(R, a), ub = LU.offUnit(R, b);
  ok('usage shares add to 1', near(ua.players.reduce((s, p) => s + p.u, 0), 1));
  ok('unit with #1 (best finisher) rates above the same unit with a no-log player', ua.value > ub.value, [ua.value, ub.value]);
  const c = LU.chanceBetter(R, a, b, 'off'), c2 = LU.chanceBetter(R, b, a, 'off');
  ok('chance better is above 50% and the two directions add to 1', c > 0.5 && c < 1 && near(c + c2, 1, 1e-6), [c, c2]);
  ok('identical units: 50%', near(LU.chanceBetter(R, a, a, 'off'), 0.5) && near(LU.chanceBetter(R, ['40'], ['40'], 'def'), 0.5));
  ok('defense chance better favors the less-beaten defender', LU.chanceBetter(R, ['40'], ['41'], 'def') > 0.5); }

// ---- 4. Together term.
{ const st = [{ id: 'g', offTeam: 'WLU', offense: ['1', '2', '3'] }];
  const sh2 = shots.concat(Array.from({ length: 20 }, () => ({ team: 'WLU', context: 'Practice', sid: 'p3', manSituation: 'Even', shooterJersey: '5', goal: 1, stintId: 'g' })));
  const R2 = LU.ratings({ shots: sh2, poss, stints: st, positions }), u = LU.offUnit(R2, ['3', '1', '2']);
  const obs = (20 + 0.5) / (20 + 1), lg = x => Math.log(x / (1 - x));
  ok('a logged group gets a together term, pulled to zero by 40, whatever the order of jerseys', u.group && u.group.U === 20 && near(u.together, 20 / 60 * (lg(obs) - lg(u.base))) && u.value > u.base, u);
  ok('a group never logged together has no together term', LU.offUnit(R2, ['1', '2', '4']).together === 0); }

// ---- 5. Builder against a sheet: the baseline reproduces it; changes move it the right way.
const D3 = { eff: 0.26, emo: 0.36, by_type: { transition: { n: 1000, goal_pct: 0.14 }, early: { n: 300, goal_pct: 0.15 }, settled: { n: 2500, goal_pct: 0.26 } }, pick: { n: 700, goal_pct: 0.27 }, no_pick: { n: 1800, goal_pct: 0.255 } };
const sd = () => ({ by_type: { transition: { n: 100, goal_pct: 0.14 }, early: { n: 30, goal_pct: 0.15 }, settled: { n: 250, goal_pct: 0.26 } }, pick: { n: 70, goal_pct: 0.27 }, no_pick_settled: { n: 180, goal_pct: 0.255 } });
const mk = (id, name, pre, fo) => ({ id, name, roster: [1, 2, 3, 4].map(i => ({ jersey_number: String(i), player: `${pre}${i} Sample`, team_listed_class: 'JR', shots: 50 + 10 * i, goals: 15 + i, offensive_EGA: 5 + i, defensive_EGA: 0 }))
  .concat([{ jersey_number: '30', player: `${pre}G Sample`, team_listed_class: 'SO', shots: 0, sog_faced: 300, save_pct: 0.5, defensive_EGA: 4 }]),
  stats: { adjusted_off_efficiency: 0.27, adjusted_def_efficiency: 0.25, clear_rate: 0.9, adjusted_true_faceoff_win_rate: 0.5 },
  ev: { poss: { per_game: 45, off_len: 30 }, pens_pg: 3, emo: { goals: 36, chances: 100 }, mdd: { goals_allowed: 36, chances: 100 } },
  sb: { n_games: 10, off: sd(), def: sd(), fo_by_man: fo || [], pick_clips_def: [], pick_clips_off: [] } });
// Goalie shots for two of our goalies, so the sheet can replay each.
const gShots = [];
for (const [j, gr] of [['31', 0.45], ['32', 0.6]]) for (let i = 0; i < 90; i++) gShots.push({ team: 'WLU', context: 'Practice', goalieJersey: j, goalX: (i % 3) / 3 + 0.1, goalY: (Math.floor(i / 3) % 3) / 3 + 0.1, goal: i < gr * 90 ? 1 : 0, onKeeper: 1 });
const fo = [['50', 'F50 Sample', 120, 80, []], ['51', 'F51 Sample', 40, 60, []]];
const inp = { wl: mk(410, 'Washington and Lee', 'Testa'), opp: mk(901, 'Testa College', 'Fixture'), d3: D3, practice: { shots: shots.concat(gShots), poss, stints: [], roster: [] }, opts: { games: 1500 } };
const S = V3.sheet.build(inp);
const B = { attack: ['1', '2', '3'], mids: [{ players: ['5', '6', '7'], share: 1 }], defense: ['40', '41', '42'], manUp: ['1', '2', '3', '5', '6', '7'], manDown: ['40', '41', '42'], goalie: S._ctx.goalie, fogo: S.faceoffs.ours.length ? String(S.faceoffs.ours[S.faceoffs.model.main].j) : null };
{ const T = LU.toSets(R, B, B, S);
  ok('baseline lineup: no engine changes', Object.keys(T.sets).length === 0 && T.goalie === null, T);
  const sim = LU.simulate(S, R, B, B);
  ok('baseline lineup reproduces the sheet win chance exactly (same games, same seed)', sim.win === S.BT, [sim.win, S.BT]);
  const L = Object.assign({}, B, { attack: ['4', '2', '3'] }), sL = LU.simulate(S, R, L, B);
  ok('swapping #1 for a no-log attackman lowers our 6-on-6 multiplier and the win chance', sL.sets['wl.six'] < 1 && sL.win < S.BT, sL);
  ok('per 100 settled possessions: baseline x multiplier', sL.per100 && near(sL.per100.oursLineup, sL.per100.ours * sL.sets['wl.six']) && sL.per100.ours > 10 && sL.per100.ours < 60, sL.per100);
  const sD = LU.simulate(S, R, Object.assign({}, B, { defense: ['40', '43', '42'] }), B);
  ok('replacing the often-beaten #41 with a no-log defender lowers their 6-on-6 rate and raises ours', sD.sets['opp.six'] < 1 && sD.win > S.BT, sD.sets);
  const sMU = LU.toSets(R, Object.assign({}, B, { manUp: ['4', '2', '3', '5', '6', '7'] }), B, S);
  ok('man-up unit changes only the man-up rate', Object.keys(sMU.sets).join() === 'wl.emo' && sMU.sets['wl.emo'] < 1, sMU.sets);
  ok('a part a lineup leaves out is the baseline\'s', Object.keys(LU.toSets(R, { attack: B.attack }, B, S).sets).length === 0); }

// ---- 6. Goalie and FOGO through the sheet's own models.
{ const g = S.ourGoalies.find(x => x.j !== String(S._ctx.goalie)) || S.ourGoalies[1];
  const L = Object.assign({}, B, { goalie: g.j }), sim = LU.simulate(S, R, L, B);
  ok('goalie swap matches the sheet\'s own replay with that goalie in net', g && sim.goalie === g.j && sim.win === g.w, [g && g.j, sim.win, g && g.w]); }
{ const inpF = Object.assign({}, inp, { wl: mk(410, 'Washington and Lee', 'Testa', fo), opp: mk(901, 'Testa College', 'Fixture', [['9', 'Fixture9 Sample', 100, 100, []]]) });
  const SF = V3.sheet.build(inpF), fm = SF.faceoffs.model, ours = SF.faceoffs.ours;
  const BF = Object.assign({}, B, { fogo: String(ours[fm.main].j) }), alt = ours.find((o, i) => i !== fm.main);
  ok('the sheet has a faceoff model with two of our FOGOs', fm.M && fm.M.length === 2 && alt, fm);
  const T = LU.toSets(R, Object.assign({}, BF, { fogo: String(alt.j) }), BF, SF), i = ours.indexOf(alt), p = fm.M[i].reduce((a, c, j) => a + fm.tShare[j] * c.p, 0);
  ok('FOGO swap sets the faceoff chance from his row of the head-to-head model', near(T.sets.fo, p) && T.sets.fo < SF.base.fo, [T.sets.fo, SF.base.fo]);
  ok('the main FOGO\'s row reproduces the sheet\'s faceoff chance', near(fm.M[fm.main].reduce((a, c, j) => a + fm.tShare[j] * c.p, 0), SF.base.fo)); }

// ---- 7. Empty logs and the default lineup.
{ const R0 = LU.ratings({ shots: [], poss: [], stints: [], positions: null });
  ok('no logs: units have no value and the builder changes nothing', LU.offUnit(R0, ['1', '2', '3']).value === null && Object.keys(LU.toSets(R0, Object.assign({}, B, { attack: ['7', '8', '9'] }), B, S).sets).length === 0);
  const DL = LU.defaultLineup(R, S);
  ok('default lineup: attack = the three A with most possessions used (#1, #3, #2), FOGO and goalie from the sheet', DL.attack.join() === '1,3,2' && DL.goalie === S._ctx.goalie, DL);
  ok('default midfield lines are equal shares; defense = 3 D + LSM + 2 SSDM by logged entries', DL.mids.every(m => m.share === 1) && DL.defense.slice(0, 3).join() === '41,40,42' && DL.defense.length === 6, DL); }

{ const st = [1, 2, 3].map(i => ({ id: 'x' + i, offTeam: 'WLU', context: 'Practice', offense: ['4', '2', '3', '5', '6', '7'], defense: ['43', '40', '42', '44', '45', '46'] }))
    .concat([{ id: 'y', offTeam: 'WLU', context: 'Scrimmage', offense: ['1', '2', '3'], defense: ['41', '41', '41'] }]);
  const DL = LU.defaultLineup(LU.ratings({ shots, poss, stints: st, positions }), S);
  ok('default lineup prefers players in logged lineup records (#4 in 3 records beats #1 in 1); our scrimmage offense records don\'t count for defense', DL.attack.slice().sort().join() === '2,3,4' && !DL.attack.includes('1') && DL.defense.slice(0, 3).join() === '40,42,43', DL); }

// ---- 8. Review fixes (Nov 17): hand-computed values, logged-draw blend, game records, empty parts, unnamed shooters.
{ const D = R.def, d = LU.defOf(R, '40'), repG = r => r * D.gb + (1 - r) * D.gn;
  const want = (1 - D.ctShare * d.c / D.ctRate) * (1 + D.repGoalShare * (repG(d.r) / repG(D.beatTeam) - 1));
  ok('defensive unit value by hand: (1 - caused share) x (1 + rep goal share x (rep goal rate / team - 1))', near(LU.defUnit(R, ['40']).value, want), [LU.defUnit(R, ['40']).value, want]);
  const goalsAgainst = shots.filter(x => !(x.context !== 'Practice' && x.team !== 'OPP') && x.goal).length;
  ok('rep goal share = goals on logged reps / all goals against our defense', near(D.repGoalShare, (7 + 2) / goalsAgainst), [D.repGoalShare, goalsAgainst]); }
{ // Offense chance better by hand: units differ only in #1 vs #4; usage shares differ for every player, so all count.
  const a = LU.offUnit(R, ['1', '2', '3']), b = LU.offUnit(R, ['4', '2', '3']), w = {};
  a.players.forEach(p => { w[p.j] = (w[p.j] || 0) + p.u; }); b.players.forEach(p => { w[p.j] = (w[p.j] || 0) - p.u; });
  const v = Object.entries(w).reduce((s2, [j, x]) => s2 + x * x * LU.offOf(R, j).v, 0), z = (a.value - b.value) / Math.sqrt(v);
  const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
  ok('offense chance better = normal CDF of (difference / its standard error), within 1e-4', near(LU.chanceBetter(R, ['1', '2', '3'], ['4', '2', '3'], 'off'), 0.5 * (1 + erf(z / Math.SQRT2)), 1e-4), [z]); }
{ const T = LU.toSets(R, Object.assign({}, B, { manDown: ['40', '43', '42'] }), B, S);
  ok('man-down unit: their man-up rate x (unit value / baseline value), nothing else', Object.keys(T.sets).join() === 'opp.emo' && near(T.sets['opp.emo'], LU.defUnit(R, ['40', '43', '42']).value / LU.defUnit(R, B.manDown).value), T.sets);
  const sum = f => S._ctx.bt.reduce((x, b) => x + f(b), 0), ours = 100 * sum(b => (b.goals[0]['no pick'] || 0) + (b.goals[0].pick || 0)) / sum(b => (b.kinds[0]['no pick'] || 0) + (b.kinds[0].pick || 0));
  ok('per 100: our settled goals / settled possessions in the sheet\'s games', near(LU.per100(S, {}).ours, ours), [LU.per100(S, {}).ours, ours]);
  ok('empty parts (no players, no midfield lines) are left out, not rated as zero', Object.keys(LU.toSets(R, Object.assign({}, B, { defense: [], manDown: [], manUp: [], mids: [] }), B, S).sets).length === 0); }
{ // A sheet whose faceoff chance includes logged draws: a FOGO swap moves it by his row's gap on the log-odds scale.
  const lg = x => Math.log(x / (1 - x)), ul = x => 1 / (1 + Math.exp(-x));
  const fake = { base: { fo: 0.6 }, faceoffs: { ours: [{ j: '50' }, { j: '51' }], model: { M: [[{ p: 0.5 }, { p: 0.6 }], [{ p: 0.4 }, { p: 0.45 }]], tShare: [0.5, 0.5], main: 0 } } };
  const T = LU.toSets(R, { fogo: '51' }, { fogo: '50' }, fake), want = ul(lg(0.6) + lg(0.425) - lg(0.55));
  ok('FOGO swap keeps the sheet\'s logged-draw blend (shift from the baseline FOGO\'s row, not his raw row)', near(T.sets.fo, want) && !near(T.sets.fo, 0.425), [T.sets.fo, want]);
  ok('FOGO with no row in the model: no change, with a note', !('fo' in LU.toSets(R, { fogo: '77' }, { fogo: '50' }, fake).sets)); }
{ const st = [{ id: 'gm', offTeam: 'WLU', context: 'Game', offense: ['1', '2', '3'], defense: ['41', '41', '41', '41'] }, { id: 'gd', offTeam: 'OPP', context: 'Game', offense: [], defense: ['43'] }];
  const Rg = LU.ratings({ shots, poss, stints: st, positions });
  ok('game lineup records: their defenders (offTeam WLU) never count as ours; our defense (offTeam OPP) does', !Rg.onField.def['41'] && Rg.onField.def['43'] === 1 && Rg.onField.off['1'] === 1, Rg.onField); }
{ const Ru = LU.ratings({ shots: shots.concat([{ team: 'WLU', context: 'Practice', sid: 'p1', manSituation: 'Even', goal: 1 }]), poss, stints: [], positions });
  ok('a shot with no shooter still counts in the team rate', near(Ru.off.U, R.off.U + 1) && near(Ru.off.G, R.off.G + 1)); }

const pass = results.filter(r => r.ok).length; console.log(`lineups: pass ${pass}  fail ${results.length - pass}`); Deno.exit(pass === results.length ? 0 : 1);

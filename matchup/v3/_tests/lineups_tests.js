// Lineup unit rating tests (engine v3, Lineups step 1). Synthetic only.
// Run from the repo root: deno run --check=none --allow-read=. matchup/v3/_tests/lineups_tests.js
for (const f of ['../model.js', '../engine.js', '../sheet.js', '../lineups.js', '../lineups_view.js', '../../picks.js']) await import(new URL(f, import.meta.url));
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

// ---- 9. Step 2: one-player swaps and the panel.
{ const L = JSON.parse(JSON.stringify(B)), before = JSON.stringify(L), pool = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const X = LU.swapIn(L, 'attack', 0, '4');
  ok('swapIn returns a copy and leaves the lineup alone', JSON.stringify(L) === before && X.attack[0] === '4');
  const out = LU.swaps(S, R, L, B, 'attack', pool);
  ok('current lineup in the swap search is the sheet\'s (no edits)', out.current.win === S.BT);
  ok('at most 3 swaps played, sorted by win chance, none bringing in a player already in the attack or a midfield line', out.rows.length === 3 && out.rows.every((r, i) => i === 0 || r.win <= out.rows[i - 1].win) && out.rows.every(r => !['1', '2', '3', '5', '6', '7'].includes(r.in)), out.rows.map(r => [r.out, r.in, r.win]));
  ok('each swap\'s win chance is its own simulation, and its change is against the current lineup', out.rows.every(r => r.win === LU.simulate(S, R, r.lineup, B).win && near(r.dWin, r.win - out.current.win)));
  const all = []; L.attack.forEach((o, k) => ['4', '8'].forEach(j => all.push(LU.toSets(R, LU.swapIn(L, 'attack', k, j), B, S).parts.offense.m)));
  ok('the swaps played are the best by rating', near(Math.max(...out.rows.map(r => LU.toSets(R, r.lineup, B, S).parts.offense.m)), Math.max(...all)));
  const one = Object.assign(JSON.parse(JSON.stringify(L)), { attack: ['4', '2', '3'] });
  ok('lineup chance-better with one midfield line equals the unit chance-better', near(LU.chanceBetterPart(R, one, L, 'offense'), LU.chanceBetter(R, ['4', '2', '3', '5', '6', '7'], ['1', '2', '3', '5', '6', '7'], 'off'), 1e-9));
  const dz = LU.swaps(S, R, L, B, 'defense', slot => slot === 0 ? ['43'] : []);
  ok('slot pools: only slot 0 gets candidates (#43 for our best defender #40 rates worse, and shows it)', dz.rows.length === 1 && dz.rows[0].slot === 0 && dz.rows[0].in === '43' && dz.rows[0].chance < 0.5 && dz.rows[0].dWin < 0, dz.rows);
  const gz = LU.swaps(S, R, L, B, 'goalie', S.ourGoalies.map(x => x.j));
  ok('goalie swaps: every goalie played, matching the sheet\'s goalie replays', gz.rows.length === S.ourGoalies.length && gz.rows.every(r => r.win === S.ourGoalies.find(x => x.j === r.in).w), gz.rows.map(r => [r.in, r.win])); }
{ const V = V3.lineupsView, P = V.pools(R, S, true), P0 = V.pools(R, S, false);
  ok('swap pools need logs (10+ used on offense); the edit pools don\'t', !P.attack.includes('4') && P0.attack.includes('4') && P.attack.includes('1'), [P.attack, P0.attack]);
  ok('defense slot pools follow positions: close D, LSM, SSDM', P0.defense(0).includes('40') && P0.defense(3).join() === '44' && P0.defense(4).join() === '45,46');
  const html = V.render({ S, R, L: B, B, names: { 1: 'Sample <img/src=x/onerror=alert(1)>' }, cur: LU.simulate(S, R, B, B), res: { attack: LU.swaps(S, R, B, B, 'attack', P0.attack) }, sel: { unit: 'attack', slot: 0 }, busy: false });
  ok('panel: names are escaped', !/<img/.test(html) && /&lt;img/.test(html), html.slice(1300, 1700));
  ok('panel: current lineup equals the sheet, chips for each unit, a pick row for the chosen slot', /\(the sheet's lineup\)/.test(html) && (html.match(/data-lu="attack" data-slot/g) || []).length >= 3 && /Put in for/.test(html) && /Best one-player swaps/.test(html));
  ok('panel: says chance better counts sample size only', /counts sample size only/.test(html)); }

{ // Together term error: a swap that makes a logged six is less certain than the players alone say.
  const st = [{ id: 'g', offTeam: 'WLU', offense: ['1', '2', '3', '5', '6', '7'] }];
  const R3 = LU.ratings({ shots: shots.concat(Array.from({ length: 6 }, () => ({ team: 'WLU', context: 'Practice', sid: 'p4', manSituation: 'Even', shooterJersey: '5', goal: 0, stintId: 'g' }))), poss, stints: st, positions });
  const u = LU.offUnit(R3, ['1', '2', '3', '5', '6', '7']), lg = 6 / 46, obs = 0.5 / 7;
  ok('together error = (weight^2 / (U x p(1-p))) x (value(1-value))^2', near(u.tvar, lg * lg / (6 * obs * (1 - obs)) * (u.value * (1 - u.value)) ** 2), u);
  const A = { attack: ['1', '2', '3'], mids: [{ players: ['5', '6', '7'], share: 1 }] }, Bq = { attack: ['4', '2', '3'], mids: [{ players: ['5', '6', '7'], share: 1 }] };
  const c = LU.chanceBetterPart(R3, A, Bq, 'offense'), w = {};
  LU.offUnit(R3, ['1', '2', '3', '5', '6', '7']).players.forEach(p => { w[p.j] = (w[p.j] || 0) + p.u; }); LU.offUnit(R3, ['4', '2', '3', '5', '6', '7']).players.forEach(p => { w[p.j] = (w[p.j] || 0) - p.u; });
  const v0 = Object.entries(w).reduce((s2, [j, x]) => s2 + x * x * LU.offOf(R3, j).v, 0), d = u.value - LU.offUnit(R3, ['4', '2', '3', '5', '6', '7']).value;
  ok('chance better adds the together error when a lineup has a logged six the other doesn\'t', c > 0 && c < 1 && Math.abs((c - 0.5)) < Math.abs(0.5 - (d / Math.sqrt(v0) > 0 ? 1 : 0)) && near(c, LU.chanceBetter(R3, ['1', '2', '3', '5', '6', '7'], ['4', '2', '3', '5', '6', '7'], 'off'), 1e-9));
  const html = V3.lineupsView.render({ S, R: R3, L: A, B: A, names: {}, cur: null, res: { attack: { rows: [{ out: '1', in: '4', win: 0.5, dWin: -0.01, chance: 0.4, lineup: Bq }] } }, sel: null, busy: false });
  ok('a swap row says when it breaks up a logged six', /Breaks up a six logged together \(0 goals on 6 shots \+ turnovers\)/.test(html)); }

ok('chance better shows no finer than 5% to 95%', V3.lineupsView.chanceTxt(0.999) === '95%+' && V3.lineupsView.chanceTxt(0.001) === 'under 5%' && V3.lineupsView.chanceTxt(0.62) === '62%' && V3.lineupsView.chanceTxt(null) === '—');

{ const m3 = [{ players: [], share: 1 }, { players: [], share: 1 }, { players: [], share: 1 }];
  const a = LU.setShare(m3, 0, 50), b = LU.setShare(a, 1, 30);
  ok('time shares are percents: 50 on line 1 leaves 25/25; then 30 on line 2 gives 50/30/20', a.map(m => m.share).join() === '50,25,25' && b.map(m => Math.round(m.share)).join() === '50,30,20', [a, b]);
  ok('a line set to 100 takes all the time; a single line set to 0 is refused', LU.setShare(m3, 2, 100).map(m => m.share).join() === '0,0,100' && LU.setShare([{ share: 1 }], 0, 0) === null && LU.setShare([{ share: 1 }], 0, 40)[0].share === 100);
  const c = LU.setShare(b, 0, 80);
  ok('typed lines keep their value: then 80 on line 1 scales the typed 30 down to 20 and the untyped line gets none', c.map(m => Math.round(m.share)).join() === '80,20,0' && Math.abs(c.reduce((x, m) => x + m.share, 0) - 100) < 1e-9, c);
  ok('all lines typed and line 1 set to 0: the others keep their proportions', LU.setShare(LU.setShare(b, 2, 20), 0, 0).map(m => Math.round(m.share)).join() === '0,60,40');
  const L = Object.assign(JSON.parse(JSON.stringify(B)), { mids: [{ players: ['5', '6', '7'], share: 100 }, { players: ['8', '4', '9'], share: 0 }] });
  ok('a midfield line with no time gets no swaps', LU.swaps(S, R, L, B, 'mid1', ['1', '2', '3']).rows.length === 0);
  ok('an offense unit with no rating has no together error (not NaN)', LU.offUnit(LU.ratings({ shots: [], poss: [], stints: [], positions }), ['1']).tvar === 0); }

// ---- 10. Step 3: build from scratch.
{ ok('combinations: C(6,3) = 20, all distinct', LU.combos([1, 2, 3, 4, 5, 6], 3).length === 20 && new Set(LU.combos([1, 2, 3, 4, 5, 6], 3).map(String)).size === 20);
  // A richer roster: attack 1-4, mids 5-8 and 10-14 with logs, defense 40-43 with reps, LSM 44, SSDM 45-46.
  const sh = shots.slice();
  [['5', 20, 9], ['6', 20, 4], ['7', 20, 6], ['8', 20, 10], ['10', 20, 3], ['11', 20, 7], ['12', 20, 5], ['13', 20, 8], ['14', 20, 2]].forEach(([j, n, g]) => { for (let i = 0; i < n; i++) sh.push({ team: 'WLU', context: 'Practice', sid: 'p5', manSituation: 'Even', shooterJersey: j, goal: i < g ? 1 : 0 }); });
  [['42', 4], ['43', 1], ['44', 3], ['45', 2], ['46', 5]].forEach(([j, b]) => { for (let i = 0; i < 10; i++) sh.push({ team: 'WLU', context: 'Practice', sid: 'p5', manSituation: 'Even', shooterJersey: '9', defender: j, defBeaten: i < b ? 'Yes' : 'No', goal: i < b ? 1 : 0 }); });
  const pos2 = { json: JSON.stringify({ 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'M', 6: 'M', 7: 'M', 8: 'M', 10: 'M', 11: 'M', 12: 'M', 13: 'M', 14: 'M', 40: 'D', 41: 'D', 42: 'D', 43: 'D', 44: 'L', 45: 'S', 46: 'S', 47: 'S' }), alt: '{}' };
  const Rb = LU.ratings({ shots: sh, poss, stints: [], positions: pos2 });
  const L0 = { attack: ['2', '3', '4'], mids: [{ players: ['6', '10', '14'], share: 50 }, { players: ['5', '7', '8'], share: 30 }, { players: ['11', '12', '13'], share: 20 }], defense: ['41', '42', '43', '44', '45', '47'], manUp: ['2', '3', '4', '6', '10', '14'], manDown: ['41', '42', '43', '44', '45', '47'], goalie: null, fogo: null };
  const P = V3.lineupsView.pools(Rb, S, false), b = LU.build(S, Rb, L0, B, { pools: P });
  // brute force defense
  let bestD = Infinity; LU.combos(['40', '41', '42', '43'], 3).forEach(d => ['44'].forEach(l => LU.combos(['45', '46', '47'], 2).forEach(ss => { bestD = Math.min(bestD, LU.defUnit(Rb, d.concat([l], ss)).value); })));
  ok('defense: the build tries every legal combination and finds the best', b.units.defense.exhaustive && near(b.units.defense.best.v, bestD) && near(LU.defUnit(Rb, b.lineup.defense).value, bestD), [b.units.defense.best, bestD]);
  // brute force man-up from A + M pools
  let bestMU = -1; LU.combos(P.manUp.map(String), 6).forEach(c => { bestMU = Math.max(bestMU, LU.offUnit(Rb, c, 'Man-Up').value); });
  ok('man-up: every combination of 6 from attack and midfield; best found', near(b.units.manUp.best.v, bestMU), [b.units.manUp.best.v, bestMU]);
  const flat = X => X.attack.concat(...X.mids.map(m => m.players));
  ok('offense: no player twice, shares kept, and at least as good as the current lineup', new Set(flat(b.lineup)).size === 12 && b.lineup.mids.map(m => m.share).join() === '50,30,20' && b.units.offense.best.v >= b.units.offense.current - 1e-12, b.lineup);
  // no single swap or cross-line swap improves the built offense (a local optimum)
  const v0 = b.units.offense.best.v; let better = false; const used = new Set(flat(b.lineup));
  b.lineup.attack.forEach((j, i) => P.attack.filter(x => !used.has(x)).forEach(x => { const X = LU.swapIn(b.lineup, 'attack', i, x); if (LU.toSets(Rb, X, b.lineup, S).parts.offense.m > 1 + 1e-12) better = true; }));
  b.lineup.mids.forEach((m, l) => m.players.forEach((j, i) => P.mid.filter(x => !used.has(x)).forEach(x => { const X = LU.swapIn(b.lineup, 'mid' + l, i, x); if (LU.toSets(Rb, X, b.lineup, S).parts.offense.m > 1 + 1e-12) better = true; })));
  ok('offense: no one-player swap improves the built lineup', !better);
  ok('the best midfield line by rating gets the most time', LU.offUnit(Rb, b.lineup.attack.concat(b.lineup.mids[0].players)).value >= LU.offUnit(Rb, b.lineup.attack.concat(b.lineup.mids[2].players)).value - 1e-12);
  ok('the build is played once on the sheet\'s games; changes listed slot by slot', b.sim.win === LU.simulate(S, Rb, b.lineup, B).win && b.changes.every(c => c.in !== c.out) && b.changes.length > 0, b.changes);
  { const gone = L0.manUp.filter(j => !b.lineup.manUp.includes(j)), mu = b.changes.filter(c => c.unit === 'manUp');
    ok('changes list who leaves and joins each unit (not spot by spot)', mu.length === gone.length && mu.every(c => gone.includes(c.out) && !L0.manUp.includes(c.in) && b.lineup.manUp.includes(c.in)), [mu, gone]); }
  ok('goalie: the best of the sheet\'s goalie replays', b.lineup.goalie === S.ourGoalies.slice().sort((x, y) => y.w - x.w)[0].j);
  const bo = LU.build(S, Rb, L0, B, { pools: P, out: ['8', '42'] });
  ok('players marked out appear nowhere (an attackman fills a midfield spot when midfielders run short)', !['8', '42'].some(j => flat(bo.lineup).concat(bo.lineup.defense, bo.lineup.manUp, bo.lineup.manDown).includes(j)) && new Set(flat(bo.lineup)).size === 12, bo.lineup);
  const b2 = LU.build(S, Rb, L0, B, { pools: P, out: ['8', '1', '5'] });
  ok('too few offensive players left: the out player stays, and the build says so', b2.notes.some(n => /not enough available players; #\d+ stays in his spot though marked out/.test(n)), b2.notes);
  const bl = LU.build(S, Rb, L0, B, { pools: P, lock: ['14', '43', '2'] });
  ok('locked players stay in their spots', bl.lineup.mids[0].players[2] === '14' && bl.lineup.defense[2] === '43' && bl.lineup.attack[0] === '2', bl.lineup);
  const bc = LU.build(S, Rb, L0, B, { pools: P, cap: 10 });
  ok('with a small cap the swap search is used and is no worse than the current units', !bc.units.defense.exhaustive && bc.units.defense.best.v <= LU.defUnit(Rb, L0.defense).value + 1e-12 && new Set(bc.lineup.defense).size === 6, bc.units.defense);
  ok('each part alone is played on the same games (offense part = attack and mids from the build)', b.byPart.offense === undefined || near(b.byPart.offense, LU.simulate(S, Rb, Object.assign(JSON.parse(JSON.stringify(L0)), { attack: b.lineup.attack, mids: b.lineup.mids }), B).win - b.cur.win), b.byPart);
  { const u = LU.defUnit(Rb, ['42']); ok('no-caused check: a unit at the team caused rate, same beaten-rep factor', near(u.valueNoCaused, (1 - Rb.def.ctShare) * u.repFactor)); }
  ok('the no-caused check is reported when the defense changes', b.noCausedWin != null && b.noCausedWin > 0 && b.noCausedWin < 1, b.noCausedWin);
  { const html = V3.lineupsView.renderBuild({ S, R: Rb, L: L0, B, names: { 41: 'Sample <b>x</b>' }, avail: { out: ['8'], lock: ['14'] }, built: b, busy: false });
    ok('build panel: pills show out and locked, names escaped, result with each part and the no-caused check, and a use button', /data-av="8"[^>]*>#8 · out/.test(html) && /#14 · locked/.test(html) && !/<b>x<\/b>/.test(html) && /Built lineup: we win/.test(html) && /beaten reps only/.test(html) && /id="luUseBuilt"/.test(html), html.slice(0, 400)); }
  const bs = LU.build(S, Rb, L0, B, { pools: P, out: ['41', '45', '46'] });
  ok('short SSDM group: the available SSDM stays, the out one stays only because nobody is left (named), and close D is still searched without the out #41', bs.lineup.defense.slice(4).sort().join() === '45,47' && !bs.lineup.defense.slice(0, 3).includes('41') && bs.notes.some(n => /Defense: not enough available players at S.*#45 stays though marked out/.test(n)), [bs.lineup.defense, bs.notes]);
  let bestD2 = Infinity; LU.combos(['40', '42', '43'], 3).forEach(d => { bestD2 = Math.min(bestD2, LU.defUnit(Rb, d.concat(['44'], bs.lineup.defense.slice(4))).value); });
  ok('the rest of that defense is still the best available', near(LU.defUnit(Rb, bs.lineup.defense).value, bestD2));
  const gOut = LU.build(S, Rb, Object.assign({}, L0, { goalie: '31' }), B, { pools: P, out: S.ourGoalies.map(x => x.j) });
  ok('all goalies out: the build uses the pooled save rate and says so', gOut.lineup.goalie === null && gOut.notes.some(n => /Goalie: #31 is out/.test(n)), gOut.notes);
  const Lsw = Object.assign(JSON.parse(JSON.stringify(L0)), { defense: ['44', '41', '42', '43', '45', '47'] });
  const bk = LU.build(S, Rb, Lsw, B, { pools: P });
  ok('defense spots follow the position of the player in them (an LSM listed first stays an LSM spot)', V3.lineupsView.pools(Rb, S, false).defense(3).includes(bk.lineup.defense[0]) && ['40', '41', '42', '43'].includes(bk.lineup.defense[3]), bk.lineup.defense); }

const pass = results.filter(r => r.ok).length; console.log(`lineups: pass ${pass}  fail ${results.length - pass}`); Deno.exit(pass === results.length ? 0 : 1);

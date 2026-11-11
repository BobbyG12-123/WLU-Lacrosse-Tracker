// Game-week sheet tests (engine v3). Synthetic only. Run from the repo root: deno run --check=none --allow-read=. matchup/v3/_tests/sheet_tests.js
for (const f of ['../model.js', '../engine.js', '../sheet.js', '../../picks.js']) await import(new URL(f, import.meta.url));
const MS = globalThis.MS, V3 = MS.V3; const results = [];
const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log((cond ? '  OK   ' : '  FAIL ') + name + (cond || info === undefined ? '' : '  ' + JSON.stringify(info).slice(0, 500))); };
const near = (a, b, t) => Math.abs(a - b) <= t;
const D3 = { eff: 0.26, emo: 0.36, by_type: { transition: { n: 1000, goal_pct: 0.14 }, early: { n: 300, goal_pct: 0.15 }, settled: { n: 2500, goal_pct: 0.26 } }, pick: { n: 700, goal_pct: 0.27 }, no_pick: { n: 1800, goal_pct: 0.255 } };
const sd = () => ({ by_type: { transition: { n: 100, goal_pct: 0.14 }, early: { n: 30, goal_pct: 0.15 }, settled: { n: 250, goal_pct: 0.26 } }, pick: { n: 70, goal_pct: 0.27 }, no_pick_settled: { n: 180, goal_pct: 0.255 } });
const mk = (id, name, pre) => ({ id, name, roster: [1, 2, 3, 4].map(i => ({ jersey_number: String(i), player: `${pre}${i} Sample`, team_listed_class: i === 1 ? 'SR' : 'JR', shots: 50 + 10 * i, goals: 15 + i, offensive_EGA: 5 + i, defensive_EGA: 0 }))
  .concat([{ jersey_number: '30', player: `${pre}G Sample`, team_listed_class: 'SO', shots: 0, sog_faced: 300, save_pct: 0.5, defensive_EGA: 4 }]),
  stats: { adjusted_off_efficiency: 0.27, adjusted_def_efficiency: 0.25, clear_rate: 0.9, adjusted_true_faceoff_win_rate: 0.5 },
  ev: { poss: { per_game: 45, off_len: 30 }, pens_pg: 3, emo: { goals: 36, chances: 100 }, mdd: { goals_allowed: 36, chances: 100 } },
  sb: { n_games: 10, off: sd(), def: sd(), fo_by_man: [], pick_clips_def: [], pick_clips_off: [] },
  off_shot_profile: { this_year: [{ tag: 'shot_clock_remaining_bucket', buckets: [{ bucket: 0, shots: 100, goals: 30, pct: 0.3 }, { bucket: 20, shots: 100, goals: 30, pct: 0.3 }, { bucket: 60, shots: 100, goals: 40, pct: 0.4 }] }] } });
// Practice logs (synthetic): pick shots, defender reps, slides, goalie zones, lineups.
const shots = [];
for (let i = 0; i < 30; i++) shots.push({ team: 'WLU', pickScreener: i < 10 ? '7' : '8', pickUser: '9', goal: i < 10 ? (i < 6 ? 1 : 0) : (i % 4 === 0 ? 1 : 0), stintId: i < 15 ? 'sA' : 'sB' });
for (let i = 0; i < 60; i++) shots.push({ team: 'WLU', defender: i < 20 ? '40' : '41', defBeaten: i < 20 ? (i < 8 ? 'Yes' : 'No') : (i % 3 ? 'Yes' : 'No'), offDodge: 1, slideDefender: i % 2 ? '42' : null, goal: i % 2 ? (i % 5 === 0 ? 1 : 0) : (i % 3 === 0 ? 1 : 0) });
for (const [j, gr] of [['31', 0.45], ['32', 0.6]]) for (let i = 0; i < 90; i++) shots.push({ team: 'WLU', goalieJersey: j, goalX: (i % 3) / 3 + 0.1, goalY: (Math.floor(i / 3) % 3) / 3 + 0.1, goal: i < gr * 90 ? 1 : 0, onKeeper: 1 });
const poss = Array.from({ length: 10 }, (_, i) => ({ team: 'WLU', stintId: i < 5 ? 'sA' : 'sB', end: 'Turnover' }));
const stints = [{ id: 'sA', offTeam: 'WLU', offense: ['7', '8', '9', '10', '11', '12'] }, { id: 'sB', offTeam: 'WLU', offense: ['7', '8', '9', '10', '11', '13'] }];
const inp = { wl: mk(410, 'Washington and Lee', 'Testa'), opp: mk(901, 'Testa College', 'Fixture'), d3: D3, practice: { shots, poss, stints, roster: [] },
  oppPlayers: [{ j: '2', name: 'Fixture2 Sample', cls: 'JR', sbGoals: { 'settled+dodge': 12 }, dodgeShots: 40 }], opts: { games: 1500 } };
const S = V3.sheet.build(inp);
ok('the sheet builds with a base result and a version', S.base && S.base.win > 0 && S.base.win < 1 && /^matchup-v3/.test(S.version), S.base);
ok('missing inputs are listed, not invented (picks, shot placement, wing ground balls)', S.missing.some(m => /pick/i.test(m)) && S.missing.some(m => /shooters put the ball/.test(m)) && S.missing.some(m => /Wing ground balls/.test(m)), S.missing);
ok('no pick lever without pick tags', !S.levers.some(l => /coverage|Draw their/i.test(l.title)));
ok('levers are ranked by win %, each with evidence and a sample unit', S.levers.length >= 6 && S.levers.every((l, i) => i === 0 || l.w <= S.levers[i - 1].w + 1e-12) && S.levers.every(l => l.why && l.unit), S.levers.map(l => [l.title, l.w]));
ok('the dodger lever names their returning top dodger', S.levers.some(l => /#2 Sample dodge goal/.test(l.title)));
ok('defender lever picks our least-beaten defender with 8+ reps', S.levers.some(l => /^Put #40 on #2/.test(l.title)), S.levers.map(l => l.title));
ok('a slide lever appears from practice slide shots', S.levers.some(l => /Slide on 3 more/.test(l.title)));
ok('a shot-clock lever appears from their shot-clock profile', S.levers.some(l => /shoot later/.test(l.title)));
ok('our pick pairs come from logged pick shots, best first', S.pairs.list.length === 2 && S.pairs.list[0].scr === '7' && S.pairs.list[0].rate > S.pairs.list[1].rate, S.pairs.list);
ok('groupings come from lineup logs with possession ends', S.groups.list.length === 2 && S.groups.list.every(g => g.n >= 8), S.groups.list.map(g => [g.players.join(' '), g.n]));
const S0 = V3.sheet.build(Object.assign({}, inp, { opts: { games: 1500, use: { 'pair:7>9': 0 } } }));
ok('a unit at 0% usage gives exactly the baseline win %', near(S0.pairs.list.find(p => p.key === 'pair:7>9').w, S0.BT, 1e-12), [S0.pairs.list[0].w, S0.BT]);
const S100 = V3.sheet.build(Object.assign({}, inp, { opts: { games: 1500, use: { 'pair:7>9': 100 } } }));
ok('more usage of a better-than-team pair raises the win %', S100.pairs.list.find(p => p.key === 'pair:7>9').w > S.pairs.list.find(p => p.key === 'pair:7>9').w);
ok('our goalies are compared by replaying with each in net (#31 saves 55%, #32 40%: #31 first)', S.ourGoalies.length === 2 && S.ourGoalies[0].j === '31' && S.ourGoalies[0].w > S.ourGoalies[1].w + 0.1, S.ourGoalies.map(g => [g.j, g.w]));
ok('every loss gets one cause; shares add to 1', near(S.causes.reduce((a, c) => a + c.share, 0), 1, 1e-9) && S.causes.every(c => c.todo && c.inLoss), S.causes);
const Sx = V3.sheet.build(inp); V3.sheet.unitWin(Sx, 'pair:7>9', 100);
ok('replaying one row matches a full rebuild at that usage', near(Sx.pairs.list.find(p => p.key === 'pair:7>9').w, S100.pairs.list.find(p => p.key === 'pair:7>9').w, 1e-12));
ok("the replay context isn't saved with the sheet", !('_ctx' in JSON.parse(JSON.stringify(Sx))));
// Scrimmage rows where we shot are against their goalie and their defenders: they must not count as ours.
const scrim = shots.concat(Array.from({ length: 40 }, () => ({ context: 'Scrimmage', team: 'WLU', goalieJersey: '31', goalX: 0.5, goalY: 0.5, goal: 1, onKeeper: 1, defender: '40', defBeaten: 'Yes', offDodge: 1, slideDefender: '42' })));
const Ss = V3.sheet.build(Object.assign({}, inp, { practice: Object.assign({}, inp.practice, { shots: scrim }) }));
ok('scrimmage shots by us are left out of our goalie, defender and slide numbers', JSON.stringify(Ss.ourGoalies.map(g => [g.j, g.n, g.base])) === JSON.stringify(S.ourGoalies.map(g => [g.j, g.n, g.base])) && Ss.defenders.n === S.defenders.n);
const lp = S.levers.find(l => /^Give #7 → #9/.test(l.title));
ok('the pick-pair lever uses pick goals per pick possession from the sim (no fixed 12)', lp && isFinite(lp.dG) && lp.dG > 0 && /Best of 2 pairs/.test(lp.why), lp);
const rl = S.levers.find(l => l.area === 'Ride');
ok('the ride lever changes their failed clears in the engine (one more possession)', rl && rl.poss === 1 && rl.sets['opp.clearfail'] > 1, rl);
ok('returning-roster note and removed players are reported', /returning/.test(S.teams.opp.note) && S.teams.opp.removed.some(r => r.j === '1'));
ok('same inputs give the same sheet', JSON.stringify(V3.sheet.build(inp).levers) === JSON.stringify(S.levers));
const pass = results.filter(r => r.ok).length; console.log(`game-week sheet: pass ${pass}  fail ${results.length - pass}`); Deno.exit(pass === results.length ? 0 : 1);

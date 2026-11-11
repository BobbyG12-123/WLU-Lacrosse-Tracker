// Updating an opponent from our own logged games (engine v3). Synthetic only. Run from the repo root:
// deno run --check=none --allow-read=. matchup/v3/_tests/update_tests.js
for (const f of ['../model.js', '../engine.js', '../update.js', '../sheet.js', '../sources.js', '../../picks.js', './fixtures_v3.js']) await import(new URL(f, import.meta.url));
const MS = globalThis.MS, V3 = MS.V3, FX = globalThis.FX3; const results = [];
const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log((cond ? '  OK   ' : '  FAIL ') + name + (cond || info === undefined ? '' : '  ' + JSON.stringify(info).slice(0, 500))); };
const near = (a, b, t) => Math.abs(a - b) <= t, L = p => Math.log(p / (1 - p));
const D3 = Object.assign({ eff: 0.26, emo: 0.36 }, { by_type: FX.meta.sb_league.by_type, pick: FX.meta.sb_league.pick, no_pick: FX.meta.sb_league.no_pick });
// Logged rows: 2 sessions against 'Testa' (one game, one scrimmage) + practice rows that must be ignored.
const row = (o) => Object.assign({ context: 'Game', opponent: 'Testa', date: '2027-03-01', team: 'WLU', goal: 0, rebound: null, transition: 0, manSituation: 'Even' }, o);
const shots = [], poss = [];
for (let i = 0; i < 20; i++) shots.push(row({ goal: i < 8 ? 1 : 0, transition: i < 4 ? 1 : 0, manSituation: i < 2 ? 'Man-Up' : 'Even' }));
shots.push(row({ rebound: 'Yes', goal: 1 }));
for (let i = 0; i < 16; i++) shots.push(row({ team: 'OPP', oppShooter: i < 10 ? '2' : '3', goal: i < 5 ? 1 : 0, manSituation: i < 3 ? 'Man-Down' : 'Even', goalX: 0.1, goalY: 0.1, onKeeper: 1 }));
for (let i = 0; i < 6; i++) poss.push(row({ team: 'WLU', end: 'Turnover' })), poss.push(row({ team: 'OPP', end: 'Turnover' }));
for (let i = 0; i < 10; i++) shots.push(row({ context: 'Scrimmage', date: '2027-02-10', team: 'OPP', oppShooter: '2', goal: i < 2 ? 1 : 0, goalX: 0.9, goalY: 0.9, onKeeper: 1 }));
for (let i = 0; i < 30; i++) shots.push(row({ context: 'Practice', opponent: null, team: 'WLU', goal: 1 }));
const Lg = V3.update.fromLogs(shots, poss, [{ context: 'Game', opponent: 'Testa', won: true }, { context: 'Game', opponent: 'Testa', won: false }, { context: 'Practice', opponent: null, won: true }], ['Testa']);
ok('sessions: one game and one scrimmage against them; practice rows left out', Lg.sessions === 2 && Lg.games === 1 && Lg.scrimmages === 1, Lg);
ok('our possessions = shots that aren’t rebounds + no-shot possessions (20 + 6)', Lg.us.poss === 26 && Lg.us.goals === 9 && Lg.us.shots === 21, Lg.us);
ok('their possessions and goals (16 + 10 shots, + 6 turnovers)', Lg.them.poss === 32 && Lg.them.goals === 7, Lg.them);
ok('man-up is read from each side: our Man-Up rows, their Man-Down rows', Lg.us.manUp.poss === 2 && Lg.them.manUp.poss === 3);
ok('faceoffs against them only (practice draws left out)', Lg.fo.att === 2 && Lg.fo.won === 1);
// applyLogs
const O = V3.team(FX.opp, { d3eff: 0.26 }), W = V3.team(FX.wl, { d3eff: 0.26 });
const none = V3.update.applyLogs(O, W, { sessions: 0 }, D3);
ok('no logged sessions: their numbers stay as they are, and it says so', none.team === O && /No 2027 games/.test(none.notes[0]));
const odds = p => p / (1 - p), expRate = p => { const o = odds(p) * odds(W.adjDef) / odds(D3.eff); return o / (1 + o); };
const same = { sessions: 1, games: 1, scrimmages: 0, them: { poss: 100, goals: Math.round(100 * expRate(O.adjOff)), rows: [] }, us: { poss: 0, goals: 0, rows: [] }, fo: { att: 0, won: 0 } };
const U0 = V3.update.applyLogs(O, W, same, D3);
ok('playing exactly as their record predicts leaves their offense (almost) unchanged', near(U0.team.adjOff, O.adjOff, 0.004), [U0.team.adjOff, O.adjOff]);
const U = V3.update.applyLogs(O, W, Lg, D3), obs = (() => { const o = odds(7 / 32) * odds(D3.eff) / odds(W.adjDef); return o / (1 + o); })();
ok('their offense moves toward what we saw with weight possessions / (150 + possessions)', near(L(U.team.adjOff), (150 * L(O.adjOff) + 32 * L(obs)) / 182, 1e-9), [U.team.adjOff, O.adjOff, obs]);
const Uc = V3.update.applyLogs(O, W, Lg, D3, { crossDivision: true });
ok('a record from another division counts less (50), so our logs move it further', Math.abs(Uc.team.adjOff - O.adjOff) > Math.abs(U.team.adjOff - O.adjOff));
ok('…and its faceoff starting point counts less too (20 draws instead of 40)', Uc.foLogged.k === 20 && U.foLogged.k === 40);
ok('one logged session is flagged as a first read; two are not', U0.notes.some(n => /one logged session/.test(n)) && !U.notes.some(n => /one logged session/.test(n)));
ok('under 30 logged shots: shooters stay from their record', U.team.shooters === O.shooters && /26 of their shots logged; 30 needed/.test(U.notes.join(' ')), U.notes);
const many = Object.assign({}, Lg, { them: Object.assign({}, Lg.them, { rows: Lg.them.rows.concat(Lg.them.rows) }) });
const U2 = V3.update.applyLogs(O, W, many, D3);
ok('30+ logged shots: shooters come from our logs, shares add to 1', U2.team.shooters.every(s => s.fromLogs) && near(U2.team.shooters.reduce((a, s) => a + s.share, 0), 1, 1e-12), U2.team.shooters);
ok('placement from their shots on our goalies: #2 mixes low left and high right, #3 low left', U.placement && near(U.placement['2']['Low Left'], 10 / 20, 1e-12) && near(U.placement['2']['High Right'], 10 / 20, 1e-12) && U.placement['3']['Low Left'] === 1, U.placement);
// faceoff blending in the matchup
const P0 = V3.matchup(W, O, { d3: D3 }), P1 = V3.matchup(W, O, { d3: D3, foLogged: { att: 40, won: 32, k: 40 } });
ok('logged draws pull the faceoff chance halfway on the log-odds scale (40 vs 40)', near(L(P1.fo), (L(P0.fo) + L(32.5 / 41)) / 2, 1e-9), [P0.fo, P1.fo]);
// teams without film data
const NF = JSON.parse(JSON.stringify(FX.opp)); delete NF.sb;
let threw = false; try { V3.team(NF, { d3eff: 0.26 }); } catch (e) { threw = true; } ok('a team without film data is refused unless the D3 shape is given', threw);
const T = V3.team(NF, { d3eff: 0.26, d3: D3 }); ok('with the D3 shape it builds, marked as no film data', T.noFilm && T.off.by_type.settled.goal_pct === D3.by_type.settled.goal_pct);
// end to end: sources + sheet with logged sessions
const exp = JSON.parse(JSON.stringify(FX.exp)), sid = '2027-03-01-game';
exp.collections.sessions[sid] = { date: '2027-03-01', context: 'Game', opponent: 'Testa' }; let n = 5000;
const put = o => { const r = FX.cols.shot.map(c => o[c] ?? null); r[0] = ++n; exp.collections.sessions[sid]['s_' + n] = JSON.stringify(r); };
for (let i = 0; i < 40; i++) put({ team: 'OPP', goal: i < 20 ? 1 : 0, goalieJersey: '31', goalX: 0.1, goalY: 0.1, onKeeper: 1, outcome: i < 20 ? 'Goal' : 'Saved' });
const FXo = JSON.parse(JSON.stringify(FX.opp)); FXo.name = 'Testa College'; FXo.short = 'TES';
const I = V3.sources.inputs(exp, FX.cols, { meta: FX.meta, teams: { 410: FX.wl, 901: FXo }, players: { 901: [] } }, { oppId: 901, d3: D3 });
ok('the tracker label is matched to the team automatically (Testa → Testa College)', I.labels.join() === 'Testa' && I.logged.sessions === 1, [I.labels, I.opponentLabels]);
const S = V3.sheet.build(Object.assign({}, I, { opts: Object.assign({}, I.opts, { games: 1200 }) }));
ok('the sheet lists what our logs changed, and uses logged placement for the goalie comparison', S.updates.some(u => /From 1 logged session/.test(u)) && S.updates.some(u => /Where they shoot/.test(u)) && !S.missing.some(m => /shooters put the ball/.test(m)), [S.updates, S.missing]);
ok('a hot logged game against us raises their offense', (() => { const u = S.updates.find(x => /their offense/.test(x)); const m = u && /their offense ([\d.]+)% → ([\d.]+)%/.exec(u); return m && +m[2] > +m[1]; })(), S.updates);
const pass = results.filter(r => r.ok).length; console.log(`opponent updates: pass ${pass}  fail ${results.length - pass}`); Deno.exit(pass === results.length ? 0 : 1);

// Matchup engine tests. Synthetic only. Run: _matchup/tests/run.sh
const base = new URL('..', import.meta.url);
for (const f of ['rules.js', 'constants.js', 'engine.js', 'results.js', 'estimate.js', 'tests/fixtures.js']) await import(new URL(f, base));
const MS = globalThis.MS, FX = globalThis.FX, T = MS.TEAM, R = MS.RULES;
const results = [], covered = new Set();
const ok = (name, cond, info, rules) => { results.push({ name, ok: !!cond, info }); if (cond && rules) rules.forEach(r => covered.add(r)); };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const sim = (P, seed) => MS.simulateGame(P, seed).ledger;
const hand = events => { let seq = 0; return events.map(e => Object.assign({ seq: seq++, t: 0, period: 1, left: 9000 }, e)); };

// ---------- 1. deterministic golden fixtures ----------
{ // Shooting: 40 shots, 24 on goal, 10 goals, 14 saves, 16 not on goal, 6 assists.
  const ev = [{ type: 'game_start' }, { type: 'period_start' }, { type: 'lineup', team: 0, players: ['s', 'p'], goalie: 'g0' }, { type: 'lineup', team: 1, players: ['d'], goalie: 'g1' }, { type: 'possession_start', team: 0, pid: 1 }];
  for (let i = 0; i < 40; i++) { const outcome = i < 10 ? 'goal' : i < 24 ? 'save' : i < 32 ? 'wide' : i < 36 ? 'pipe' : 'blocked'; const e = { type: 'shot', team: 0, pid: 1, shooter: 's', outcome, goalie: 'g1' }; if (outcome === 'goal' && i < 6) e.assist = 'p'; ev.push(e); }
  ev.push({ type: 'possession_end', team: 0, pid: 1, reason: 'goal' }, { type: 'period_end', reason: 'goal' }, { type: 'game_end', score: [10, 0], winner: 0, periods: 1, overtime: false });
  const b = MS.boxFromLedger(hand(ev)), t = b.teams[0], gl = b.teams[1];
  ok('fixture 1: shooting 25%', MS.rate(t.g, t.sh) === 0.25, t);
  ok('fixture 1: on target 60%', MS.rate(t.sog, t.sh) === 0.6);
  ok('fixture 1: opposing save 58.333333%', near(MS.rate(gl.sv, gl.sv + gl.ga), 14 / 24) && near(100 * gl.sv / (gl.sv + gl.ga), 58.333333, 1e-6), null, ['S-goalie']);
  ok('fixture 1: goals plus assists are 16 points', t.g + t.a === 16);
  ok('fixture 1: each shot has exactly one outcome', t.sog + t.pipe + t.wide + t.bl === 40, null, ['S-sog']);
  ok('fixture 1: pipe shots are not on goal', t.pipe === 4 && t.sog === 24, null, ['S-sog']);
}
{ // Turnovers: 12 total, 7 caused, 5 unforced.
  const ev = [{ type: 'game_start' }, { type: 'period_start' }];
  for (let i = 0; i < 12; i++) ev.push({ type: 'turnover', team: 0, pid: i, reason: 'play', player: 'a', causedBy: i < 7 ? 'd' : null, causedTeam: i < 7 ? 1 : null });
  const b = MS.boxFromLedger(hand(ev));
  ok('fixture 2: 12 turnovers, 7 caused by the opponent, no extras', b.teams[0].to === 12 && b.teams[1].ct === 7 && b.teams[1].to === 0, null, ['S-to']);
}
{ // Faceoffs 13/25 and 12/25.
  const ev = [{ type: 'game_start' }, { type: 'period_start' }];
  for (let i = 0; i < 25; i++) ev.push({ type: 'faceoff', winner: i < 13 ? 0 : 1, fw: i < 13 ? 'f0' : 'f1', fl: i < 13 ? 'f1' : 'f0' });
  const b = MS.boxFromLedger(hand(ev)), A = b.teams[0], C = b.teams[1];
  ok('fixture 3: 52% and 48%, same attempts, complementary', A.fw === 13 && C.fw === 12 && A.fl === C.fw && C.fl === A.fw && near(A.fw / (A.fw + A.fl), 0.52) && near(C.fw / (C.fw + C.fl), 0.48));
}
{ // Worked examples.
  const p = MS.betaPosterior(20, 60, 0.30, 20);
  ok('fixture 4: prior example 20/60 at .30 weight 20 = 26/80 = .325', p.a === 26 && p.b === 54 && near(p.a / (p.a + p.b), 0.325));
  const o = MS.outcomeProbs(0, 0.6, 0.4, 0.5);
  ok('fixture 4: shot branch .24, .36, .40', near(o.goal, 0.24) && near(o.save, 0.36) && near(o.pipe + o.wide, 0.40));
  ok('fixture 4: faceoff matchup .60 vs .55 = .5510204082', near(MS.faceoffMatchup(0.6, 0.55), 0.5510204082, 1e-9));
  ok('fixture 4: equal faceoff abilities = .50', near(MS.faceoffMatchup(0.57, 0.57), 0.5));
  const games = [{ box: gameBox(1, 1) }, { box: gameBox(9, 1) }];
  function gameBox(sv, ga) { return { sv, ga }; }
  const pooled = (games[0].box.sv + games[1].box.sv) / (2 + 10), meanGame = (1 / 2 + 9 / 10) / 2;
  ok('fixture 4: pooled save 83.33% vs mean-game 70% stay different', near(pooled, 10 / 12) && near(meanGame, 0.7));
  ok('Monte Carlo error at p=.5, M=10000 is .005', near(Math.sqrt(0.25 / 10000), 0.005));
  ok('nearest rank uses ceil(qM)', MS.nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1) === 1 && MS.nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9) === 9 && MS.nearestRank([1, 2, 3], 0.5) === 2);
  ok('zero denominators return null, never 0', MS.rate(0, 0) === null && MS.rate(0, 5) === 0);
  for (let i = 0; i < 400; i++) { const b = i / 400, q = (i * 7 % 400) / 400, r = (i * 13 % 400) / 400, pp = (i * 19 % 400) / 400, x = MS.outcomeProbs(b, q, r, pp); if (!near(x.goal + x.save + x.pipe + x.wide + x.blocked, 1, 1e-12)) { ok('shot probabilities sum to one', false, x); break; } if (i === 399) ok('shot probabilities sum to one', true); }
}
{ // Team saves and team credits.
  const ev = hand([{ type: 'game_start' }, { type: 'period_start' }, { type: 'team_save', team: 1 }, { type: 'shot', team: 0, pid: 1, shooter: T, outcome: 'save', goalie: 'g' }, { type: 'turnover', team: 0, pid: 1, reason: 'play', player: T, causedBy: null }]);
  const b = MS.boxFromLedger(ev);
  ok('fixture 6: team saves and team turnovers sit in team buckets', b.players[1][T].sv === 1 && b.players[1].g.sv === 1 && b.teams[1].sv === 2 && b.players[0][T].to === 1, null, ['S-goalie', 'S-to']);
}

// ---------- 2. rules functions ----------
ok('valid shots: save, pipe, goal yes; wide, blocked no', MS.isValidShot('save') && MS.isValidShot('pipe') && MS.isValidShot('goal') && !MS.isValidShot('wide') && !MS.isValidShot('blocked'), null, ['R4-15-valid']);
ok('valid shot retained in offensive half resets to 60', MS.clockAfterShot(120, 'pipe', true, true) === 600 && MS.clockAfterShot(120, 'save', true, true) === 600, null, ['R4-15-60']);
ok('valid shot retained in defensive half resets to 80', MS.clockAfterShot(120, 'save', true, false) === 800, null, ['R4-15-80b']);
ok('wide or blocked retained does not reset', MS.clockAfterShot(120, 'wide', true, true) === 120 && MS.clockAfterShot(120, 'blocked', true, true) === 120, null, ['R4-15-valid']);
ok('change of possession is 80', MS.clockAfterShot(120, 'pipe', false, true) === 800 && MS.clockAfterShot(120, 'wide', false, true) === 800, null, ['R4-15-80']);
ok('foul with offense retaining: at or under 60 goes to 60, over 60 to 80', MS.clockAfterFoulRetained(120) === 600 && MS.clockAfterFoulRetained(600) === 600 && MS.clockAfterFoulRetained(601) === 800, null, ['R4-15-foul']);
ok('extra man at the horn: same team keeps its clock, other team gets 80', (() => { const a = MS.nextPeriodStart(0, 0, 321), b = MS.nextPeriodStart(0, 1, 321), c = MS.nextPeriodStart(null, 1, 321), d = MS.nextPeriodStart(0, null, 321); return a.team === 0 && a.clockDs === 321 && b.team === 0 && b.clockDs === 800 && c.type === 'faceoff' && d.type === 'faceoff'; })(), null, ['R4-3-E1', 'R4-15-carry']);
ok('regulation is 4 x 15, overtime is 15', R.periodDs === 9000 && R.regulationPeriods === 4 && R.overtimeDs === 9000);

// ---------- 3. engine invariants: every game reconciles, across varied synthetic settings ----------
const variety = [
  ['baseline', {}], ['named penalties', { a: { namedPenalties: true }, b: { namedPenalties: true } }], ['many fouls', { a: { foul: 0.4, namedPenalties: true }, b: { foul: 0.4 } }],
  ['all shots, high finishing', { a: { shotVsTO: 0.99, q: 0.95, r: 0.9 }, b: { shotVsTO: 0.99, q: 0.95, r: 0.9 } }], ['all turnovers', { a: { shotVsTO: 0.02 }, b: { shotVsTO: 0.02 } }], ['bad clears', { a: { clear: 0.2 }, b: { clear: 0.2 } }], ['low scoring', { a: { r: 0.03, q: 0.3 }, b: { r: 0.03, q: 0.3 } }], ['long actions', { a: {}, b: {}, tempo: { actionMeanSec: 90 } }],
  ['full retention', { a: {}, b: {}, retention: { saveHeld: 0, loose: 1, wide: 1, blocked: 1 } }], ['no retention', { a: {}, b: {}, retention: { saveHeld: 1, loose: 0, wide: 0, blocked: 0 } }], ['posterior draws', { a: {}, b: {}, uncertainty: 'posterior' }]
];
let total = 0, sawOT = 0;
for (const [label, v] of variety) {
  const P = FX.params(v.a, v.b, v); let bad = null;
  for (let s = 0; s < 150; s++) { const L = sim(P, MS.gameSeed(99, s)), pr = MS.validateGame(L, P); total++; if (MS.boxFromLedger(L).overtime) sawOT++; if (pr.length) { bad = { seed: s, pr: pr.slice(0, 6) }; break; } }
  ok(`every game reconciles: ${label}`, !bad, bad, ['R3-1', 'R4-15-80', 'R4-3', 'R4-10', 'S-assist', 'S-fo']);
}
const teamP = FX.params({}, {}); teamP.teams[1] = FX.teamLevel('y'); teamP.teams[0].rotation.fogo = [{ id: 'xf1', weight: 1 }];
{ let bad = null; for (let s = 0; s < 200 && !bad; s++) { const L = sim(teamP, s), pr = MS.validateGame(L, teamP); if (pr.length) bad = { s, pr: pr.slice(0, 5) }; } ok('a team-level opponent reconciles with team buckets only', !bad, bad);
  const b = MS.boxFromLedger(sim(teamP, 3)); ok('a team-level opponent never shows an invented player', Object.keys(b.players[1]).every(k => k === T), Object.keys(b.players[1])); }
ok('validator catches errors', (() => { const P = FX.params(); const L = sim(P, 5); const sh = L.find(e => e.type === 'shot'); const c1 = L.map(e => Object.assign({}, e)); c1.find(e => e.type === 'shot').shooter = 'nobody'; const c2 = L.map(e => Object.assign({}, e)); c2[c2.length - 1].score = [99, 0]; return sh && MS.validateGame(c1, P).length > 0 && MS.validateGame(c2, P).length > 0; })());

// ---------- 4. flow checks tied to rules ----------
function allGames(P, n, fn) { for (let s = 0; s < n; s++) { const L = sim(P, MS.gameSeed(7, s)); if (fn(L, s) === false) return false; } return true; }
{ const P = FX.params({ shotVsTO: 0.9 }, { shotVsTO: 0.9 });
  ok('a faceoff follows each goal and opens each period', allGames(P, 100, L => { for (let i = 0; i < L.length; i++) { const e = L[i]; if (e.type === 'shot' && e.outcome === 'goal' && !(L.slice(i + 1).find(x => ['faceoff', 'possession_start', 'game_end', 'period_end'].includes(x.type)) || {}).type) return false; if (e.type === 'shot' && e.outcome === 'goal') { const n = L.slice(i + 1).find(x => ['faceoff', 'possession_start'].includes(x.type)); if (n && n.type === 'possession_start') return false; } } }), null, ['R4-3']);
  ok('faceoff win starts 80 seconds', allGames(P, 50, L => L.filter(e => e.type === 'possession_start' && e.source === 'faceoff').every(e => e.clock === 800)), null, ['R4-15-80']);
  const Pr = FX.params({}, {}, { retention: { saveHeld: 0, loose: 1, wide: 1, blocked: 1 } });
  let multi = 0, resetOK = true, wideOK = true;
  allGames(Pr, 80, L => { const c = {}; let prevClock = null; L.forEach((e, i) => { if (e.type === 'shot') { c[e.pid] = (c[e.pid] || 0) + 1; const n = L.slice(i + 1).find(x => x.type === 'retained' && x.pid === e.pid); if (n && (e.outcome === 'save' || e.outcome === 'pipe') && n.clock !== 600) resetOK = false; if (n && e.outcome === 'wide' && n.clock !== e.clock) wideOK = false; } }); multi += Object.values(c).filter(v => v > 1).length; });
  ok('several shots after retained misses stay one possession', multi > 200, { multi });
  ok('save or pipe retained resets to 60 in play', resetOK, null, ['R4-15-60']);
  ok('wide retained keeps the same clock in play', wideOK, null, ['R4-7', 'R4-15-valid']);
  const P0 = FX.params({}, {}, { retention: { saveHeld: 1, loose: 0, wide: 0, blocked: 0 } });
  ok('a non-goal shot can hand over the ball only through a logged change', allGames(P0, 40, L => L.every((e, i) => e.type !== 'shot' || e.outcome === 'goal' || L.slice(i + 1, i + 6).some(x => x.type === 'possession_end'))));
  let keeps = 0, loses = 0; allGames(FX.params(), 60, L => L.forEach((e, i) => { if (e.type === 'shot' && e.outcome !== 'goal') { const n = L.slice(i + 1).find(x => x.type === 'retained' || x.type === 'possession_end'); if (n && n.type === 'retained') keeps++; else loses++; } }));
  ok('a non-goal shot does not automatically give the other team the ball', keeps > 200 && loses > 200, { keeps, loses }, ['R4-7']);
  const fail = FX.params({ clear: 0.05 }, { clear: 0.05 });
  ok('a failed clear ends the possession once and is one turnover', allGames(fail, 60, L => { const fc = L.filter(e => e.type === 'clear' && !e.ok).length, to = L.filter(e => e.type === 'turnover' && e.reason === 'failed_clear').length, ends = {}; L.forEach(e => { if (e.type === 'possession_end') ends[e.pid] = (ends[e.pid] || 0) + 1; }); return fc === to && Object.values(ends).every(v => v === 1); }), null, ['R4-16']);
  ok('a clear attempt resolves within 20 seconds of control', allGames(fail, 40, L => { let st = null; for (const e of L) { if (e.type === 'possession_start') st = e; if (e.type === 'clear' && st && e.pid === st.pid && st.clock === 800 && e.t - st.t > 200) return false; } }), null, ['R4-16']);
  const slow = FX.params({ shotVsTO: 0.9 }, { shotVsTO: 0.9 }, { tempo: { actionMeanSec: 75 } });
  let exp = 0; allGames(slow, 40, L => L.forEach(e => { if (e.type === 'turnover' && e.reason === 'shot_clock') exp++; }));
  ok('shot clock expiry happens and is a team turnover', exp > 50 && allGames(slow, 10, L => L.filter(e => e.type === 'turnover' && e.reason === 'shot_clock').every(e => e.player === T && !e.causedBy)), { exp }, ['R4-15-exp', 'S-to']);
  ok('no shot is released after the horn', allGames(FX.params(), 80, L => L.every(e => e.type !== 'shot' || e.left > 0)), null, ['R4-10']);
  ok('no faceoff is credited if the period ends first', allGames(FX.params({}, {}, { tempo: { faceoffMeanSec: 500 } }), 15, L => { const fo = L.filter(e => e.type === 'faceoff').length, b = MS.boxFromLedger(L); return b.teams[0].fw + b.teams[1].fw === fo; }), null, ['S-fo']);
}
{ // Overtime.
  const P = FX.params({ r: 0.05, q: 0.25, shotVsTO: 0.3 }, { r: 0.05, q: 0.25, shotVsTO: 0.3 });
  let ot = 0, otOK = true, multi = 0, longest = 0;
  allGames(P, 300, L => { const b = MS.boxFromLedger(L); if (!b.overtime) return; ot++; const lastShot = [...L].reverse().find(e => e.type === 'shot' && e.outcome === 'goal'), after = L.slice(lastShot.seq + 1).filter(e => !['possession_end', 'period_end', 'game_end', 'penalty_end', 'penalty_start'].includes(e.type)); if (after.length) otOK = false; if (b.score[0] === b.score[1]) otOK = false; if (b.periods > 5) multi++; longest = Math.max(longest, b.periods); const ps = L.filter(e => e.type === 'period_start' && e.overtime); if (ps.some(e => e.left !== 9000)) otOK = false; });
  ok('tied regulation goes to 15-minute overtime; first goal ends it with one winner', ot > 40 && otOK, { ot, otOK }, ['R3-4', 'R4-3']);
  ok('overtime can run past one period', multi > 0, { multi, longest }, ['R3-4']);
}
{ // Penalties.
  const P = FX.params({ foul: 0.45, namedPenalties: true }, { foul: 0.45, namedPenalties: true }, { penalties: { technicalShare: 0.2, nonreleasableShare: 0.3, personalMix: [0.3, 0.3, 0.4] } });
  let goalRel = 0, nonRelHeld = true, multiPeriod = 0, carry = 0, maxServe = 0, waited = 0, absent = true, defenseKeep = true, restarts = 0, techNoTime = 0, sourceFoul = 0;
  allGames(P, 150, L => { const live = {}; let s0 = 0, s1 = 0; let cur = [0, 0];
    L.forEach((e, i) => {
      if (e.type === 'penalty' && e.ds) live[e.penaltyId] = Object.assign({}, e, { per: e.period });
      if (e.type === 'penalty' && !e.ds) techNoTime++;
      if (e.type === 'penalty_start') { cur[e.team]++; maxServe = Math.max(maxServe, cur[e.team]); if (e.t !== (live[e.penaltyId] || {}).t) waited++; }
      if (e.type === 'penalty_end') { cur[e.team]--; if (e.reason === 'goal') { goalRel++; if (live[e.penaltyId] && !live[e.penaltyId].releasable) nonRelHeld = false; } if (live[e.penaltyId] && e.period !== live[e.penaltyId].per) multiPeriod++; }
      if (e.type === 'possession_start' && e.source === 'period_carry') carry++;
      if (e.type === 'possession_start' && e.source === 'foul') { sourceFoul++; if (e.clock !== 800) defenseKeep = false; }
      if (e.type === 'restart') restarts++;
    }); });
  ok('a goal releases releasable penalties only', goalRel > 50 && nonRelHeld, { goalRel, nonRelHeld }, ['R7-2-b']);
  ok('penalty time carries across periods', multiPeriod > 10, { multiPeriod }, ['R7-2-c']);
  ok('a period can restart with the extra-man team holding the ball', carry > 5, { carry }, ['R4-3-E1', 'R4-15-carry']);
  ok('at most three serve at once and further time waits', maxServe <= 3 && waited > 5, { maxServe, waited }, ['R7-2-f']);
  ok('a technical foul by the team with the ball serves no time', techNoTime > 20, { techNoTime }, ['R6-2']);
  ok('personal fouls serve 1, 2 or 3 minutes; technicals serve 30 seconds', allGames(P, 60, L => L.filter(e => e.type === 'penalty' && e.ds).every(e => e.kind === 'personal' ? [600, 1200, 1800].includes(e.ds) : e.ds === 300)), null, ['R5-2', 'R6-2']);
  ok('after a foul with the ball, the other team restarts with 80 and no clear', sourceFoul > 100 && defenseKeep && allGames(P, 40, L => !L.some((e, i) => e.type === 'clear' && (() => { const st = [...L.slice(0, i)].reverse().find(x => x.type === 'possession_start'); return st && st.source === 'foul'; })())), { sourceFoul }, ['R4-15-80', 'R7-3']);
  ok('a foul against the ball carrier restarts by the rule', restarts > 100 && allGames(P, 40, L => L.filter(e => e.type === 'restart').every(e => e.clock === 600 || e.clock === 800)), { restarts }, ['R4-15-foul']);
  ok('a penalized named player never acts while serving', allGames(P, 120, L => { const out = [new Set(), new Set()], byId = {}; for (const e of L) { if (e.type === 'penalty_start' && e.player !== T) { out[e.team].add(e.player); byId[e.penaltyId] = e; } if (e.type === 'penalty_end' && e.player !== T) out[e.team].delete(e.player); if (e.type === 'shot' && out[e.team].has(e.shooter)) return false; if (e.type === 'turnover' && out[e.team].has(e.player)) return false; if (e.type === 'lineup' && e.players.some(j => out[e.team].has(j))) return false; } }), null, ['R7-2-c']);
  const tp = FX.params(); ok('a foul with no named player goes to the team bucket', allGames(tp, 30, L => L.filter(e => e.type === 'penalty').every(e => e.player === T)), null, ['R7-4']);
}
{ // Assists.
  const P = FX.params({ assist: 0.9 }, { assist: 0.9 });
  ok('at most one assist per goal, never to the scorer, always on the field', allGames(P, 100, L => L.every(e => e.type !== 'shot' || (!e.assist || (e.assist !== e.shooter && e.outcome === 'goal')))), null, ['S-assist']);
}

{ // Clear and ground ball stages.
  const none = FX.params(); none.clearRequired = 0;
  ok('no clear attempts when no change of possession requires one', allGames(none, 30, L => !L.some(e => e.type === 'clear')));
  const gb = FX.params({}, {}, { retention: { turnoverGroundBall: 1 } });
  ok('every live turnover gives the new team a ground ball when set to 1', allGames(gb, 40, L => L.every((e, i) => { if (e.type !== 'turnover' || e.reason !== 'play') return true; const n = L.slice(i + 1, i + 5).find(x => x.type === 'ground_ball'); return n && n.team === 1 - e.team && n.ctx === 'turnover'; })));
  const em = FX.params({ manUpShift: 2, foul: 0.2 }, { foul: 0.2 }); let on = 0, tot = 0; allGames(em, 80, L => L.forEach(e => { if (e.type === 'shot' && e.extraMan) { tot++; if (e.outcome === 'goal' || e.outcome === 'save') on++; } }));
  ok('an extra man also lifts shots on goal when its shift is positive', tot > 100 && on / tot > 0.75, { on, tot });
}

{ // Rotation shares hold over a game.
  const P = FX.params(), r = MS.runBatch(P, { seed: 12, games: 400 }).summary.players[0], a = r.xm1.minutes, b = r.xm4.minutes;
  ok('midfield lines get the minutes the rotation asks for, within 3 points', Math.abs(a / (a + b) - 0.6) < 0.03, { share: a / (a + b) });
}

// ---------- 5. reproducibility, chunking, cancellation ----------
{ const P = FX.params({}, {}, { uncertainty: 'posterior' }), a = MS.runBatch(P, { seed: 77, games: 300, chunk: 300 }), b = MS.runBatch(P, { seed: 77, games: 300, chunk: 1 }), c = MS.runBatch(P, { seed: 77, games: 300, chunk: 17 }), d = MS.runBatch(P, { seed: 78, games: 300, chunk: 300 });
  const fp = r => JSON.stringify(r.games.map(x => x.ledgerHash));
  ok('identical inputs and seed reproduce every game for any chunk size', fp(a) === fp(b) && fp(a) === fp(c), { same: fp(a) === fp(b) });
  ok('summaries match exactly across chunk sizes', JSON.stringify(a.summary) === JSON.stringify(c.summary));
  ok('a different seed gives different games', fp(a) !== fp(d));
  const g5 = a.games[5], re = MS.regenerate(P, 77, 5); ok('a replay regenerates from its seed with the same ledger', MS.hash32(MS.canon(re.ledger), 7) === g5.ledgerHash);
  let seen = 0; const can = MS.runBatch(P, { seed: 77, games: 300, chunk: 50, shouldCancel: i => i >= 100, onProgress: n => { seen = n; } });
  ok('a cancelled run reports completed games, not requested', can.record.requestedGames === 300 && can.record.completedGames === 100 && can.record.cancelled && can.summary.M === 100 && seen === 100, can.record);
  ok('cancelled games are not in denominators', Object.values(can.summary.scoreDist[0]).reduce((x, y) => x + y, 0) === 100);
  const bad = MS.finishRun(P, { seed: 1, games: 2 }, [Object.assign({}, a.games[0], { problems: ['x'] }), a.games[1]], false);
  ok('failed games stay out of denominators and are counted', bad.summary.M === 1 && bad.record.invalidGames === 1 && bad.record.validationStatus === 'problems');
  ok('the run record names versions, seed, games and rotation', a.record.modelVersion && a.record.rulesVersion === R.version && a.record.seed === 77 && a.record.requestedGames === 300 && a.record.rotation.length === 2 && a.record.paramsHash);
  { const c1 = MS.runBatch(P, { seed: 77, games: 5, codeCommit: 'abc' }).record, c2 = MS.runBatch(P, { seed: 77, games: 5, codeCommit: 'def' }).record; ok('the run record carries the code commit, and it changes the run ID', c1.codeCommit === 'abc' && c1.runId !== c2.runId && 'snapshotHash' in c1 && c1.completedGames === 5); }
  ok('hash does not depend on property order', MS.hashOf({ a: 1, b: [2, { c: 3, d: 4 }] }) === MS.hashOf({ b: [2, { d: 4, c: 3 }], a: 1 }));
  const un = MS.compareRuns(P, JSON.parse(JSON.stringify(P)), 5, 300);
  ok('an unchanged plan gives exactly zero paired difference', un.meanDiff === 0 && un.se === 0 && un.games === 300, un);
}
{ // Reports add up.
  const P = FX.params(), r = MS.runBatch(P, { seed: 11, games: 400 }), S = r.summary, t0 = S.teams[0], t1 = S.teams[1];
  ok('win probabilities sum to one', near(t0.winProbability + t1.winProbability, 1));
  ok('average margin equals the difference in average scores', near(t0.avgMargin, t0.avgScore - t1.avgScore));
  ok('player goals plus team credits equal team goals', near(Object.values(S.players[0]).reduce((a, x) => a + x.goals, 0), t0.avgScore, 1e-9));
  ok('points range is computed from points, not goals plus assists ranges', Object.values(S.players[0]).every(x => x.pointsRange.p90 <= x.goalsRange.p90 + x.assistsRange.p90) && Object.values(S.players[0]).some(x => x.pointsRange.p90 !== x.goalsRange.p90 + x.assistsRange.p90));
  ok('a chance to lead counts ties and shows them separately', Object.values(S.players[0]).some(x => x.chanceLeadPointsTied > 0));
  ok('faceoffs follow goals and period starts, not a formula', r.games.some(x => x.box.teams[0].fw + x.box.teams[0].fl !== x.box.score[0] + x.box.score[1] + 4));
  ok('team and player ground balls reconcile', near(Object.values(S.players[0]).reduce((a, x) => a + x.groundBalls, 0), t0.groundBalls, 1e-9));
}

// ---------- 6. statistics against controlled analytic values ----------
{ const P = FX.params({ blocked: 0.1, q: 0.6, r: 0.5, pipeOfOff: 0.2, foul: 0 }, { foul: 0 }), r = MS.runBatch(P, { seed: 3, games: 3000 }), t = r.summary.teams[0], n = t.shots * 3000, se = p => 4 * Math.sqrt(p * (1 - p) / n);
  const onGoal = 0.9 * 0.6, goal = onGoal * 0.5, pipe = 0.9 * 0.4 * 0.2;
  ok('simulated shot share on goal matches analytic value', near(t.onGoalPct, onGoal, se(onGoal)), { got: t.onGoalPct, want: onGoal });
  ok('simulated shooting % matches analytic value', near(t.shotPct, goal, se(goal)), { got: t.shotPct, want: goal });
  ok('simulated pipe share matches analytic value', near(t.pipeShots / t.shots, pipe, se(pipe)), { got: t.pipeShots / t.shots, want: pipe });
  const m = MS.runBatch(FX.params({ foul: 0.03 }, { foul: 0.03 }, { faceoff: FX.B(0.5, 100000) }), { seed: 4, games: 4000 }), w = m.summary.teams[0].winProbability;
  ok('mirrored equal teams are symmetric within sampling error', Math.abs(w - 0.5) < 3 * Math.sqrt(0.25 / 4000), { w });
  const f = MS.runBatch(FX.params({}, {}, { faceoff: FX.B(0.7, 1e6) }), { seed: 4, games: 1000 }).summary.teams[0].faceoffPct;
  ok('faceoff share matches its parameter', near(f, 0.7, 0.02), { f });
  const lo = MS.runBatch(FX.params({ r: 0.45 }), { seed: 8, games: 1500 }).summary.teams[0], hi = MS.runBatch(FX.params({ r: 0.65 }), { seed: 8, games: 1500 }).summary.teams[0];
  ok('raising finishing raises goals and wins in aggregate', hi.avgScore > lo.avgScore + 1 && hi.winProbability > lo.winProbability + 0.05, { lo: lo.avgScore, hi: hi.avgScore });
  const c1 = MS.compareRuns(FX.params({ r: 0.5 }), FX.params({ r: 0.62 }), 9, 800);
  ok('a real change gives a nonzero paired difference with a standard error', c1.meanDiff > 0 && c1.se > 0, c1);
  const em = MS.runBatch(FX.params({ manUpShift: 1.2, foul: 0.1 }, { foul: 0.1 }), { seed: 5, games: 600 }).summary.teams[0], em0 = MS.runBatch(FX.params({ manUpShift: 0, foul: 0.1 }, { foul: 0.1 }), { seed: 5, games: 600 }).summary.teams[0];
  ok('an extra man finishes better when its shift is positive', em.extraManGoals > em0.extraManGoals, { em: em.extraManGoals, em0: em0.extraManGoals });
}

// ---------- 7. estimator ----------
{ const u = MS.buildInputRow('x', 0.3, 'observed', 'share', 'src', 40);
  ok('every input row has class, units, source and sample', u.cls === 'observed' && u.units && u.source && u.n === 40);
  ok('every constant is classified', Object.values(MS.CONSTANTS).every(c => ['rule', 'observed', 'fitted', 'assumption', 'rendering'].includes(c.cls) && c.unit && c.source));
  const kp = MS.fitKappa([{ k: 30, n: 100 }, { k: 40, n: 100 }, { k: 22, n: 100 }, { k: 45, n: 100 }, { k: 25, n: 100 }, { k: 38, n: 100 }]);
  ok('prior weight fit responds to real spread', kp.kappa > 10 && kp.kappa < 100 && kp.method === 'moments', kp);
  const kf = MS.fitKappa([{ k: 30, n: 100 }, { k: 31, n: 100 }, { k: 29, n: 100 }, { k: 30, n: 100 }, { k: 30, n: 100 }]);
  ok('no measurable spread hits the ceiling and says so', kf.kappa === MS.CONSTANTS.kappaCeiling.value && kf.note, kf);
  const ks = MS.fitKappa([{ k: 3, n: 10 }]);
  ok('too few players falls back and says so', ks.method === 'fallback' && ks.kappa === MS.CONSTANTS.kappaDefault.value, ks);
}

// ---------- 7b. worker runner ----------
{ const P = FX.params({}, {}, { uncertainty: 'posterior' }), mk = () => new Worker(new URL('worker_module.js', import.meta.url), { type: 'module' }), fp = r => JSON.stringify(r.games.map(x => x.ledgerHash));
  const direct = MS.runBatch(P, { seed: 21, games: 120 }), w1 = await MS.runBatchWorkers(P, { seed: 21, games: 120, chunk: 120, workers: 1 }, mk), w3 = await MS.runBatchWorkers(P, { seed: 21, games: 120, chunk: 7, workers: 3 }, mk);
  ok('worker runs match in-process runs for any chunk and worker count', fp(direct) === fp(w1) && fp(direct) === fp(w3));
  let prog = 0; const can = await MS.runBatchWorkers(P, { seed: 21, games: 120, chunk: 10, workers: 1, onProgress: n => { prog = n; }, shouldCancel: n => n >= 30 }, mk);
  ok('a cancelled worker run reports completed games honestly', can.record.cancelled && can.record.completedGames === 30 && can.summary.M === 30 && prog === 30, can.record);
  const brokenWorker = () => { const w = { terminate() {}, postMessage() { setTimeout(() => w.onerror({}), 0); } }; return w; };
  const br = await MS.runBatchWorkers(P, { seed: 21, games: 50, chunk: 25, workers: 1 }, brokenWorker);
  ok('a failed worker never reports requested games as completed', br.record.completedGames === 0 && br.record.requestedGames === 50 && br.record.failedChunks === 1 && br.summary.M === 0, br.record);
}

// ---------- 7c. adapter and compile, on a synthetic export ----------
{ await import(new URL('adapter.js', base));
  const page = 'const COLS = ["id","date","context","shooterJersey","goalieJersey","outcome","rebound","team","assistJersey"];\nconst POSS_COLS = ["id","date","context","team","end","turnoverBy","causedBy"];';
  const shot = (o, t, s = '1', a = null, g = '30') => JSON.stringify([1, '2026-10-01', 'Practice', s, g, o, 'No', t, a]), po = (e, t, b, c) => JSON.stringify([1, '2026-10-01', 'Practice', t, e, b, c]);
  const exp = { exportedAt: 'synthetic', collections: { app: { session_tracking: {}, roster_2027: { list: [{ jersey: '1' }, { jersey: '2' }, { jersey: '30' }] }, faceoffs_live: { fo_a: JSON.stringify([1, '2026-10-02', 'Scrimmage', 'SYN', '1', 1]), fo_b: JSON.stringify([2, '2026-10-02', 'Scrimmage', 'SYN', '1', 0]) } }, sessions: {
    '2026-10-01_practice': { context: 'Practice', date: '2026-10-01', s_1: shot('Goal', 'WLU', '1', '2'), s_2: shot('Saved', 'WLU'), s_3: shot('Miss', 'WLU'), s_4: shot('Pipe', 'WLU'), s_5: shot('Blocked', 'WLU'), p_1: po('Turnover', 'WLU', '1', '2') },
    '2026-10-02_scrimmage': { context: 'Scrimmage', opponent: 'SYN', date: '2026-10-02', s_1: shot('Goal', 'WLU', '1', '2', null), s_2: shot('Saved', 'OPP', null, null, '30') },
    '2026-10-03_scrimmage': { context: 'Scrimmage', opponent: 'SYN2', date: '2026-10-03', s_1: shot('Miss', 'WLU', '1', null, null) },
    '2026-05-01_practice': { context: 'Practice', date: '2026-05-01', s_1: shot('Goal', 'WLU') } } } };
  const D = MS.decode(exp, page, '2027'), E = MS.evidence(D), t = E.practice.team;
  ok('adapter applies the season rule: spring 2026 stays out of 2027', E.practice.sessions.length === 1 && MS.seasonOf('2026-09-01') === '2027' && MS.seasonOf('2026-05-01') === '2026');
  ok('adapter keeps practice and opponent scrimmages apart', t.shots === 5 && E.opponent_scrimmage.team.shots === 2 && E.opponent_scrimmage.opponent.shots === 1);
  ok('adapter splits the five outcomes', t.goals === 1 && t.sog === 2 && t.pipe === 1 && t.wide === 1 && t.blocked === 1);
  ok('a session with no turnover records stays out of the turnover denominator', E.opponent_scrimmage.team.turnovers === 0 && E.opponent_scrimmage.team.shotsWhereTurnoversLogged === 0 && t.shotsWhereTurnoversLogged === 5);
  ok('missing evidence is labeled, not zero', typeof E.missing.groundBalls === 'string' && typeof E.missing.penalties === 'string');
  ok('adapter reads faceoffs by opponent', E.faceoffs.byOpponent.SYN.att === 2 && E.faceoffs.byOpponent.SYN.won === 1);
  const ref = { source: 'synthetic', wl: { shots: 100, sog: 60, goals: 30, turnovers: 40, caused: 20, assists: 18, clears: 45, clearAtt: 50, penalties: 6, saves: 25, goalsAllowed: 20, faceoffsWon: 30 }, opp: { shots: 90, sog: 50, goals: 20, turnovers: 45, caused: 18, assists: 10, clears: 40, clearAtt: 50, penalties: 5, saves: 30, goalsAllowed: 30, faceoffsWon: 25 } };
  const rot = { attack: ['1'], lines: [{ players: ['2'], share: 1 }], defense: ['2'], goalie: '30', fogoPlayers: ['1'] };
  const cm = MS.compileMatchup(E, { cohort: 'practice', opponent: 'SYN', opponentName: 'Synthetic', reference: ref, rotation: rot, uncertainty: 'fixed' });
  let bad = null; for (let s = 0; s < 80 && !bad; s++) { const pr = MS.validateGame(MS.simulateGame(cm.P, s).ledger, cm.P); if (pr.length) bad = pr.slice(0, 4); }
  ok('compiled matchup runs and reconciles', !bad, bad);
  ok('the opponent stays team level with no invented players', cm.P.teams[1].shooters.length === 1 && cm.P.teams[1].shooters[0].id === MS.TEAM);
  ok('every compiled input names class, units and source', cm.inputs.every(r => r.cls && r.units && r.source !== undefined));
  ok('unavailable inputs appear as missing with no value', cm.inputs.filter(r => r.cls === 'missing').length === 4 && cm.inputs.filter(r => r.cls === 'missing').every(r => r.value === null));
  const imp = Object.assign({}, ref.opp, { source: 'an official box-score import' }), cm2 = MS.compileMatchup(E, { cohort: 'practice', opponent: 'SYN', opponentName: 'Synthetic', reference: ref, rotation: rot, opponentImport: imp, uncertainty: 'fixed' });
  ok('an opponent import from any provider replaces the prior and is named', cm2.inputs.some(r => String(r.source).includes('official box-score import')));
  let threw = false; try { MS.compileMatchup(E, { cohort: 'practice', opponent: 'NONE', opponentName: 'None', reference: ref, rotation: rot }); } catch (e) { threw = true; }
  ok('an opponent with no sessions is refused, not invented', threw);
  ok('calibration test leaves each scrimmage out', MS.calibrationTest(E).rows.length === 2);
}

// ---------- 7d. official pages and pre-game validation ----------
{ await import(new URL('official.js', base)); await import(new URL('validate.js', base));
  const row = (d, o, sc, x) => `<tr><td>${d}</td><td>${o}</td><td>W</td><td>${sc}</td><td>${x}</td></tr>`;
  const page = (name, body) => `<table><caption>Game-By-Game Comparison</caption><tr><th>Date</th><th>Opponent</th><th>W/L</th><th>Score</th><th>A</th><th>SH</th><th>SOG</th><th>GB</th><th>TO</th><th>FO</th><th>Clears</th><th>PEN-MIN</th></tr>${body}<tr><td></td><td>${name}</td><td></td><td>1-1</td><td></td></tr></table>`;
  const stat = '5/4</td><td>30/25</td><td>20/15</td><td>20/18</td><td>15/14</td><td>12/10</td><td>18-20/16-20</td><td>2-01:30/1-00:30';
  const A = MS.parseStatsPage(page('Alpha', row('2/01/26', 'at Beta', '10-8', stat) + row('2/02/25', 'Beta', '9-8', stat)), '2026'), Bt = MS.parseStatsPage(page('Beta', row('2/01/26', 'Alpha', '8-10', '4/5</td><td>25/30</td><td>15/20</td><td>18/20</td><td>14/15</td><td>10/12</td><td>16-20/18-20</td><td>1-00:30/2-01:30')), '2026');
  ok('official parser reads team, score and paired stats', A.teamName === 'Alpha' && A.games[0].us.goals === 10 && A.games[0].them.shots === 25 && A.games[0].us.clearAtt === 20 && A.games[0].them.penaltySec === 30 && A.games[0].location === 'away');
  ok('a bad page date is corrected for ordering and reported', A.games[1].date === '2026-02-02' && A.notes.length === 1);
  const Mg = MS.mergeGames([A, Bt], {});
  ok('a game on both schools pages merges into one and agrees', Mg.games.filter(x => x.date === '2026-02-01').length === 1 && Mg.conflicts.length === 0, Mg.conflicts);
  const Bad = MS.parseStatsPage(page('Beta', row('2/01/26', 'Alpha', '8-11', '4/5</td><td>25/30</td><td>15/20</td><td>18/20</td><td>14/15</td><td>10/12</td><td>16-20/18-20</td><td>1-00:30/2-01:30')), '2026');
  ok('schools disagreeing on a game are listed, not resolved', MS.mergeGames([A, Bad], {}).conflicts.some(c => c.field === 'goals'));
  ok('an alias merges different names for one school', MS.keyFor('at Chris. Newport', { 'chris newport': 'cnu' }) === 'cnu');
  const mk = (d, a, b, ga, gb) => ({ date: d, a, b, aLocation: 'home', sources: [], aStats: { goals: ga, assists: 4, shots: 35, sog: 22, gb: 20, turnovers: 16, faceoffsWon: 12, clears: 18, clearAtt: 20, penalties: 3, emGoals: 0 }, bStats: { goals: gb, assists: 3, shots: 30, sog: 18, gb: 18, turnovers: 18, faceoffsWon: 10, clears: 16, clearAtt: 20, penalties: 3, emGoals: 0 } });
  const list = []; for (let i = 1; i <= 6; i++) { list.push(mk(`2026-02-0${i}`, 'a', 'x', 12, 8)); list.push(mk(`2026-02-0${i}`, 'b', 'y', 9, 10)); }
  const test = mk('2026-03-05', 'a', 'b', 10, 9), S = { actionMeanSec: 25, clearRequired: 0.72, turnoverGroundBall: 1, manUpShift: 1.5 };
  const H1 = MS.historyBefore(list.concat([test]), test.date), later = list.concat([test, mk('2026-03-20', 'a', 'x', 99, 0), mk('2026-03-05', 'a', 'x', 50, 0)]), H2 = MS.historyBefore(later, test.date);
  ok('a future or same-day game cannot change pre-game inputs', JSON.stringify(H1) === JSON.stringify(H2));
  const R1 = MS.testGame(test, H1, S, { seed: 2, games: 150 }), R2 = MS.testGame(test, H2, S, { seed: 2, games: 150 });
  ok('a future game cannot change a pre-game prediction', R1.model === R2.model && R1.baseline === R2.baseline && R1.invalid === 0);
  const fake = H1.teams.a.goals; H1.teams.a.goals = fake; ok('the better history gets the higher baseline', MS.baselineGD('a', 'b', H1) > 0.5);
  const P0 = MS.paramsForGame('a', 'b', H1, S); let bad = null; for (let s = 0; s < 60 && !bad; s++) { const pr = MS.validateGame(MS.simulateGame(P0, s).ledger, P0); if (pr.length) bad = pr.slice(0, 4); } ok('validation parameters reconcile', !bad, bad);
  const fit = MS.slopeFit(Array.from({ length: 2000 }, (_, i) => { const p = 0.1 + 0.8 * (i % 100) / 99, u = MS.hash32('s' + i, 3) / 4294967296; return { p, y: u < p ? 1 : 0 }; }), 'p');
  ok('calibration slope is near 1 for honest probabilities', Math.abs(fit.slope - 1) < 0.2, fit);
  const bs = MS.bootstrapDiff([{ y: 1, a: 0.9, b: 0.5 }, { y: 0, a: 0.1, b: 0.5 }, { y: 1, a: 0.8, b: 0.5 }], 'a', 'b', 500, 2026); ok('paired bootstrap reports a difference and an interval', bs.mean < 0 && bs.lo <= bs.hi);
}

// ---------- 7e. possession interactions are emergent, no fixed offensive total ----------
{ const base0 = FX.params({ foul: 0.03 }, { foul: 0.03 }), r0 = MS.runBatch(base0, { seed: 41, games: 1200 }).summary.teams[1];
  const fo100 = FX.params({ foul: 0.03 }, { foul: 0.03 }, { faceoff: FX.B(0.98, 1e5) }), r1 = MS.runBatch(fo100, { seed: 41, games: 1200 }).summary.teams[1];
  ok('the other team loses shots when one team wins nearly every faceoff', r1.shots < r0.shots - 2 && r1.avgScore < r0.avgScore, { base: r0.shots, fo: r1.shots });
  const hold = FX.params({ foul: 0.03 }, { foul: 0.03, tempo: {} }, { tempo: { actionMeanSec: 40 } }), r2 = MS.runBatch(hold, { seed: 41, games: 1200 }).summary.teams[1];
  ok('a slower game gives the other team fewer shots', r2.shots < r0.shots - 2, { base: r0.shots, slow: r2.shots });
  const hi = FX.params({ foul: 0.03, r: 0.85, q: 0.9 }, { foul: 0.03 }), r3 = MS.runBatch(hi, { seed: 41, games: 1200 }).summary, r4 = MS.runBatch(base0, { seed: 41, games: 1200 }).summary;
  ok('more goals for one team means more faceoffs in the game', r3.teams[0].faceoffsPerGame > r4.teams[0].faceoffsPerGame + 2, { hi: r3.teams[0].faceoffsPerGame, base: r4.teams[0].faceoffsPerGame });
}

// ---------- 8. every modeled rule has a passing test ----------
const missing = MS.RULE_REGISTRY.filter(r => r.status === 'modeled' && !covered.has(r.id)).map(r => r.id);
ok('every modeled rule in the matrix has a passing test', missing.length === 0, { missing });

let pass = 0, fail = 0;
for (const r of results) { if (r.ok) pass++; else fail++; console.log((r.ok ? '  OK   ' : '  FAIL ') + r.name + (r.ok || r.info === undefined ? '' : '  ' + JSON.stringify(r.info).slice(0, 400))); }
console.log(`games simulated in the invariant sweep: ${total} (overtime ${sawOT})`);
console.log(`pass ${pass}  fail ${fail}`);
Deno.exit(fail ? 1 : 0);

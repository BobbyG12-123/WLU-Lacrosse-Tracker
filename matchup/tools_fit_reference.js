// Fits four settings so a reference game built only from official team totals matches those totals. A fit, not a validation.
// deno run --check=none --allow-read tools_fit_reference.js <inputs.json>
for (const f of ['rules.js', 'constants.js', 'engine.js', 'results.js', 'estimate.js']) await import(new URL(f, import.meta.url));
const MS = globalThis.MS, I = JSON.parse(Deno.readTextFileSync(Deno.args[0])), ref = I.reference, G = ref.games, w0 = ref.wl, o0 = ref.opp;
const cur = { actionMeanSec: 24, manUpShift: 1, clearRequired: 0.75, turnoverGroundBall: 0.8 };
const run = (o, n, seed) => MS.runBatch(MS.referenceParams(ref, o), { seed, games: n }).summary;
const measures = { actionMeanSec: [S => S.teams[0].shots + S.teams[0].turnovers + S.teams[1].shots + S.teams[1].turnovers, (w0.shots + w0.turnovers + o0.shots + o0.turnovers) / G, 8, 40, -1],
  clearRequired: [S => S.teams[0].clearAttempts + S.teams[1].clearAttempts, (w0.clearAtt + o0.clearAtt) / G, 0.2, 1, 1],
  turnoverGroundBall: [S => S.teams[0].groundBalls + S.teams[1].groundBalls, (w0.groundBalls + o0.groundBalls) / G, 0, 1, 1],
  manUpShift: [S => S.teams[0].extraManGoals + S.teams[1].extraManGoals, (w0.emGoals + o0.emGoals) / G, 0, 2.5, 1] };
const hitLimit = {};
for (let pass = 0; pass < 2; pass++) for (const k of Object.keys(measures)) {
  const [f, target, a0, b0, dir] = measures[k]; let a = a0, b = b0;
  for (let i = 0; i < 7; i++) { const m = (a + b) / 2, v = f(run(Object.assign({}, cur, { [k]: m }), 500, 2026)); if ((v < target) === (dir > 0)) a = m; else b = m; }
  cur[k] = Math.round((a + b) / 2 * 100) / 100; hitLimit[k] = Math.abs(cur[k] - a0) < 0.05 || Math.abs(cur[k] - b0) < 0.05;
}
const S = run(cur, 5000, 777), w = S.teams[0], o = S.teams[1], T = (x, y) => `${x.toFixed(1)} vs official ${y.toFixed(1)}`;
console.log(JSON.stringify({ fitted: cur, hitLimit, check: { shotsWL: T(w.shots, w0.shots / G), shotsOpp: T(o.shots, o0.shots / G), turnoversWL: T(w.turnovers, w0.turnovers / G), turnoversOpp: T(o.turnovers, o0.turnovers / G), goalsWL: T(w.avgScore, w0.goals / G), goalsOpp: T(o.avgScore, o0.goals / G), onGoalWL: T(w.shotsOnGoal, w0.sog / G), onGoalOpp: T(o.shotsOnGoal, o0.sog / G), faceoffs: T(w.faceoffsPerGame, (w0.faceoffsWon + o0.faceoffsWon) / G), clearAttWL: T(w.clearAttempts, w0.clearAtt / G), clearAttOpp: T(o.clearAttempts, o0.clearAtt / G), groundBalls: T(w.groundBalls + o.groundBalls, (w0.groundBalls + o0.groundBalls) / G), extraManGoals: T(w.extraManGoals + o.extraManGoals, (w0.emGoals + o0.emGoals) / G), penaltiesWL: T(w.penalties, w0.penalties / G), penaltiesOpp: T(o.penalties, o0.penalties / G), savePctWL: `${w.savePct.toFixed(3)} vs official ${(w0.saves / (w0.saves + w0.goalsAllowed)).toFixed(3)}`, possessionsWL: w.possessions.toFixed(1), possessionsOpp: o.possessions.toFixed(1), overtime: S.overtimeProbability, winWL: `${w.winProbability.toFixed(3)} vs actual ${(16 / 22).toFixed(3)}` } }, null, 1));

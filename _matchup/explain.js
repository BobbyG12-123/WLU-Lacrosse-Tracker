// W&L Matchup Studio: reasons, from simulated results. These explain what the model does under the chosen inputs. They don't prove why a real game
// would turn out that way. Two kinds of evidence: what differed between simulated wins and losses (an exact goal accounting), and what changes
// when one input is reset on the same seeds (paired what-ifs).
(function (g) {
  const MS = g.MS = g.MS || {};
  const sumT = (games, i, k) => games.reduce((t, x) => t + (x.box.teams[i][k] || 0), 0);
  // Goals per game = possessions x shots per possession x on-goal share x goals per shot on goal. Between two groups, a log-mean split adds up exactly.
  function factors(games, i) { const n = games.length, poss = sumT(games, i, 'possessions'), sh = sumT(games, i, 'sh'), sog = sumT(games, i, 'sog'), goals = sumT(games, i, 'g'); return { goals: goals / n, poss: poss / n, shotsPerPoss: poss ? sh / poss : 0, onGoal: sh ? sog / sh : 0, finish: sog ? goals / sog : 0, shots: sh / n, sog: sog / n, to: sumT(games, i, 'to') / n, fw: sumT(games, i, 'fw'), fl: sumT(games, i, 'fl'), clearAtt: sumT(games, i, 'clearAtt'), clearMade: sumT(games, i, 'clearMade'), pen: sumT(games, i, 'pen') / n, em: sumT(games, i, 'emGoals') / n }; }
  function split(A, B) { const lm = A.goals === B.goals ? A.goals : (A.goals - B.goals) / Math.log(A.goals / B.goals), part = k => (A[k] > 0 && B[k] > 0 ? lm * Math.log(A[k] / B[k]) : 0); return { poss: part('poss'), ballControl: part('shotsPerPoss'), accuracy: part('onGoal'), finish: part('finish'), total: A.goals - B.goals }; }
  const MIN_SIDE = 25;
  // Everything is stated from team 0's side: positive helps team 0.
  function explainWinsLosses(games, names) {
    const W = games.filter(x => x.box.winner === 0), L = games.filter(x => x.box.winner === 1);
    if (W.length < MIN_SIDE || L.length < MIN_SIDE) return { enough: false, wins: W.length, losses: L.length, note: `Too few ${W.length < MIN_SIDE ? 'wins' : 'losses'} to compare (${W.length} wins, ${L.length} losses; 25 of each needed).` };
    const f = (set, i) => factors(set, i), us = { W: f(W, 0), L: f(L, 0) }, them = { W: f(W, 1), L: f(L, 1) }, a = split(us.W, us.L), b = split(them.W, them.L), foPct = s => (s.fw + s.fl ? s.fw / (s.fw + s.fl) : null), clr = s => (s.clearAtt ? s.clearMade / s.clearAtt : null);
    const rows = [
      { key: 'finish', label: `${names[0]} finishing`, detail: `${names[0]} goals per shot on goal`, unit: 'pct', w: us.W.finish, l: us.L.finish, goals: a.finish },
      { key: 'accuracy', label: `${names[0]} shots on goal`, detail: `${names[0]} on-goal share of shots`, unit: 'pct', w: us.W.onGoal, l: us.L.onGoal, goals: a.accuracy },
      { key: 'control', label: `${names[0]} shots per possession`, detail: 'Kept misses and fewer turnovers raise this', unit: 'num2', w: us.W.shotsPerPoss, l: us.L.shotsPerPoss, goals: a.ballControl },
      { key: 'poss', label: `${names[0]} possessions`, detail: 'Faceoffs, stops and clears decide this', unit: 'num', w: us.W.poss, l: us.L.poss, goals: a.poss },
      { key: 'oppFinish', label: `${names[1]} finishing, against our goalie`, detail: `${names[1]} goals per shot on goal`, unit: 'pct', w: them.W.finish, l: them.L.finish, goals: -b.finish },
      { key: 'oppAccuracy', label: `${names[1]} shots on goal`, detail: `${names[1]} on-goal share of shots`, unit: 'pct', w: them.W.onGoal, l: them.L.onGoal, goals: -b.accuracy },
      { key: 'oppControl', label: `${names[1]} shots per possession`, detail: 'Their kept misses and fewer turnovers raise this', unit: 'num2', w: them.W.shotsPerPoss, l: them.L.shotsPerPoss, goals: -b.ballControl },
      { key: 'oppPoss', label: `${names[1]} possessions`, detail: 'Fewer means more stops and faceoff wins for us', unit: 'num', w: them.W.poss, l: them.L.poss, goals: -b.poss }
    ].sort((x, y) => Math.abs(y.goals) - Math.abs(x.goals));
    const context = { faceoff: { w: foPct(us.W), l: foPct(us.L) }, turnovers: { w: us.W.to, l: us.L.to }, oppTurnovers: { w: them.W.to, l: them.L.to }, clear: { w: clr(us.W), l: clr(us.L) }, oppClear: { w: clr(them.W), l: clr(them.L) }, extraMan: { w: us.W.em, l: us.L.em }, oppExtraMan: { w: them.W.em, l: them.L.em }, goals: { w: us.W.goals, l: us.L.goals }, oppGoals: { w: them.W.goals, l: them.L.goals } };
    const marginGap = (us.W.goals - them.W.goals) - (us.L.goals - them.L.goals);
    return { enough: true, wins: W.length, losses: L.length, rows, context, marginGap, sumCheck: rows.reduce((t, r) => t + r.goals, 0) };
  }
  // Per-player reasons: their numbers next to the team's, and how they change between wins and losses.
  function explainPlayers(games, P) {
    const M = games.length, T = P.teams[0]; if (!M) return []; const team = factors(games, 0), W = games.filter(x => x.box.winner === 0), L = games.filter(x => x.box.winner === 1);
    const ids = new Set(); games.forEach(x => Object.keys(x.box.players[0]).forEach(j => ids.add(j)));
    const rows = []; ids.forEach(j => { if (j === MS.TEAM) return; const s = (set, k) => set.reduce((t, x) => t + ((x.box.players[0][j] || {})[k] || 0), 0), sh = s(games, 'sh'), sg = s(games, 'sog'), gl = s(games, 'g'), as = s(games, 'a'), to = s(games, 'to'), ds = s(games, 'ds'); if (!sh && !as && !to) return; const pts = set => (set.length ? (s(set, 'g') + s(set, 'a')) / set.length : null), r = { id: j, shots: sh / M, shotShare: team.shots ? sh / M / team.shots : null, onGoal: sh ? sg / sh : null, finish: sg ? gl / sg : null, goals: gl / M, assists: as / M, points: (gl + as) / M, turnovers: to / M, minutes: ds / 600 / M, poss: s(games, 'poss') / M, ptsWins: W.length ? pts(W) : null, ptsLosses: L.length ? pts(L) : null, teamOnGoal: team.onGoal, teamFinish: team.finish }; r.reasons = playerReasons(r); rows.push(r); });
    return rows.sort((a, b) => b.points - a.points);
  }
  function playerReasons(r) {
    const out = [], pc = x => `${(100 * x).toFixed(0)}%`;
    if (r.shotShare !== null && r.shotShare >= 0.17) out.push(`High volume: ${pc(r.shotShare)} of team shots`); else if (r.shotShare !== null && r.shotShare < 0.06) out.push(`Low volume: ${pc(r.shotShare)} of team shots`);
    if (r.finish !== null && r.shots >= 1 && r.finish - r.teamFinish >= 0.05) out.push(`Finishes above the team: ${pc(r.finish)} vs ${pc(r.teamFinish)} on shots on goal`); else if (r.finish !== null && r.shots >= 1 && r.finish - r.teamFinish <= -0.05) out.push(`Finishes below the team: ${pc(r.finish)} vs ${pc(r.teamFinish)}`);
    if (r.onGoal !== null && r.shots >= 1 && r.onGoal - r.teamOnGoal >= 0.05) out.push(`More accurate: ${pc(r.onGoal)} on goal vs ${pc(r.teamOnGoal)}`); else if (r.onGoal !== null && r.shots >= 1 && r.onGoal - r.teamOnGoal <= -0.05) out.push(`Less accurate: ${pc(r.onGoal)} on goal vs ${pc(r.teamOnGoal)}`);
    if (r.assists >= 1 && r.assists >= r.goals) out.push(`Creates more than he scores: ${r.assists.toFixed(1)} assists to ${r.goals.toFixed(1)} goals`);
    if (r.turnovers >= 2.5) out.push(`Turnovers are a cost: ${r.turnovers.toFixed(1)} per game`);
    if (r.ptsWins !== null && r.ptsLosses !== null && r.ptsWins - r.ptsLosses >= 1.5) out.push(`Bigger in wins: ${r.ptsWins.toFixed(1)} points vs ${r.ptsLosses.toFixed(1)} in losses`);
    return out.length ? out : ['Near team averages in this run'];
  }
  // Six-on-field results, attributed from the ledger to the unit on the field when each possession started.
  function lineStatsFromLedger(ledger, team) {
    const out = {}; let on = [], key = null, attack = null; for (const e of ledger) {
      if (e.type === 'lineup' && e.team === team) on = e.players;
      else if (e.type === 'possession_start' && e.team === team) { key = on.slice().sort((a, b) => Number(a) - Number(b)).join(','); const r = out[key] || (out[key] = { poss: 0, sh: 0, sog: 0, g: 0, to: 0 }); r.poss++; }
      else if (e.type === 'possession_end' && e.team === team) key = null;
      else if (key && e.type === 'shot' && e.team === team) { const r = out[key]; r.sh++; if (e.outcome === 'goal' || e.outcome === 'save') r.sog++; if (e.outcome === 'goal') r.g++; }
      else if (key && e.type === 'turnover' && e.team === team) out[key].to++;
    } return attack === null ? out : out;
  }
  function lineTable(games) {
    const tot = {}; games.forEach(x => { if (!x.lines) return; Object.entries(x.lines).forEach(([k, r]) => { const t = tot[k] || (tot[k] = { poss: 0, sh: 0, sog: 0, g: 0, to: 0 }); ['poss', 'sh', 'sog', 'g', 'to'].forEach(f => { t[f] += r[f]; }); }); });
    const M = games.length; return Object.entries(tot).map(([k, r]) => ({ key: k, players: k.split(','), possPerGame: r.poss / M, goalsPer100: r.poss ? 100 * r.g / r.poss : null, shotsPer100: r.poss ? 100 * r.sh / r.poss : null, turnoversPer100: r.poss ? 100 * r.to / r.poss : null, onGoal: r.sh ? r.sog / r.sh : null, finish: r.sog ? r.g / r.sog : null, poss: r.poss, sh: r.sh, sog: r.sog, g: r.g, to: r.to })).sort((a, b) => (b.goalsPer100 || 0) - (a.goalsPer100 || 0));
  }
  // Why one six scores more than another: goals per 100 = shots per 100 x on-goal share x goals per shot on goal, split exactly.
  function sixWhy(a, b) { if (!a.g || !b.g) return null; const ga = a.g / a.poss, gb = b.g / b.poss, lm = ga === gb ? ga : (ga - gb) / Math.log(ga / gb), p = (x, y) => (x > 0 && y > 0 ? 100 * lm * Math.log(x / y) : 0); return { total: 100 * (ga - gb), volume: p(a.sh / a.poss, b.sh / b.poss), accuracy: p(a.sog / a.sh, b.sog / b.sh), finish: p(a.g / a.sog, b.g / b.sog) }; }
  function sixWhyText(w, unit) { if (!w) return '—'; const parts = [['more shots per possession', 'fewer shots per possession', w.volume], ['more shots on goal', 'fewer shots on goal', w.accuracy], ['better finishing', 'weaker finishing', w.finish]].filter(x => Math.abs(x[2]) >= 0.15).sort((a, b) => Math.abs(b[2]) - Math.abs(a[2])); return parts.length ? parts.map(x => `${x[2] > 0 ? x[0] : x[1]} (${x[2] > 0 ? '+' : ''}${x[2].toFixed(1)})`).join(', ') : `about level with ${unit}`; }
  // Plain sentences from the accounting. The largest factors first.
  function sentences(ex, names) {
    if (!ex.enough) return { win: ex.note, lose: ex.note };
    const help = ex.rows.filter(r => r.goals > 0.05).slice(0, 3), f = r => `${r.label.toLowerCase().replace(names[0].toLowerCase(), names[0]).replace(names[1].toLowerCase(), names[1])} (${r.unit === 'pct' ? `${(100 * r.w).toFixed(0)}% vs ${(100 * r.l).toFixed(0)}%` : `${r.w.toFixed(r.unit === 'num2' ? 2 : 1)} vs ${r.l.toFixed(r.unit === 'num2' ? 2 : 1)}`}): ${r.goals.toFixed(1)} goals`;
    const list = help.map(f).join('; '); return { win: `Between ${names[0]}'s simulated wins and losses, the margin swings ${ex.marginGap.toFixed(1)} goals. The biggest parts: ${list}.`, lose: `When ${names[1]} wins these simulated games, those same numbers go the other way. ${names[1]} wins with ${ex.context.oppGoals.l.toFixed(1)} goals on ${names[0]}'s ${ex.context.goals.l.toFixed(1)}. ${names[0]} turns it over ${ex.context.turnovers.l.toFixed(1)} times in those games (${ex.context.turnovers.w.toFixed(1)} in wins).` };
  }
  Object.assign(MS, { explainWinsLosses, explainPlayers, playerReasons, lineStatsFromLedger, lineTable, sixWhy, sixWhyText, explainSentences: sentences });
})(globalThis);

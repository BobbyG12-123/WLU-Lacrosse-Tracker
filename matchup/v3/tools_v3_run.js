// Local tool: one v3 matchup from local files only (never the database). Prints a summary; real data stays on this Mac.
// Usage: deno run --allow-read tools_v3_run.js <lr_import dir> <tracker export .json> <opponent name> [games]
await import(new URL('./model.js', import.meta.url)); await import(new URL('./engine.js', import.meta.url)); await import(new URL('../picks.js', import.meta.url));
const MS = globalThis.MS, V3 = MS.V3;
const [dir, exportPath, oppName, nArg] = Deno.args; const N = +(nArg || 4000);
const teams = {}; for (const e of Deno.readDirSync(dir)) if (/^lr_import_teams_\d+\.json$/.test(e.name)) for (const v of Object.values(JSON.parse(Deno.readTextFileSync(`${dir}/${e.name}`)).docs)) { const t = JSON.parse(v.j); teams[t.id] = t; }
const meta = JSON.parse(JSON.parse(Deno.readTextFileSync(`${dir}/lr_import_meta.json`)).docs.lrMeta.j);
const ex = JSON.parse(Deno.readTextFileSync(exportPath)).collections;
const d3teams = Object.values(teams).filter(t => t.lg === 'd3m' && t.stats && t.stats.adjusted_off_efficiency != null);
let ec = 0, eg = 0; d3teams.forEach(t => { const e = t.ev && t.ev.emo; if (e && e.chances) { ec += e.chances; eg += e.goals; } });
const L = meta.sb_league, D3 = { eff: d3teams.reduce((a, t) => a + t.stats.adjusted_off_efficiency, 0) / d3teams.length, emo: eg / ec, by_type: L.by_type, pick: L.pick, no_pick: L.no_pick };
const opp = Object.values(teams).find(t => t.name === oppName), wl = teams[410];
const r27 = ex.app.roster_2027; const names = (r27.list || JSON.parse(r27.json || '{"list":[]}').list || []).map(x => x.name);
const W = V3.team(wl, { names, season: 2027, d3eff: D3.eff }), O = V3.team(opp, { returning: true, season: 2027, d3eff: D3.eff });
// our goalies by zone, from practice and scrimmage shots in the tracker
const COLS = ["id","date","practiceId","context","shooterJersey","goalieJersey","onGoal","onKeeper","goal","blocked","defScheme","transition","offDodge","rightHanded","shotQuality","cleanSave","fieldX","fieldY","distanceYds","lateralYds","goalX","goalY"];
const shots = []; for (const doc of Object.values(ex.sessions)) for (const [k, v] of Object.entries(doc)) if (k.startsWith('s_')) { try { const o = JSON.parse(v); if (Array.isArray(o)) shots.push(Object.fromEntries(COLS.map((c, i) => [c, o[i]]))); } catch (e) {} }
const ourGz = V3.goalieZones(shots);
const ourG = Object.values(ourGz).filter(x => x.n >= 60).sort((a, b) => b.n - a.n);
const run = (goalie) => { const P = V3.matchup(W, O, { d3: D3, opp: { goalieZones: ourGz, goalie } }); const G = V3.runBatch(P, N, 11); const avg = f => G.reduce((a, b) => a + f(b), 0) / G.length;
  return { P, win: V3.winPct(G), wl: avg(b => b.score[0]), opp: avg(b => b.score[1]), poss: [avg(b => b.poss[0]), avg(b => b.poss[1])], fo: avg(b => b.fo[0] / (b.fo[0] + b.fo[1])), ot: G.filter(b => b.ot).length / G.length }; };
const base = run(null);
console.log(`  returning value: W&L off ${(100 * W.retOff).toFixed(0)}% def ${(100 * W.retDef).toFixed(0)}% (adj off ${W.adjOff2026.toFixed(3)}→${W.adjOff.toFixed(3)}, def ${W.adjDef2026.toFixed(3)}→${W.adjDef.toFixed(3)}); ${O.name} off ${(100 * O.retOff).toFixed(0)}% def ${(100 * O.retDef).toFixed(0)}% (off ${O.adjOff2026.toFixed(3)}→${O.adjOff.toFixed(3)}, def ${O.adjDef2026.toFixed(3)}→${O.adjDef.toFixed(3)})`);
console.log(`v3 ${V3.VERSION}: W&L (2027 roster by name, ${W.shooters.length} shooters) vs ${O.name} (${O.rosterNote}; removed ${O.removed.length}: ${O.removed.slice(0, 6).map(r => '#' + r.j + ' ' + r.cls).join(', ')}…)`);
console.log(`  win ${(100 * base.win).toFixed(1)}%  score ${base.wl.toFixed(1)}-${base.opp.toFixed(1)}  poss ${base.poss.map(x => x.toFixed(1)).join('/')}  fo ${(100 * base.fo).toFixed(1)}%  ot ${(100 * base.ot).toFixed(1)}%  (${N} games)`);
console.log('  their shooters now:', base.P.t[1].shooters.slice(0, 5).map(s => `#${s.j} ${(100 * s.share).toFixed(0)}% x${s.m.toFixed(2)}`).join(', '));
console.log('  our goalie in net:'); for (const g of ourG) { const r = run(g.j); console.log(`    #${g.j} (${g.n} practice shots, ${(100 * g.base).toFixed(0)}% saved): win ${(100 * r.win).toFixed(1)}%  they score ${r.opp.toFixed(2)}`); }
// with their full 2026 roster, for comparison
const O26 = V3.team(opp, {}); const P26 = V3.matchup(W, O26, { d3: D3 }); const G26 = V3.runBatch(P26, N, 11);
console.log(`  our 2027 roster vs their full 2026 roster (for comparison): win ${(100 * V3.winPct(G26)).toFixed(1)}%`);

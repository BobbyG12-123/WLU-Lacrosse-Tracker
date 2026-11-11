// Local tool: pick rates for one opponent from local files (never the database). Writes Markdown next to the output path.
// Usage: deno run --allow-read --allow-write tools_pick_rates.js <lr_import dir> <tracker export .json> <opponent name> <out.md>
// The tracker export has filmTags/pick (older one-word tags) and, once staff tag, filmTags/pick_def_<id> / pick_off_<id>.
await import(new URL('./picks.js', import.meta.url));
const MS = globalThis.MS;
const [dir, exportPath, oppName, out] = Deno.args;
if (!dir || !exportPath || !oppName || !out) { console.error('usage: tools_pick_rates.js <lr_import dir> <export.json> <opponent> <out.md>'); Deno.exit(2); }
const teams = {};
for (const e of Deno.readDirSync(dir)) if (/^lr_import_teams_\d+\.json$/.test(e.name)) for (const v of Object.values(JSON.parse(Deno.readTextFileSync(`${dir}/${e.name}`)).docs)) { const t = JSON.parse(v.j); teams[t.id] = t; }
const meta = JSON.parse(JSON.parse(Deno.readTextFileSync(`${dir}/lr_import_meta.json`)).docs.lrMeta.j);
const ex = JSON.parse(Deno.readTextFileSync(exportPath)).collections.filmTags || {};
const tagDoc = k => { const d = ex[k]; return d ? (d.t || {}) : {}; };
const legacy = tagDoc('pick');
const opp = Object.values(teams).find(t => t.name === oppName), wl = teams[410];
if (!opp) { console.error('no team named ' + oppName); Deno.exit(2); }
const D3 = meta.sb_league.pick;
// League pools from every team that has tags in the export.
const list = [];
for (const t of Object.values(teams)) { const sb = t.sb || {}; if (!sb.pick_clips_def) continue;
  list.push({ side: 'def', teamId: t.id, clips: sb.pick_clips_def, tags: tagDoc('pick_def_' + t.id), legacy });
  list.push({ side: 'off', teamId: t.id, clips: sb.pick_clips_off, tags: tagDoc('pick_off_' + t.id) }); }
const pools = MS.pickLeaguePools(list);
const rate = (t, side) => MS.pickRates({ side, teamId: t.id, clips: (t.sb || {})[side === 'def' ? 'pick_clips_def' : 'pick_clips_off'] || [], tags: tagDoc(`pick_${side}_${t.id}`), legacy: side === 'def' ? legacy : null,
  teamPick: ((t.sb || {})[side] || {}).pick || null, d3Pick: D3, leagueMix: pools.mix, leagueResults: pools.results.n ? pools.results : null });
const theirDef = rate(opp, 'def'), theirOff = rate(opp, 'off'), ourOff = rate(wl, 'off'), ourDef = rate(wl, 'def');
const m = MS.pickMatchup(ourOff, theirDef), m2 = MS.pickMatchup(theirOff, ourDef);
const pc = v => v == null ? '—' : (100 * v).toFixed(1) + '%';
const L = [];
L.push(`# ${oppName}: pick rates for the sim (experimental)\n`);
L.push(`Built from local files only. LacrosseReference data as of ${meta.updated}; staff tags from \`${exportPath.split('/').pop()}\`. Prior weights (fixed, not tuned): ${JSON.stringify(MS.PICK_K)}. D3 pick possessions score ${pc(D3.goal_pct)} (n ${D3.n}).\n`);
L.push(`League tag pools: ${Object.values(pools.mix).reduce((a, b) => a + b, 0)} coverage tags (${Object.entries(pools.mix).map(([k, v]) => k + ' ' + v).join(', ') || 'none'}), ${pools.results.n} result tags.\n`);
const sideBlock = (title, r) => {
  L.push(`## ${title}\n`);
  L.push(`Team goals per pick possession: **${pc(r.team.value)}** = ${r.team.formula} (raw ${r.team.n ? pc(r.team.k / r.team.n) : '—'}, ${r.team.n} pick possessions, ${r.team.trust}).\n`);
  L.push(`Staff tags: ${r.tagged} (${r.coverageTagged} with coverage, ${r.resultTagged} with a result, ${r.legacyTags} older one-word tags).${r.enough.coverage ? '' : ' **Fewer than 15 coverage tags: the sim uses the team rate, not the coverage split.**'}\n`);
  if (r.coverage.length) {
    L.push('| Coverage | Tagged | Share used | Goals/pick used | Formula | Shots (no goal) | TOs |\n|---|---|---|---|---|---|---|');
    r.coverage.forEach(c => L.push(`| ${c.coverage} | ${c.n} | ${pc(c.share.value)} | ${pc(c.goal.value)} | ${c.goal.formula} | ${pc(c.shot.value)} | ${pc(c.to.value)} |`));
    L.push(`\nShare prior: ${r.mixPrior}.\n`);
  } else L.push('No coverage tags.\n');
  const used = r.players.filter(p => p.used);
  L.push(r.players.length ? `Players tagged: ${r.players.length}; with 10+ picks (used by the sim): ${used.length}${used.length ? ' — ' + used.map(p => `#${p.jersey} ${p.goals}/${p.n}, expected ${pc(p.expected)}, used ${pc(p.rate.value)}`).join('; ') : ''}.\n` : 'No players tagged.\n');
};
sideBlock(`${oppName} defending picks`, theirDef); sideBlock(`${oppName} running picks`, theirOff); sideBlock('W&L running picks', ourOff); sideBlock('W&L defending picks', ourDef);
const mt = (title, mm) => { L.push(`## ${title}\n`); L.push(`Expected goals per pick: **${pc(mm.overall)}** (team rates only: ${pc(mm.teamOnly)}).${mm.note ? ' ' + mm.note : ''}\n`);
  if (mm.rows.length) { L.push('| Coverage | Share | Attack rate vs it | Defense rate playing it | Expected | Tags (attack / defense) |\n|---|---|---|---|---|---|'); mm.rows.forEach(r => L.push(`| ${r.coverage} | ${pc(r.share)} | ${pc(r.ourRate)} | ${pc(r.theirRate)} | ${pc(r.expected)} | ${r.ourN} / ${r.theirN} |`)); L.push(''); } };
mt(`Our picks vs ${oppName}'s pick defense`, m); mt(`${oppName}'s picks vs our pick defense`, m2);
Deno.writeTextFileSync(out, L.join('\n') + '\n');
console.log(`wrote ${out}: their def ${theirDef.tagged} tags, their off ${theirOff.tagged}, ours ${ourOff.tagged}/${ourDef.tagged}; matchup ${pc(m.overall)} / ${pc(m2.overall)}`);

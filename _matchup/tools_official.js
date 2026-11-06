// Shared by the validation and tuning tools: reads saved official pages into a merged dated game list. Division III list only; VMI is left out.
export function loadOfficial(MS, dir, aliases, exclude) {
  const pages = [], skipped = [];
  for (const e of [...Deno.readDirSync(dir)].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!e.name.endsWith('.html')) continue;
    const p = MS.parseStatsPage(Deno.readTextFileSync(`${dir}/${e.name}`), '2026');
    if (!p) { skipped.push(e.name); continue; }
    if ((exclude || []).includes(p.teamName)) { skipped.push(`${e.name} (excluded)`); continue; }
    pages.push(Object.assign(p, { file: e.name }));
  }
  const merged = MS.mergeGames(pages, aliases);
  return { pages, skipped, games: merged.games, conflicts: merged.conflicts, covered: new Set(pages.map(p => MS.keyFor(p.teamName, aliases))) };
}

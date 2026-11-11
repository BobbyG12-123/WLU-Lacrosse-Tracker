// Builds the local official-data file the experimental screen reads. Local only: it never goes in the repository.
for (const f of ['rules.js', 'constants.js', 'official.js']) await import(new URL(f, import.meta.url));
const MS = globalThis.MS, [inp, raw, out, commit] = Deno.args, I = JSON.parse(Deno.readTextFileSync(inp)), pages = [];
for (const e of [...Deno.readDirSync(raw)].sort((a, b) => (a.name < b.name ? -1 : 1))) { if (!e.name.endsWith('.html')) continue; const p = MS.parseStatsPage(Deno.readTextFileSync(`${raw}/${e.name}`), '2026'); if (p) pages.push({ teamName: p.teamName, games: p.games, notes: p.notes }); }
Deno.writeTextFileSync(out, JSON.stringify({ version: { commit: commit || null, builtAt: new Date().toISOString() }, aliases: I.aliases, pages, reference: I.reference, rotationFixture: I.rotation, vmiCaused: { againstVmi: 114, byVmi: 89 } }));
console.log('pages', pages.length);

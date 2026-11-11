// Writes docs/RULES_AND_CONSTANTS.md from rules.js and constants.js. Run from matchup: deno run --allow-read=. --allow-write=docs docs/gen_matrix.js
const base = new URL('..', import.meta.url);
await import(new URL('rules.js', base)); await import(new URL('constants.js', base));
const MS = globalThis.MS;
let o = `# Rule-to-test matrix and constants audit\n\nFinished before engine code. Generated from \`rules.js\` and \`constants.js\`; don't edit by hand.\n\nRules version \`${MS.RULES.version}\`: 2027 and 2028 NCAA Men's Lacrosse Rules and Interpretations (August 2026), plus the NCAA Statisticians' Manual (edition not stated in the copy read).\n\n## Rules\n\n| ID | Reference | Rule | Status |\n|---|---|---|---|\n`;
for (const r of MS.RULE_REGISTRY) o += `| ${r.id} | ${r.ref} | ${r.text}${r.note ? ` (${r.note})` : ''} | ${r.status === 'modeled' ? 'Modeled, test required' : 'Not simulated: ' + r.reason} |\n`;
o += '\nThe test suite fails if a modeled rule has no passing named test.\n\n## Engine constants\n\n| Name | Value | Class | Units | Source |\n|---|---|---|---|---|\n';
for (const [k, v] of Object.entries(MS.CONSTANTS)) o += `| ${k} | ${JSON.stringify(v.value)} | ${v.cls} | ${v.unit} | ${v.source} |\n`;
o += '\n## Scrimmage Planner constants (not used by this engine)\n\n| Value | Class | Finding | Engine |\n|---|---|---|---|\n';
for (const r of MS.PLANNER_CONSTANTS_AUDIT) o += `| ${r.join(' | ')} |\n`;
Deno.writeTextFileSync(new URL('docs/RULES_AND_CONSTANTS.md', base), o);

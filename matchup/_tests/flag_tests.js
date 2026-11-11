// TEST ONLY: the Simulation flag, nav, view and data-function lines from ../index.html, run with fake browser pieces.
// Usage (from matchup/): deno run --check=none --allow-read=.. _tests/flag_tests.js ../index.html
// Runs the real flag, nav, view and data-function lines from index.html with fake browser pieces.
const src = Deno.readTextFileSync(Deno.args[0]);
const line = start => { const a = src.indexOf(start); if (a < 0) throw new Error('missing: ' + start); return src.slice(a, src.indexOf('\n', a)); };
const block = (start, end) => { const a = src.indexOf(start); const b = src.indexOf(end, a); return src.slice(a, b + end.length); };
const flagLine = line('const MS_DEV_FLAG = '), navLine = line("if (MS_DEV_FLAG) NAV.find("), viewLine = line("  if (viewId === 'matchupView' && MS_DEV_FLAG"), studio = block('let MS_READ = null;', '\n};\n// Simulation game week'), lr = block('window.msLrData = async (req) => {', '\n};');
let pass = 0, fail = 0; const ok = (n, c, i) => { c ? pass++ : fail++; console.log((c ? '  OK   ' : '  FAIL ') + n + (c ? '' : '  ' + JSON.stringify(i))); };
async function world(search, stored, playerMode) {
  const reads = [], writes = [];
  const doc = id => ({ get: async () => { reads.push(id); return { exists: false, data: () => null }; }, set: async () => { writes.push(id); }, update: async () => { writes.push(id); }, delete: async () => { writes.push(id); } });
  const DB = { collection: c => ({ doc: id => doc(c + '/' + id), get: async () => { reads.push(c); return { forEach: () => {} }; }, where: () => ({ get: async () => { reads.push(c + '?'); return { forEach: () => {} }; } }), add: async () => { writes.push(c); } }) };
  const frame = { src: null, getAttribute: () => frame.src, setAttribute: (k, v) => { frame.src = v; } };
  const g = { MS_READ_UNUSED: 0, location: { search }, localStorage: { getItem: k => k === 'matchupDev' ? stored : null }, NAV: [{ id: 'pers', pages: [] }], document: { getElementById: () => frame }, DB, PLAYER_MODE: playerMode, COLS: [], POSS_COLS: [], window: {}, exportAllDataCollect: async () => { reads.push('export'); return {}; } };
  const fn = new Function(...Object.keys(g), `${flagLine}\n${navLine}\n${studio}\n${lr}\nreturn { flag: MS_DEV_FLAG, show: viewId => { ${viewLine} } };`);
  const r = fn(...Object.values(g));
  r.show('matchupView');
  let s = 'resolved', l = 'resolved';
  try { await g.window.msStudioData(); } catch (e) { s = e.message; }
  try { await g.window.msLrData({ meta: true, teams: [1], players: [1], d3: true }); } catch (e) { l = e.message; }
  return { flag: r.flag, nav: g.NAV[0].pages.map(p => p[0]), src: frame.src, studio: s, lr: l, reads, writes };
}
const off = await world('', null, false);
ok('no flag: flag is off', off.flag === false, off);
ok('no flag: no Simulation menu entry', off.nav.length === 0, off.nav);
ok('no flag: the Simulation frame never loads', off.src === null, off.src);
ok('no flag: both data functions refuse, nothing is read', off.studio === 'Not available.' && off.lr === 'Not available.' && off.reads.length === 0, off);
const pm = await world('?matchupDev=1', null, true);
ok('flag but player mode: frame stays empty, data functions refuse', pm.src === null && pm.studio === 'Not available.' && pm.lr === 'Not available.' && pm.reads.length === 0, pm);
const on = await world('?matchupDev=1', null, false);
ok('flag in the address: menu entry, frame loads matchup/studio.html (published path)', on.flag && on.nav.join() === 'matchup' && on.src === 'matchup/studio.html', on);
ok('flag on: data functions read, and write nothing', on.studio === 'resolved' && on.lr === 'resolved' && on.reads.length > 0 && on.writes.length === 0, on);
const ls = await world('', '1', false); ok('flag saved in this browser also works', ls.flag && ls.src === 'matchup/studio.html');
const near = await world('?matchupDev=10', '0', false); ok('a look-alike flag (matchupDev=10) does not turn it on', near.flag === false);
console.log(`flag gating: pass ${pass}  fail ${fail}`); Deno.exit(fail ? 1 : 0);

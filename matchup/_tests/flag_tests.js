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
const reg = await world('', null, false);
ok('regular link: Simulation is on', reg.flag === true, reg);
ok('regular link: menu entry, frame loads matchup/gameweek.html (published path)', reg.nav.join() === 'matchup' && reg.src === 'matchup/gameweek.html', reg);
ok('regular link: data functions read, and write nothing', reg.studio === 'resolved' && reg.lr === 'resolved' && reg.reads.length > 0 && reg.writes.length === 0, reg);
const pm = await world('', null, true);
ok('player mode: frame stays empty, data functions refuse, nothing is read', pm.src === null && pm.studio === 'Not available.' && pm.lr === 'Not available.' && pm.reads.length === 0, pm);
const old = await world('?matchupDev=1', '1', false); ok('the old flagged link still works', old.flag && old.src === 'matchup/gameweek.html');
const hidden = /<section id="matchupView" class="view pm-off">/.test(src); ok('the Simulation view is marked pm-off, so player mode hides it from the menu', hidden);
console.log(`flag gating: pass ${pass}  fail ${fail}`); Deno.exit(fail ? 1 : 0);

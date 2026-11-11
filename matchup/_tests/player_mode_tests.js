// TEST ONLY: player mode unloads the Simulation frame (the line in ../index.html's pmEnter).
// Usage (from matchup/): deno run --check=none --allow-read=.. _tests/player_mode_tests.js ../index.html
const src = Deno.readTextFileSync(Deno.args[0]);
const a = src.indexOf("  { const mf = document.getElementById('matchupFrame');"), line = src.slice(a, src.indexOf('\n', a));
const fn = (attrs) => { const frame = { a: attrs, getAttribute: k => frame.a[k] ?? null, removeAttribute: k => { delete frame.a[k]; } }; const g = { document: { getElementById: () => frame }, MS_READ: { at: 1 } };
  new Function('document', 'scope', `let MS_READ = scope.MS_READ;\n${line}\nscope.MS_READ = MS_READ;`)(g.document, g); return { src: frame.getAttribute('src'), read: g.MS_READ }; };
const r1 = fn({ src: 'matchup/studio.html' }), r2 = fn({});
console.log(r1.src === null && r1.read === null ? '  OK   entering player mode unloads a loaded Simulation frame and drops the cached read' : '  FAIL unload ' + JSON.stringify(r1));
console.log(r2.src === null && r2.read !== null ? '  OK   with no Simulation frame loaded, player mode changes nothing' : '  FAIL noop ' + JSON.stringify(r2));
const at = src.indexOf('function pmEnter(p) {'), ins = src.indexOf(line); console.log(ins > at && ins < src.indexOf('PLAYER_MODE = p;', at) ? '  OK   the unload runs inside pmEnter, before player mode is set' : '  FAIL placement');

const fails = [r1.src === null && r1.read === null, r2.src === null && r2.read !== null].filter(x => !x).length; Deno.exit(fails ? 1 : 0);

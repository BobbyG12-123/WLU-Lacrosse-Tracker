// TEST ONLY: drives _matchup/gameweek.html inside host.html. Usage: deno run -A check.js <devtoolsPort> <serverPort> <shotDir>
const [port, sport, shotDir] = [Deno.args[0] || '9338', Deno.args[1] || '8779', Deno.args[2] || '.'];
const results = []; const ok = (n, c, i) => { results.push({ ok: !!c }); console.log((c ? '  OK   ' : '  FAIL ') + n + (c || i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 600))); };
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(), page = tabs.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; }); let id = 0; const pending = new Map(), errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 500));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(JSON.stringify(m.params.args.map(a => a.value || a.description)).slice(0, 400)); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async code => { const r = await send('Runtime.evaluate', { expression: `(async () => { const H = window, W = document.getElementById('f').contentWindow, D = W.document, Q = s => D.querySelector(s), QA = s => [...D.querySelectorAll(s)]; ${code} })()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400); return r.result.result.value; };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); Deno.writeFileSync(`${shotDir}/${name}.png`, Uint8Array.from(atob(r.result.data), c => c.charCodeAt(0))); };
await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${sport}/_matchup/tests/gameweek/host.html` });
for (let i = 0; i < 80; i++) { await sleep(300); try { if (await ev("return !!Q('[data-opp]');") === true) break; } catch (e) {} }
ok('host runs the real msStudioData / msLrData from index.html', await ev("return document.title === 'READY' && typeof H.msLrData === 'function';"), await ev('return document.title;'));
ok('the page loads tracker data and offers our schedule as opponents', await ev("return QA('[data-opp]').map(b => b.textContent).join('|') === 'Testa College|Sample State';"), await ev("return D.body.innerText.slice(0, 400);"));
ok('the source line names the LacrosseReference season and date', /2026 season, as of 2099-01-01/.test(await ev("return Q('#srcline').textContent;")));
ok('Run is disabled until an opponent is picked', await ev("return Q('#run').disabled === true;"));
await ev("Q('[data-opp=\"901\"]').click();"); await sleep(100); await ev("QA('[data-g]').find(b => b.dataset.g === '2000').click();"); await sleep(100); await ev("Q('#run').click();");
for (let i = 0; i < 120; i++) { await sleep(500); if (await ev("return !!Q('table.lev') || /Could not/.test(D.body.innerText);")) break; }
const txt = await ev("return D.body.innerText;");
ok('a game week runs and shows the sheet (title, wins, levers, ways we lose)', /W&L vs Testa College/.test(txt) && /W&L wins/.test(txt) && /Specific ways to swing it/.test(txt) && /The ways we lose/.test(txt), txt.slice(0, 600));
ok('source notes say 2026 records for a 2027 game use returning players', /returning players until 2027 data is imported/.test(txt));
ok('our 2027 roster names appear on practice-based levers', /#7 Testa → #9 Testa/.test(txt));
ok('the D3 average was computed from the team records and cached', await ev("return Object.keys(W.localStorage).some(k => k.startsWith('msD3:'));"));
ok('missing inputs are listed', /Not in this sheet yet/.test(txt) && /pick coverage/i.test(txt));
await shot('01_gameweek');
const before = await ev("const i = Q('input.use'); return [i.dataset.use, i.closest('tr').lastElementChild.innerText];");
await ev("const i = Q('input.use'); i.value = '0'; i.dispatchEvent(new W.Event('change'));"); await sleep(1500);
const after = await ev("const i = Q('input.use'); return [i.value, i.closest('tr').lastElementChild.innerText, Math.round(100 * W.__GW.S.BT) + '%'];");
ok('a usage box replays that row; 0% equals our baseline win %', after[0] === '0' && after[1] === after[2], { before, after });
// Second run with another opponent reuses the cached D3 average and loads the new team.
await ev("Q('[data-opp=\"902\"]').click();"); await sleep(100); await ev("Q('#run').click();");
for (let i = 0; i < 120; i++) { await sleep(500); if (await ev("return /W&L vs Sample State/.test(Q('#title').textContent) && !Q('#run').disabled;")) break; }
ok('a second opponent runs', /W&L vs Sample State/.test(await ev("return Q('#title').textContent;")));
ok('our logged scrimmage against Sample State is matched and updates their numbers', /Our 2027 logs against them \(Sample State\)/.test(await ev("return Q('#srcline').textContent;")) && /Updated from our logs against them/.test(await ev("return D.body.innerText;")), await ev("return Q('#srcline').textContent;"));
ok('the label pill for that scrimmage is shown as selected', await ev("return QA('[data-lab]').some(b => b.dataset.lab === 'Sample State' && b.classList.contains('on'));"));
ok('the page made no database writes', await ev("return H.__WRITES;") === 0, await ev("return H.__WRITES;"));
const bad = errs.filter(e => !/client is offline|Failed to load resource/i.test(e));
ok('no script errors', bad.length === 0, bad);
const pass = results.filter(r => r.ok).length; console.log(`game-week page: pass ${pass}  fail ${results.length - pass}`); Deno.exit(results.length === pass ? 0 : 1);

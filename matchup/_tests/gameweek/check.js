// TEST ONLY: drives matchup/gameweek.html inside host.html. Usage: deno run -A check.js <devtoolsPort> <serverPort> <shotDir>
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
await send('Page.navigate', { url: `http://127.0.0.1:${sport}/matchup/_tests/gameweek/host.html` });
for (let i = 0; i < 80; i++) { await sleep(300); try { if (await ev("return !!Q('[data-opp]');") === true) break; } catch (e) {} }
ok('host runs the real msStudioData / msLrData from index.html', await ev("return document.title === 'READY' && typeof H.msLrData === 'function';"), await ev('return document.title;'));
ok('the page loads tracker data and offers our schedule as opponents', await ev("return QA('[data-opp]').map(b => b.textContent).join('|') === 'Testa College|Sample State';"), await ev("return D.body.innerText.slice(0, 400);"));
ok('the source line names the LacrosseReference season and date', /2026 season, as of 2099-01-01/.test(await ev("return Q('#srcline').textContent;")));
ok('Run is disabled until an opponent is picked', await ev("return Q('#run').disabled === true;"));
await ev("Q('[data-opp=\"901\"]').click();"); await sleep(100); await ev("QA('[data-g]').find(b => b.dataset.g === '2000').click();"); await sleep(100); await ev("Q('#run').click();");
for (let i = 0; i < 40; i++) { await sleep(300); if (await ev("return !!Q('#allowD3');")) break; }
ok('an import without D3 averages asks first, and reads no team list until asked', await ev("return !!Q('#allowD3') && H.__READS.lrTeamsAll === 0 && !Q('table.lev');"), await ev("return [H.__READS, D.body.innerText.slice(0, 300)];"));
await ev("Q('#allowD3').click();");
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
// Lineups panel (step 2): the logged lineup equals the sheet; swaps are worked out; using one and resetting work.
const luDone = async () => { for (let i = 0; i < 240; i++) { await sleep(250); if (await ev("return !!Q('#lineups') && W.__GW.luBusy === false;")) return true; } return false; };
ok('the Lineups panel appears under the sheet and finishes working out swaps', await luDone(), await ev("return [!!Q('#lineups'), W.__GW.luBusy, W.__GW.luMsg];"));
ok('with the logged lineup the panel\'s win chance is the sheet\'s', await ev("return W.__GW.luCur.win === W.__GW.S.BT && /\\(the sheet's lineup\\)/.test(Q('#lineups').innerText);"), await ev("return [W.__GW.luCur && W.__GW.luCur.win, W.__GW.S.BT];"));
ok('attack shows three players and a swap table with chance better', await ev("return QA('[data-lu=\"attack\"][data-slot]:not([data-cand])').length === 3 && /Best one-player swaps/.test(Q('#lineups').innerText) && /Chance better/.test(Q('#lineups').innerText);"), await ev("return Q('#lineups').innerText.slice(0, 900);"));
await ev("Q('#lineups').scrollIntoView();"); await sleep(200); await shot('02_lineups'); await ev("W.scrollTo(0, 0);");
const swap = await ev("const b = Q('[data-apply=\"attack\"]'); if (!b) return null; const r = W.__GW.luRes.attack.rows[+b.dataset.i]; b.click(); return { in: r.in, win: r.win };");
ok('"Use this" puts the swap into the lineup and replays it (same win chance as the swap row)', swap && await luDone() && await ev(`return W.__GW.L.attack.includes('${swap && swap.in}') && W.__GW.luCur.win === ${swap && swap.win} && W.__GW.luEdited === true;`), swap);
await ev("Q('[data-lu=\"attack\"][data-slot=\"0\"]').click();"); await sleep(100);
ok('clicking a player opens a pick row for his slot', await ev("return /Put in for/.test(Q('#lineups').innerText) && QA('[data-cand]').length >= 1;"));
await ev("Q('#luReset').click();"); await luDone();
ok('"Back to the logged lineup" restores the sheet\'s lineup and win chance', await ev("return JSON.stringify(W.__GW.L) === JSON.stringify(W.__GW.B) && W.__GW.luCur.win === W.__GW.S.BT && W.__GW.luEdited === false;"));
await ev("const i = Q('input.lushare'); if (i) { i.value = '70'; i.dispatchEvent(new W.Event('change')); }"); await luDone();
ok('a midfield time share replays the lineup, and the other lines split the rest (one line: it keeps all the time)', await ev("return !Q('input.lushare') || (W.__GW.L.mids[0].share === (W.__GW.L.mids.length > 1 ? 70 : 100) && Math.abs(W.__GW.L.mids.reduce((a, m) => a + m.share, 0) - 100) < 1e-9 && W.__GW.luEdited === true);"), await ev("return W.__GW.L.mids;"));
await ev("Q('#luReset').click();"); await luDone();
// Build from scratch: mark one player out, build, use it.
const outJ = await ev("const b = QA('[data-av]').find(x => W.__GW.L.attack.includes(x.dataset.av)); if (!b) return null; b.click(); return b.dataset.av;");
ok('availability pill marks a player out', outJ && await ev(`return W.__GW.avail.out.includes('${outJ}') && /· out/.test(Q('[data-av="${outJ}"]').textContent);`), outJ);
await ev("Q('#luBuild').click();"); for (let i = 0; i < 120; i++) { await sleep(250); if (await ev("return !!W.__GW.built || /Could not build/.test(Q('#lineups').innerText);")) break; }
ok('build shows the built lineup and its win chance, without the out player', await ev(`const b = W.__GW.built; return !!b && /Built lineup: we win/.test(Q('#lineups').innerText) && !JSON.stringify([b.lineup.attack, b.lineup.mids, b.lineup.manUp]).includes('"${outJ}"');`), await ev("return [W.__GW.luMsg, W.__GW.built && W.__GW.built.lineup];"));
await ev("Q('#luBuild').scrollIntoView();"); await sleep(200); await shot('03_build'); await ev("W.scrollTo(0, 0);");
const builtWin = await ev("return W.__GW.built.sim.win;");
await ev("const i = Q('input.lushare'); if (i) { i.value = '60'; i.dispatchEvent(new W.Event('change')); }"); await luDone();
ok('editing the lineup clears an old build (no stale "Use this lineup")', await ev("return !Q('input.lushare') || (W.__GW.built === null && !Q('#luUseBuilt'));"));
await ev("Q('#luBuild').click();"); for (let i = 0; i < 120; i++) { await sleep(250); if (await ev("return !!W.__GW.built;")) break; }
const builtWin2 = await ev("return W.__GW.built.sim.win;");
await ev("Q('#luUseBuilt').click();"); await luDone();
ok('"Use this lineup" puts the build into the lineup; the panel then shows the same win chance', await ev(`return W.__GW.luCur.win === ${builtWin2} && W.__GW.luEdited === true;`), [builtWin2, await ev("return W.__GW.luCur && W.__GW.luCur.win;")]);
await ev(`Q('[data-av="${outJ}"]').click();`);
ok('clicking an out player who is no longer in the lineup makes him available again (no lock offered)', await ev("return W.__GW.avail.out.length === 0 && W.__GW.avail.lock.length === 0;"), await ev("return W.__GW.avail;"));
await ev("Q('#luReset').click();"); await luDone();
// Second run with another opponent reuses the cached D3 average and loads the new team.
await ev("Q('[data-opp=\"902\"]').click();"); await sleep(100); await ev("Q('#run').click();");
for (let i = 0; i < 120; i++) { await sleep(500); if (await ev("return /W&L vs Sample State/.test(Q('#title').textContent) && !Q('#run').disabled;")) break; }
ok('a second opponent runs', /W&L vs Sample State/.test(await ev("return Q('#title').textContent;")));
ok('our logged scrimmage against Sample State is matched and updates their numbers', /Our 2027 logs against them \(Sample State\)/.test(await ev("return Q('#srcline').textContent;")) && /Updated from our logs against them/.test(await ev("return D.body.innerText;")), await ev("return Q('#srcline').textContent;"));
ok('the label pill for that scrimmage is shown as selected', await ev("return QA('[data-lab]').some(b => b.dataset.lab === 'Sample State' && b.classList.contains('on'));"));
// Home / away: neutral by default; changing it dims the old sheet until Run; at home, W&L wins more (same seeds).
const winNow = "return parseFloat([...QA('.tile')].find(t => /W&L wins/.test(t.textContent)).querySelector('.v').textContent);";
ok('where the game is: neutral by default, and the source line says so', await ev("return QA('[data-home]').length === 3 && Q('[data-home=\"n\"]').classList.contains('on');") && /Where: neutral/.test(await ev("return Q('#srcline').textContent;")));
const wNeutral = await ev(winNow);
await ev("Q('[data-home=\"0\"]').click();"); await sleep(100);
ok('changing home or away dims the old sheet and asks for Run', await ev("return Q('#app').style.opacity === '0.45' && /press Run/.test(D.body.innerText);"));
await ev("Q('#run').click();"); for (let i = 0; i < 120; i++) { await sleep(500); if (await ev("return /our home field/.test(Q('#srcline').textContent) && !Q('#run').disabled;")) break; }
const wHome = await ev(winNow);
ok('at our home field the sheet says so, is no longer dimmed, and W&L wins more than at a neutral site', /Where: our home field/.test(await ev("return Q('#srcline').textContent;")) && await ev("return Q('#app').style.opacity === '1';") && wHome > wNeutral, { wNeutral, wHome });
ok('the team list was read exactly once (D3 averages), after the click', await ev("return H.__READS.lrTeamsAll;") === 1, await ev("return H.__READS;"));
const r0 = await ev("return H.__READS.sessions;"); await ev("W.location.reload();"); for (let i = 0; i < 40; i++) { await sleep(300); try { if (await ev("return !!Q('[data-opp]');") === true) break; } catch (e) {} }
ok('reopening the page within a minute reuses the same read (no new sessions read)', await ev("return H.__READS.sessions;") === r0, [r0, await ev("return H.__READS.sessions;")]);
ok('the D3 averages are remembered in this browser (no button the second time)', await (async () => { await ev("Q('[data-opp=\"901\"]').click();"); await sleep(100); await ev("Q('#run').click();"); for (let i = 0; i < 120; i++) { await sleep(500); if (await ev("return !!Q('table.lev') || !!Q('#allowD3');")) break; } return await ev("return !!Q('table.lev') && !Q('#allowD3') && H.__READS.lrTeamsAll === 1;"); })());
const capped = await ev("try { await H.msLrData({ teams: [1, 2, 3, 4, 5, 6] }); return 'no error'; } catch (e) { return e.message; }");
ok('more than 5 teams in one call is refused', /At most 5 teams/.test(capped), capped);
ok('the page made no database writes', await ev("return H.__WRITES;") === 0, await ev("return H.__WRITES;"));
const bad = errs.filter(e => !/client is offline|Failed to load resource/i.test(e));
ok('no script errors', bad.length === 0, bad);
const pass = results.filter(r => r.ok).length; console.log(`game-week page: pass ${pass}  fail ${results.length - pass}`); Deno.exit(results.length === pass ? 0 : 1);

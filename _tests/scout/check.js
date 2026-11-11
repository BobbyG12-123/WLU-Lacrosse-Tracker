// TEST ONLY: drives opponent-scout.html inside host.html (real Firebase compat SDK, offline, synthetic data) through Chrome DevTools.
// Usage: deno run -A check.js <devtoolsPort> <serverPort> <shotDir>
const [port, sport, shotDir] = [Deno.args[0] || '9334', Deno.args[1] || '8774', Deno.args[2] || '.'];
const results = []; const ok = (n, c, i) => { results.push({ n, ok: !!c }); console.log((c ? '  OK   ' : '  FAIL ') + n + (c || i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 700))); };
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(), page = tabs.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; }); let id = 0; const pending = new Map(), errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 500));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(JSON.stringify(m.params.args.map(a => a.value || a.description)).slice(0, 500)); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async code => { const r = await send('Runtime.evaluate', { expression: `(async () => { const H = window, W = document.getElementById('f').contentWindow, D = W.document, Q = s => D.querySelector(s), QA = s => [...D.querySelectorAll(s)]; ${code} })()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 700)); return r.result.result.value; };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); Deno.writeFileSync(`${shotDir}/${name}.png`, Uint8Array.from(atob(r.result.data), c => c.charCodeAt(0))); };
const tagDoc = async k => ev(`const d = await H.__DB.collection('filmTags').doc('${k}').get({ source: 'cache' }); return d.exists ? d.data() : null;`);
const open = async q => { await send('Page.navigate', { url: `http://127.0.0.1:${sport}/_tests/scout/host.html${q || ''}` }); for (let i = 0; i < 60; i++) { await sleep(300); try { if (await ev("return !!(W.eval('T') && D.querySelector('[data-pickstart]'));")) return true; } catch (e) {} } return false; };
await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
// Field click helper: clicks the field diagram at (x%, y%) of its box.
const clickField = (fx, fy) => `const f = Q('#player #pickfield'), r = f.getBoundingClientRect(); f.dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: r.left + r.width * ${fx}, clientY: r.top + r.height * ${fy} }));`;
const bar = () => ev("return Q('#pickbar') ? Q('#pickbar').innerText : null;");

ok('page loads in the offline host with the synthetic opponent', await open());
const s0 = await ev("return { def: Q('[data-pickstart=def]').textContent, off: Q('[data-pickstart=off]').textContent, txt: D.body.innerText };");
ok('defense summary counts the older one-word tag as done (1 of 8)', /1\/8 done/.test(s0.def), s0.def);
ok('offense tagger is offered for their own picks (0 of 6)', /0\/6 done/.test(s0.off), s0.off);
ok('older tag shows as coverage-only in the coverage table', /older coverage-only/.test(s0.txt) && /Switch/.test(s0.txt));

// ---- Tag clip 1 (W&L pick vs Testa College): every step
await ev("Q('[data-pickstart=def]').click();"); await sleep(400);
let b = await bar();
ok('the tagger opens on an untagged clip with all five steps', b && /1\. Coverage/.test(b) && /2\. Who was involved/.test(b) && /3\. Where/.test(b) && /4\. What happened/.test(b), b && b.slice(0, 300));
const first = await ev("return W.eval('REEL')[W.eval('RI')].tagId;"); ok('untagged clips come first', first !== 'pd7', first);
ok('the screener roster is the team with the ball (W&L, offense players only)', await ev("const t = QA('[data-pj]').map(x => x.dataset.pj); return t.length > 0 && t.every(v => v.startsWith('410|')) && !t.includes('410|96') && !t.includes('410|102');"));
ok('the roster shows names with the number', /#90 Alder/.test(b));
await ev("D.dispatchEvent(new W.KeyboardEvent('keydown', { key: '3', bubbles: true }));"); await sleep(100);
ok('key 3 picks the third coverage', await ev("return W.eval('PDRAFT').cov === 'Go under';"));
await ev("Q('[data-pj=\"410|90\"]').click();"); await sleep(80);
ok('picking a screener moves to the ball carrier', await ev("return W.eval('PDRAFT').scr === '90' && W.eval('PSLOT') === 'usr';"));
await ev("Q('[data-pj=\"410|93\"]').click();"); await sleep(80);
ok('the defender slots switch to the defending team (Testa College, defenders)', await ev("const t = QA('[data-pj]').map(x => x.dataset.pj); return W.eval('PSLOT') === 'sd' && t.every(v => v.startsWith('901|')) && t.includes('901|7') && !t.includes('901|1');"));
await ev("Q('[data-pj=\"901|7\"]').click();"); await sleep(80); await ev("Q('[data-pj=\"901|8\"]').click();"); await sleep(80);
await ev(clickField(0.25, 0.4)); await sleep(80);
const loc = await ev("const d = W.eval('PDRAFT'), f = Q('#player #pickfield'), r = f.getBoundingClientRect(), pt = f.createSVGPoint(); pt.x = r.left + r.width * 0.25; pt.y = r.top + r.height * 0.4; const q = pt.matrixTransform(f.getScreenCTM().inverse()), y = W.eval('pfUn')(q.x, q.y); return { lat: d.lat, dist: d.dist, eLat: y.lat, eDist: y.dist, txt: Q('#pickbar').innerText };");
ok('clicking the tracker-style field stores the spot in yards (left of the goal, in front)', loc.lat < -3 && loc.dist > 0 && loc.dist < 21.5 && Math.abs(loc.lat - loc.eLat) < 0.4 && Math.abs(loc.dist - loc.eDist) < 0.4 && loc.lat * 2 === Math.round(loc.lat * 2) && loc.dist * 2 === Math.round(loc.dist * 2) && /yds out, [\d.]+ yds left/.test(loc.txt), loc);
// hover readout and guides
await ev("const f = Q('#player #pickfield'), r = f.getBoundingClientRect(); f.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.7 }));"); await sleep(60);
const hv = await ev("return { rd: Q('#pfread').textContent, g: Q('#pfhover').innerHTML.length, still: [W.eval('PDRAFT').lat, W.eval('PDRAFT').dist] };");
ok('hovering shows the yardage under the cursor and guide lines, without moving the set spot', /^Click to set: [\d.]+ yds out, [\d.]+ yds right$/.test(hv.rd) && hv.g > 100 && hv.still[0] === loc.lat && hv.still[1] === loc.dist, hv);
await ev("Q('#player #pickfield').dispatchEvent(new W.MouseEvent('mouseleave', { bubbles: false }));"); await sleep(30);
ok('leaving the field clears the hover readout', await ev("return Q('#pfread').textContent === '' && Q('#pfhover').innerHTML === '';"));
// exact entry
const riX = await ev("return W.eval('RI');");
await ev("const i = Q('#pfdist'); i.value = '12'; i.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));"); await sleep(60);
await ev("const i = Q('#pflat'); i.value = '4'; i.dispatchEvent(new W.Event('change', { bubbles: true }));"); await sleep(60);
ok('typing yards out and from center sets the exact spot, keeping the side', await ev("const d = W.eval('PDRAFT'); return d.dist === 12 && d.lat === -4;") && /Set: 12 yds out, 4 yds left/.test(await bar()));
ok('Enter in a yardage box does not save the clip', await ev(`return W.eval('RI') === ${riX};`));
await ev("Q('[data-pfside=R]').click();"); await sleep(60);
ok('Right flips the side', await ev("return W.eval('PDRAFT').lat === 4;"));
await ev("const i = Q('#pfdist'); i.value = '-6'; i.dispatchEvent(new W.Event('change', { bubbles: true }));"); await sleep(60);
ok('negative yards out places it behind the goal', /6 yds behind the goal, 4 yds right/.test(await bar()));
await ev("const i = Q('#pfdist'); i.value = '40'; i.dispatchEvent(new W.Event('change', { bubbles: true }));"); await sleep(60);
ok('out-of-range yardage is held to the field', await ev("return W.eval('PDRAFT').dist === 21.5;"));
await ev(clickField(0.25, 0.4)); await sleep(60);
ok('step 5 is hidden until a result is picked', !/5\. Breakdown/.test(await bar()));
await ev("Q('[data-pres=goal_pick]').click();"); await sleep(80);
b = await bar(); ok('a goal defaults to "Breakdown: whose fault" and lists the four players', await ev("return W.eval('PDRAFT').call === 'fault';") && /Whose fault\?/.test(b) && (b.match(/\(screener|\(ball carrier|’s defender\)/g) || []).length >= 4, b.slice(-600));
await ev("Q('[data-pcj=\"901|8\"]').click();"); await sleep(80);
ok('fault goes to the ball carrier’s defender', await ev("return W.eval('PDRAFT').cj === '8' && W.eval('PDRAFT').cT === 901;"));
ok('all filled is shown', /All filled/.test(await bar()));
await shot('01_tagger_clip1'); await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(200);
ok('on a laptop-height screen with a real-size video, the video stays on screen and Save can be scrolled to', await ev("const p = Q('#player'); Q('#pv').style.height = '368px'; await new Promise(r => setTimeout(r, 100)); const v = Q('#pv').getBoundingClientRect(); const fits = Q('#psave').getBoundingClientRect().bottom <= p.clientHeight; p.scrollTop = p.scrollHeight; await new Promise(r => setTimeout(r, 100)); const sb = Q('#psave').getBoundingClientRect(); const out = p.classList.contains('pickmode') && v.top >= 0 && (fits || (p.scrollHeight > p.clientHeight && sb.bottom <= p.clientHeight)); p.scrollTop = 0; Q('#pv').style.height = ''; return out;")); await shot('01b_tagger_laptop'); await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
await ev("D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));"); await sleep(300);
const d1 = await tagDoc('pick_def_901'); const r1 = d1 && d1.t && d1.t[first];
ok('Enter saves to filmTags/pick_def_901 through the real SDK (no cross-frame object error)', r1 && r1.cov === 'Go under' && r1.scr === '90' && r1.usr === '93' && r1.sd === '7' && r1.ud === '8' && r1.res === 'goal_pick' && r1.call === 'fault' && r1.cj === '8' && r1.cT === 901 && r1.oT === 410 && r1.dT === 901 && Math.abs(r1.lat - loc.lat) < 0.01 && Math.abs(r1.dist - loc.dist) < 0.01, r1);
ok('the record keeps every field, clip details, tagger and time', r1 && ['cov', 'oT', 'dT', 'scr', 'usr', 'sd', 'ud', 'lat', 'dist', 'res', 'call', 'cj', 'cT', 'sb', 'typ', 'pg', 'by', 'at'].every(k => k in r1) && r1.sb === 'G1' && r1.by === 'tester@example.test', r1);
ok('the save is shown as in progress while offline, and moves to the next clip', await ev("return W.eval('RI') === 1 && /Saving clip 1/.test(Q('#pmsg').textContent);"));
ok('no save failure on screen', !/FAILED/.test(await bar()));

// ---- Clip 2: good defense, team credit; check fields reset per clip
const clip2 = await ev("return W.eval('REEL')[W.eval('RI')].tagId;");
ok('the next clip starts empty', await ev("return !W.eval('PDRAFT').cov && !W.eval('PDRAFT').scr && !W.eval('PDRAFT').res && W.eval('PSLOT') === 'scr';"));
await ev("Q('[data-pcov=\"Switch\"]').click(); Q('[data-pres=to_forced]').click();"); await sleep(80);
ok('a forced turnover defaults to "Good defense: who gets credit"', await ev("return W.eval('PDRAFT').call === 'credit';") && /Who gets credit\?/.test(await bar()));
await ev("Q('[data-pcj=\"team|team\"]').click(); Q('#psave').click();"); await sleep(250);
// ---- Clip 3: another defender via roster, typed screener number
await ev("Q('[data-pcov=\"Hedge & recover\"]').click();"); await sleep(50);
await ev("const i = Q('[data-ptype=\"data-pj\"]'); i.value = '#99'; i.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));"); await sleep(80);
ok('a typed number fills the slot and moves on', await ev("return W.eval('PDRAFT').scr === '99' && W.eval('PSLOT') === 'usr';"));
await ev("const i = Q('[data-ptype=\"data-pj\"]'); i.value = '4'; i.dispatchEvent(new W.KeyboardEvent('keydown', { key: '4', bubbles: true }));"); await sleep(50);
ok('typing a digit in a number box does not change coverage', await ev("return W.eval('PDRAFT').cov === 'Hedge & recover';"));
await ev("Q('[data-pres=shot_saved]').click();"); await sleep(50); await ev("Q('[data-pother]').click();"); await sleep(80);
ok('"Another defender" opens the defending roster', await ev("return QA('[data-pcj]').some(x => x.dataset.pcj === '901|9');"));
await ev("QA('[data-pcj]').find(x => x.dataset.pcj === '901|9').click();"); await sleep(80);
ok('the other defender is shown on the button', /Another defender: #9/.test(await bar()));
await ev("Q('#psave').click();"); await sleep(250);
// ---- Clip 4: skip; Clip 5: nothing set, save refused
const before = await ev("return W.eval('RI');"); await ev("Q('#pskip').click();"); await sleep(150);
ok('Skip moves on without saving', await ev(`return W.eval('RI') === ${before} + 1;`) && !((await tagDoc('pick_def_901')).t[await ev(`return W.eval('REEL')[${before}].tagId;`)]));
await ev("Q('#psave').click();"); await sleep(100);
ok('saving an empty form is refused with a message', /Nothing to save/.test(await bar()));
// ---- Unsaved work survives Prev/Next and arrow keys, and is marked
await ev("Q('[data-pcov=\"Switch\"]').click();"); await sleep(50);
ok('an edited clip is marked Unsaved changes', /Unsaved changes/.test(await bar()));
const here = await ev("return W.eval('RI');"); await ev("Q('#pnext').click();"); await sleep(200); await ev("Q('#pprev').click();"); await sleep(200);
ok('unsaved coverage survives Next then Prev', await ev(`return W.eval('RI') === ${here} && W.eval('PDRAFT').cov === 'Switch';`));
await ev("D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));"); await sleep(200); await ev("D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));"); await sleep(200);
ok('unsaved coverage survives the arrow keys', await ev("return W.eval('PDRAFT').cov === 'Switch';"));
await ev("Q('#preset').click();"); await sleep(50);
ok('Clear this form empties the clip', await ev("return !W.eval('PDRAFT').cov;") && !/Unsaved changes/.test(await bar()));
// ---- Unsaved work survives closing the tagger, and the summary says so
await ev("Q('[data-pcov=\"Jump / double\"]').click();"); await sleep(50); const keepId = await ev("return W.eval('REEL')[W.eval('RI')].tagId;");
await ev("Q('#pclose').click();"); await sleep(300);
ok('after closing with unsaved work, the summary shows 1 clip with unsaved changes', /1 clip with unsaved changes/.test(await ev("return Q('[data-pickstart=def]').parentElement.innerText;")));
await ev("Q('[data-pickstart=def]').click();"); await sleep(300); await ev(`const i = W.eval('REEL').findIndex(c => c.tagId === '${keepId}'); W.eval('RI = ' + i); W.showClip();`); await sleep(200);
ok('reopening the tagger brings the unsaved work back', await ev("return W.eval('PDRAFT').cov === 'Jump / double';") && /Unsaved changes/.test(await bar()));
await ev("Q('#preset').click();"); await sleep(50);
// ---- Change a result: call fields are cleared, and merge leaves no old value behind
const goTo = async tid => ev(`W.eval('RI = ' + W.eval('REEL').findIndex(c => c.tagId === '${tid}')); W.showClip();`);
await goTo(first); await sleep(200);
ok('reopening a saved clip shows its tags', await ev("return W.eval('PDRAFT').cov === 'Go under' && W.eval('PDRAFT').cj === '8';"));
await ev("Q('[data-pres=reset]').click();"); await sleep(50); await ev("Q('[data-pcall=\"\"]').click(); Q('#psave').click();"); await sleep(250);
const r1b = (await tagDoc('pick_def_901')).t[first];
ok('changing the result to "Reset / nothing, no call" clears fault fields in the saved record', r1b.res === 'reset' && r1b.call === null && r1b.cj === null && r1b.cT === null && r1b.scr === '90', r1b);
// ---- Clearing a saved tag: the clip counts as untagged again
const clipB = clip2; await goTo(clipB); await sleep(200);
ok('a saved clip reopens without the unsaved marker', !/Unsaved changes/.test(await bar()));
await ev("Q('#preset').click();"); await sleep(50); await ev("Q('#psave').click();"); await sleep(250);
const cleared = (await tagDoc('pick_def_901')).t[clipB];
ok('Clear this form then Save clears a saved tag', cleared && cleared.cov === null && cleared.res === null && cleared.cj === null, cleared);
await goTo(clipB); await sleep(150); await ev("Q('[data-pcov=\"Switch\"]').click(); Q('[data-pres=to_forced]').click();"); await sleep(50); await ev("Q('[data-pcj=\"team|team\"]').click(); Q('#psave').click();"); await sleep(250);
await ev("Q('#pclose').click();"); await sleep(400);

// ---- Summary
const sm = await ev("const box = Q('[data-pickstart=def]').closest('div').parentElement; return { btn: Q('[data-pickstart=def]').textContent, txt: box.innerText };");
ok('summary counts 4 of 8 done after tagging three (plus the older tag)', /4\/8 done/.test(sm.btn), sm.btn);
ok('coverage table lists each tagged coverage', ['Go under', 'Switch', 'Hedge & recover'].every(c => sm.txt.includes(c)), sm.txt.slice(0, 600));
ok('results table and the field map appear', /What happened after/i.test(sm.txt) && /Where the picks were set \(1\)/.test(sm.txt), sm.txt.slice(0, 900));
ok('defenders table names Testa College defenders (after a fresh load too) with fault and credit', /#7 Gum/.test(sm.txt) && /#9 Ivy/.test(sm.txt) && /\bFault\b/i.test(sm.txt) && /Credit/i.test(sm.txt), sm.txt.slice(-900));
ok('best/worst waits for 5+ tagged picks', /Best and worst show once two players have 5\+ picks with a tagged result/.test(sm.txt));
ok('picks by W&L are called out', /were our picks/.test(sm.txt), sm.txt.slice(0, 900));
await ev("Q('[data-pickstart=def]').scrollIntoView();"); await sleep(150); await shot('02_defense_summary');
ok('the older filmTags/pick doc is untouched', JSON.stringify((await tagDoc('pick')).t) === JSON.stringify({ pd7: 'Switch' }));

// ---- Offense side: defending team comes from the same game
await ev("Q('[data-pickstart=off]').click();"); await sleep(400);
ok('offense clips know the defending team from the same game', await ev("const c = W.eval('REEL')[0]; return c.oT === 901 && (c.dT === 410 || c.dT === 902);"));
ok('screener roster on offense is their own team', await ev("return QA('[data-pj]').every(x => x.dataset.pj.startsWith('901|'));"));
await ev("Q('[data-pcov=\"Fight over\"]').click(); Q('[data-pj=\"901|1\"]').click();"); await sleep(50); await ev("Q('[data-pj=\"901|4\"]').click();"); await sleep(50);
await ev(clickField(0.5, 0.08)); await sleep(60);
const bh = await ev("const d = W.eval('PDRAFT'); return { lat: d.lat, dist: d.dist, txt: Q('#pickbar').innerText };");
ok('a click behind the cage stores a spot behind the goal (X)', bh.dist < -2 && Math.abs(bh.lat) < 3 && /behind the goal/.test(bh.txt), bh);
ok('the pick field is the tracker drawing: turf, GLE, crease, cage, yard numbers, end line', await ev("const t = Q('#pickfield').outerHTML; return /turf/.test(t) && /GLE/.test(t) && /END LINE/.test(t) && /pipeH/.test(t) && />20</.test(t);")); await ev("Q('[data-pres=goal_later]').click();"); await sleep(50); await ev("Q('#psave').click();"); await sleep(250); await ev("Q('#pclose').click();"); await sleep(400);
const o1 = (await tagDoc('pick_off_901')).t; const ok1 = Object.values(o1)[0];
ok('offense tag saves to filmTags/pick_off_901 with both teams', ok1 && ok1.oT === 901 && ok1.scr === '1' && ok1.usr === '4' && ok1.res === 'goal_later', ok1);
const so = await ev("const box = Q('[data-pickstart=off]').closest('div').parentElement; return box.innerText;");
ok('offense summary lists their screeners and ball carriers', /Their screeners and ball carriers/.test(so) && /#1/.test(so) && /#4/.test(so), so.slice(-600));

// ---- Reload the page: tags come back from the database
await ev("W.location.reload();"); for (let i = 0; i < 40; i++) { await sleep(300); try { if (await ev("return !!(W.eval('T') && Q('[data-pickstart]'));")) break; } catch (e) {} }
ok('after a reload the saved tags load back (4/8 and 1/6)', await ev("return /4\\/8 done/.test(Q('[data-pickstart=def]').textContent) && /1\\/6 done/.test(Q('[data-pickstart=off]').textContent);"));
// ---- Five-pick defender gets ranked
await ev(`for (const id of ['pd0','pd1','pd2','pd3','pd4','pd5']) W.eval('PT').def[id] = Object.assign({}, W.eval('PT').def[id] || {}, { cov: 'Switch', oT: 410, dT: 901, sd: '7', ud: id < 'pd2' ? '8' : '9', res: id === 'pd0' ? 'goal_pick' : id === 'pd5' ? 'goal_later' : 'reset', call: null, cj: null, cT: null });
  W.eval('PT').def.pd6 = { cov: 'Switch', oT: 902, dT: 901, sd: '8', ud: '9', note: null, res: 'to_forced', call: 'credit', cj: '9', cT: 901 }; W.render();`); await sleep(200);
const rk = await ev("return Q('[data-pickstart=def]').closest('div').parentElement.innerText;");
ok('best and worst appear once players reach 5 picks with a result, with counts', /Best:/.test(rk) && /Worst:/.test(rk) && /goals off the pick on \d+ picks with a result/.test(rk), rk.slice(-500));
const row7 = await ev("const tr = [...D.querySelectorAll('tr')].find(t => /^#7 Gum/.test(t.innerText.trim())); return tr ? [...tr.children].map(c => c.innerText.split('\\n')[0].trim()) : null;");
ok('a goal later in the possession is shown but not counted against the defender (#7: 1 off the pick, 1 later, 1 of 6 = 16.7%)', row7 && row7[3] === '1' && row7[4] === '1' && row7[5] === '16.7%', row7);
ok('the note says later goals are not counted', /Goals later in the possession are shown but not counted/.test(rk));
// ---- Existing slide tagger still works the old way
await ev("Q('[data-tagstart=slide]').click();"); await sleep(300);
ok('the slide tagger still opens with its own question', /How did Testa College slide/.test(await ev("return Q('#tagbar').innerText;")) && !(await ev("return !!Q('#pickbar');")));
await ev("Q('[data-tag=\"Adjacent slide\"]').click();"); await sleep(80); await ev("Q('[data-tsub=\"Wing\"]').click();"); await sleep(250);
ok('a slide tag still saves one value to filmTags/slide', (await tagDoc('slide')).t.dd0 === 'Adjacent slide · Wing', (await tagDoc('slide')).t);
await ev("Q('#pclose').click();"); await sleep(300);
// ---- Load failure is shown, not hidden
ok('closing the tagger clears pick mode', await ev("return !Q('#player') || !Q('#player').classList.contains('pickmode') || Q('#player').hidden;"));
ok('page loads when pick docs are missing offline', await open('?nopick=1'));
ok('a pick-tag load failure is shown on the page, and the page still works', /Pick tags could not be loaded/.test(await ev("return D.body.innerText;")));
const bad = errs.filter(e => !/client is offline|pick tags load failed|missing_test_clip|Failed to load resource|MEDIA_ERR|NotSupportedError|no supported source/i.test(e));
ok('no other script errors', bad.length === 0, bad);
const pass = results.filter(r => r.ok).length; console.log(`scout pick tagger: pass ${pass}  fail ${results.length - pass}`); Deno.exit(results.length === pass ? 0 : 1);

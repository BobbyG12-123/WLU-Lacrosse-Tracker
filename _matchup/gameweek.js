// Game-week page (experimental, behind the Simulation flag). Reads the tracker through its host functions; never writes.
(function () {
  const V3 = window.MS.V3, $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const G = { host: null, exp: null, cols: null, meta: null, d3: null, teams: {}, players: {}, opp: null, games: 4000, use: {}, labels: null, S: null, busy: false, msg: '' };
  let host = null; try { host = window.parent !== window && window.parent.msStudioData && window.parent.msLrData ? window.parent : null; } catch (e) { host = null; }
  async function d3() {
    const key = 'msD3:' + (G.meta.updated || '') + ':' + (G.meta.season || '');
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.eff) return Object.assign(c, { by_type: G.meta.sb_league.by_type, pick: G.meta.sb_league.pick, no_pick: G.meta.sb_league.no_pick }); } catch (e) { /* no cache */ }
    G.msg = 'Working out D3 averages from every team record (first time only)…'; controls();
    const r = await host.msLrData({ d3: true }), v = V3.sources.d3From(G.meta, r.d3);
    try { localStorage.setItem(key, JSON.stringify({ eff: v.eff, emo: v.emo, teams: v.teams })); } catch (e) { /* storage off: recomputed next time */ }
    return v;
  }
  async function load(id) {
    if (!G.teams[id]) { const r = await host.msLrData({ teams: [id], players: [id] }); G.teams[id] = r.teams[id]; G.players[id] = r.players[id]; }
  }
  function controls() {
    const wl = G.teams[410], sched = wl ? [...new Map((wl.games || []).filter(g => g.opponentID).map(g => [g.opponentID, g.opponent_display])).entries()] : [];
    $('controls').innerHTML = `<div class="pick-row"><b style="min-width:84px">Opponent</b>${sched.map(([id, n]) => `<button class="pill ${G.opp === id ? 'on' : ''}" data-opp="${id}">${esc(n)}</button>`).join('')}</div>
      <div class="pick-row"><b style="min-width:84px">Any team</b><input type="search" id="q" list="teams" placeholder="Search D3 / D1 teams"><datalist id="teams">${(G.meta ? G.meta.teams : []).map(t => `<option value="${esc(t.name)}">`).join('')}</datalist></div>
      ${G.opp ? `<div class="pick-row"><b style="min-width:84px">Our logs</b>${labelsAll().length ? labelsAll().map(l => `<button class="pill ${curLabels().includes(l) ? 'on' : ''}" data-lab="${esc(l)}">${esc(l)}</button>`).join('') + '<span class="muted" style="font-size:12px">2027 games and scrimmages under these labels update their numbers</span>' : '<span class="muted">No 2027 games or scrimmages logged against anyone yet.</span>'}</div>` : ''}
      <div class="pick-row"><b style="min-width:84px">Games</b>${[2000, 4000, 8000].map(n => `<button class="pill ${G.games === n ? 'on' : ''}" data-g="${n}">${n.toLocaleString()}</button>`).join('')}
      <button class="go" id="run" ${!G.opp || G.busy ? 'disabled' : ''}>${G.busy ? 'Running…' : 'Run game week'}</button></div>${G.msg ? `<p class="${/Could not|not found|Not available/.test(G.msg) ? 'err' : 'muted'}" style="margin:6px 0 0">${esc(G.msg)}</p>` : ''}`;
    document.querySelectorAll('[data-opp]').forEach(b => b.onclick = () => { G.opp = +b.dataset.opp; G.labels = null; G.S = null; prepLabels(); });
    document.querySelectorAll('[data-lab]').forEach(b => b.onclick = () => { const l = b.dataset.lab, c = curLabels(); G.labels = c.includes(l) ? c.filter(x => x !== l) : c.concat([l]); controls(); });
    document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { G.games = +b.dataset.g; controls(); });
    const q = $('q'); if (q) q.onchange = () => { const t = G.meta.teams.find(x => x.name.toLowerCase() === q.value.trim().toLowerCase()); if (t) { G.opp = t.id; G.labels = null; G.S = null; prepLabels(); } };
    const r = $('run'); if (r) r.onclick = run;
  }
  // Tracker opponent labels for this season, and which ones count as this opponent (auto-matched until changed).
  const labelsAll = () => G.logs ? Object.keys(G.logs.opponents).sort() : [];
  const curLabels = () => G.labels || G.autoLabels || [];
  async function prepLabels() {
    controls(); if (!G.opp) return;
    try { await load(G.opp); const t = G.teams[G.opp], n = x => String(x || '').toLowerCase().replace(/[^a-z]/g, ''), keys = [n(t.name), n(t.short)].filter(x => x.length >= 2);
      G.autoLabels = labelsAll().filter(l => { const x = n(l); return x && keys.some(k => k === x || (x.length >= 4 && k.startsWith(x)) || (k.length >= 4 && x.startsWith(k))); }); } catch (e) { G.autoLabels = []; }
    controls();
  }
  async function run() {
    if (!G.opp || G.busy) return; G.busy = true; G.msg = 'Loading team records…'; controls();
    try {
      await load(410); await load(G.opp); if (!G.d3) G.d3 = await d3();
      G.msg = 'Simulating…'; controls(); await new Promise(r => setTimeout(r, 30));
      const inp = V3.sources.inputs(G.exp, G.cols, { meta: G.meta, teams: G.teams, players: G.players }, { oppId: G.opp, d3: G.d3, games: G.games, use: G.use, labels: curLabels() });
      G.S = V3.sheet.build(inp); G.names = inp.names; G.notes = inp.sourceNotes; G.msg = '';
      $('title').textContent = `W&L vs ${G.teams[G.opp].name}`; $('srcline').textContent = G.notes.join(' ');
      $('app').innerHTML = V3.sheetView.render(G.S, G.names); wire();
    } catch (e) { G.msg = 'Could not run: ' + (e.message || e); console.error(e); }
    G.busy = false; controls();
  }
  function wire() {
    document.querySelectorAll('input.use').forEach(i => i.onchange = () => { const v = Math.max(0, Math.min(100, Math.round(+i.value || 0))); G.use[i.dataset.use] = v; i.value = v;
      const cell = i.closest('tr').lastElementChild; cell.style.opacity = 0.4; setTimeout(() => { const w = V3.sheet.unitWin(G.S, i.dataset.use, v); cell.innerHTML = '<b>' + Math.round(100 * w) + '%</b>'; cell.style.opacity = 1; }, 10); });
  }
  async function boot() {
    if (!host) { $('srcline').textContent = 'Open this from the tracker (Simulation, with the dev flag on) while signed in.'; return; }
    try {
      const x = JSON.parse(JSON.stringify(await host.msStudioData())); G.exp = x.exp; G.cols = x.cols; G.logs = V3.sources.ourLogs(G.exp, G.cols, 2027);
      const r = await host.msLrData({ meta: true, teams: [410] }); G.meta = r.meta; G.teams[410] = r.teams[410];
      if (!G.meta || !G.teams[410]) throw new Error('LacrosseReference data not found on the tracker');
      $('srcline').textContent = `LacrosseReference data on the tracker: ${G.meta.season} season, as of ${G.meta.updated}. Pick an opponent.`;
    } catch (e) { G.msg = 'Could not read tracker data: ' + (e.message || e); }
    controls();
    window.__GW = G;
  }
  boot();
})();

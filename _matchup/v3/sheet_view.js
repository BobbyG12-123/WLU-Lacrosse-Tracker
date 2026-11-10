// W&L Matchup Studio, engine v3 (experimental): draws the game-week sheet from V3.sheet.build output.
(function (g) {
  const MS = g.MS = g.MS || {};
  const V3 = MS.V3 = MS.V3 || {};
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const pc = (v, d = 0) => v == null || !isFinite(v) ? '—' : (100 * v).toFixed(d) + '%';
  const pts = v => (v >= 0 ? '+' : '−') + Math.abs(100 * v).toFixed(1);
  const src = s => s === 'real' ? '<span class="src real">logged</span>' : '<span class="src proxy">rough proxy</span>';
  // names: { wl: { jersey: name }, opp: { jersey: name } }
  function render(S, names) {
    const nm = (side, j) => { const n = names && names[side] && names[side][j]; return n ? `#${j} ${n.trim().split(/\s+/).slice(-1)[0]}` : '#' + j; };
    const BT = S.BT, top = S.levers.slice(0, 3);
    const fm = S.faceoffs.model, five = [];
    top.forEach(l => five.push(`<b>${esc(l.area)}:</b> ${esc(l.title)} → we win ${pc(l.w)} (${pts(l.w - BT)}).`));
    if (S.ourGoalies.length >= 2) { const a = S.ourGoalies[0], b = S.ourGoalies[1]; five.push(`<b>Goalie:</b> ${esc(nm('wl', a.j))} matches up best (${pc(a.w)} with him in net; ${esc(nm('wl', b.j))} ${pc(b.w)}).`); }
    const c0 = S.causes[0]; if (c0) five.push(`<b>How we'd lose:</b> ${esc(c0.title.toLowerCase())} (${Math.round(c0.share * 10)} in 10 losses). ${esc(c0.todo)}`);
    const lev = S.levers.map(l => `<tr><td class="l"><span class="area">${esc(l.area)}</span> <b>${esc(l.title)}</b> ${src(l.src)}</td><td class="l why">${esc(l.why)}</td>
      <td>${l.n == null ? `<small class="muted">${esc(l.unit)}</small>` : `${l.n} <small class="muted">${esc(l.unit)}</small>${l.n < 30 ? '<br><span class="thin">thin</span>' : ''}`}</td>
      <td>${l.poss ? `<small class="muted">+${l.poss} possessions</small>` : (l.who === 'wl' ? (l.dG >= 0 ? '+' : '−') + Math.abs(l.dG).toFixed(1) + ' ours' : '−' + Math.abs(l.dG).toFixed(1) + ' theirs')}</td>
      <td><b class="${l.w > BT + 0.003 ? 'good' : ''}">${pc(l.w)}</b><br><small class="muted">${pts(l.w - BT)}</small></td></tr>`).join('');
    const causes = S.causes.map(c => `<div class="cause"><div class="ch"><b>${esc(c.title)}</b><span class="share">${Math.round(c.share * 10)} in 10 losses</span></div><div class="cb">In those losses: <b>${esc(c.inLoss)}</b>. In our wins: ${esc(c.inWin)}.</div><div class="ct">What to do: ${esc(c.todo)}</div></div>`).join('');
    const useBox = (key, v) => `<input class="use" type="number" min="0" max="100" step="5" value="${v}" data-use="${esc(key)}"> %`;
    const pairs = S.pairs.list.map(p => `<tr><td class="l"><b>${esc(nm('wl', p.scr))} → ${esc(nm('wl', p.usr))}</b></td><td>${p.n}${p.n < 10 ? ' <span class="thin">thin</span>' : ''}</td><td>${p.g}</td><td>${useBox(p.key, p.use)}</td><td><b>${pc(p.w)}</b></td></tr>`).join('');
    const groups = S.groups.list.map(x => `<tr><td class="l">${x.players.map(j => esc(nm('wl', j))).join(', ')}</td><td>${x.n}${x.n < 30 ? ' <span class="thin">thin</span>' : ''}</td><td>${x.goals}</td><td>${useBox(x.key, x.use)}</td><td><b>${pc(x.w)}</b></td></tr>`).join('');
    const gk = S.ourGoalies.map(x => `<tr><td class="l"><b>${esc(nm('wl', x.j))}</b></td><td>${x.n}</td><td>${pc(x.base)}</td><td class="l">${esc(x.weakest)} ${pc(x.zr[x.weakest])}</td><td><b>${pc(x.w)}</b></td></tr>`).join('');
    const foHead = S.faceoffs.theirs.map((t, j) => `<th>#${esc(t.j)} ${esc((t.name || '').split(/\s+/).slice(-1)[0])}<br><small class="muted">takes ${pc(fm.tShare ? fm.tShare[j] : null)}</small></th>`).join('');
    const foRows = (fm.M || []).map((row, i) => `<tr><td class="l"><b>#${esc(S.faceoffs.ours[i].j)}</b><br><small class="muted">${S.faceoffs.ours[i].w}-${S.faceoffs.ours[i].l} on film</small></td>${row.map(c => `<td><b>${pc(c.p)}</b><br><small class="muted">${[c.dir ? `head-to-head ${c.dir[0]}-${c.dir[1]}` : null, c.ind.length ? `via ${c.ind.map(x => esc(x.via.split(/\s+/).slice(-1)[0])).join(', ')}` : null].filter(Boolean).join(' · ') || 'season records only'}</small></td>`).join('')}</tr>`).join('');
    const T = S.teams;
    return `
    <div class="banner"><b>EXPERIMENTAL · engine ${esc(S.version)}</b> · Real data only; nothing invented. Not validated against games yet (first test: 2027 games). ${esc(T.opp.name)}: ${esc(T.opp.note)}, keeping ${pc(T.opp.retOff)} of their offensive value and ${pc(T.opp.retDef)} of their defensive value. W&amp;L: ${esc(T.wl.note)}.</div>
    <section class="tiles"><div class="tile"><div class="k">W&amp;L wins</div><div class="v">${pc(S.base.win)}</div><div class="d">${S.base.games.toLocaleString()} games</div></div>
      <div class="tile"><div class="k">Average score</div><div class="v">${S.base.score[0].toFixed(1)}–${S.base.score[1].toFixed(1)}</div><div class="d">${pc(S.base.ot)} go to overtime</div></div>
      <div class="tile"><div class="k">Expected faceoff win %</div><div class="v">${pc(S.base.fo)}</div><div class="d">head-to-head first</div></div></section>
    <section class="panel five"><h2>This week in five lines</h2><ol>${five.map(x => `<li>${x}</li>`).join('')}</ol></section>
    <section class="panel"><h2>Specific ways to swing it</h2><p class="lead">Right now we win <b>${pc(BT)}</b>. Each line is one thing we can do, what it's worth, and our win % if we do it. Ranked.</p>
      <div class="tw"><table class="lev"><thead><tr><th class="l">Do this</th><th class="l">Why</th><th>Based on</th><th>Goals a game</th><th>We win</th></tr></thead><tbody>${lev}</tbody></table></div></section>
    <div class="g2"><section class="panel"><h2>The ways we lose</h2><p class="lead">We lose ${pc(1 - S.base.win)} of the games. Each loss is sorted by what went most wrong in it.</p>${causes}</section>
      <section class="panel"><h2>Faceoffs by matchup</h2><p class="muted">Head-to-head draws count first, then FOGOs both have faced, then season records.</p>${foRows ? `<div class="tw"><table><thead><tr><th class="l">Ours \\ theirs</th>${foHead}</tr></thead><tbody>${foRows}</tbody></table></div>` : `<p class="muted">${esc(fm.note || 'No faceoff film data.')}</p>`}</section></div>
    <div class="g2"><section class="panel"><h2>Our pick pairs</h2><p class="muted">Logged pick shots in practice and scrimmage (${S.pairs.tot}; team ${pc(S.pairs.team)} goals per pick shot). "How much" = share of our picks this pair runs. Win % replays with that.</p>
        <div class="tw"><table><thead><tr><th class="l">Pair</th><th>Pick shots</th><th>Goals</th><th>How much</th><th>Win %</th></tr></thead><tbody>${pairs || '<tr><td class="l" colspan="5">No pair with 3+ logged pick shots.</td></tr>'}</tbody></table></div></section>
      <section class="panel"><h2>Offensive groupings</h2><p class="muted">Six on the field together from lineup logs (team ${pc(S.groups.team)} goals per possession end). "How much" = share of our 6-on-6 possessions.</p>
        <div class="tw"><table><thead><tr><th class="l">Group</th><th>Possessions</th><th>Goals</th><th>How much</th><th>Win %</th></tr></thead><tbody>${groups || '<tr><td class="l" colspan="5">No group with 8+ logged possession ends.</td></tr>'}</tbody></table></div></section></div>
    <section class="panel"><h2>Our goalie in net</h2><p class="muted">Each goalie's logged saves by zone, against how their shooters place the ball${S.missing.some(m => /shooters put the ball/.test(m)) ? ' (not tagged yet, so an even spread)' : ''}. Win % replays the games with him in net.</p>
      <div class="tw"><table><thead><tr><th class="l">Goalie</th><th>Logged shots</th><th>Save %</th><th class="l">Weakest zone</th><th>We win</th></tr></thead><tbody>${gk || '<tr><td class="l" colspan="5">No goalie with 60+ logged shots.</td></tr>'}</tbody></table></div></section>
    <section class="panel"><h2>Not in this sheet yet</h2><ul class="note">${S.missing.map(m => `<li>${esc(m)}</li>`).join('')}${T.opp.removed.length ? `<li>Left their roster (SR/GR in 2026): ${T.opp.removed.slice(0, 12).map(r => '#' + esc(r.j) + ' ' + esc((r.name || '').split(/\s+/).slice(-1)[0])).join(', ')}${T.opp.removed.length > 12 ? '…' : ''}.</li>` : ''}</ul></section>`;
  }
  V3.sheetView = { render };
})(globalThis);

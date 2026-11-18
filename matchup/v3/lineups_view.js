// W&L Matchup Studio, engine v3 (experimental): the Lineups panel (step 2: current lineup, one-player swaps, line shares).
// Draws from V3.lineups; the page (gameweek.js) wires the clicks. Laptop layout.
(function (g) {
  const MS = g.MS = g.MS || {};
  const V3 = MS.V3 = MS.V3 || {};
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const pc = (v, d = 0) => v == null || !isFinite(v) ? '—' : (100 * v).toFixed(d) + '%';
  const pts = v => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(100 * v).toFixed(1);
  const MIN_OFF = 10, MIN_DEF = 5; // suggested swaps only bring in players with at least this much logged
  const UNITS = [['attack', 'Attack', 'A'], ['mid0', 'Midfield line 1', 'M'], ['mid1', 'Midfield line 2', 'M'], ['mid2', 'Midfield line 3', 'M'],
    ['defense', 'Defense (3 close D, LSM, 2 SSDM)', 'D'], ['manUp', 'Man-up', 'O'], ['manDown', 'Man-down', 'D'], ['fogo', 'Faceoffs', 'F'], ['goalie', 'Goalie', 'G']];
  const DEF_SLOT = ['D', 'D', 'D', 'L', 'S', 'S'];

  // Candidate jerseys for each unit, by position (main or second position). For suggested swaps a player needs logs.
  function pools(R, S, forSwaps) {
    const main = R.pos.main || {}, alt = R.pos.alt || {}, all = Object.keys(main);
    const at = c => all.filter(j => main[j] === c || alt[j] === c);
    const offN = j => (R.off.players[j] || {}).U || 0, defN = j => { const d = R.def.players[j]; return d ? d.reps + d.ct : 0; };
    const okO = j => !forSwaps || offN(j) >= MIN_OFF, okD = j => !forSwaps || defN(j) >= MIN_DEF;
    return {
      attack: at('A').filter(okO), mid: at('M').filter(okO),
      defense: slot => at(DEF_SLOT[slot] || 'D').filter(okD),
      manUp: at('A').concat(at('M')).filter(okO), manDown: [...new Set(at('D').concat(at('L'), at('S'), at('M')))].filter(okD),
      fogo: ((S.faceoffs && S.faceoffs.model && S.faceoffs.model.M && S.faceoffs.model.M.length) ? S.faceoffs.ours : []).map(o => String(o.j)),
      goalie: (S.ourGoalies || []).map(x => String(x.j))
    };
  }
  const poolFor = (P, u) => /^mid\d$/.test(u) ? P.mid : P[u];
  const playersOf = (L, u) => u === 'attack' ? L.attack || [] : /^mid\d$/.test(u) ? ((L.mids || [])[+u.slice(3)] || {}).players || [] : u === 'fogo' || u === 'goalie' ? [L[u]] : L[u] || [];
  const isDef = u => u === 'defense' || u === 'manDown';
  // Chance better is shown no finer than 5% to 95%: it counts sample size only, so the ends would claim too much.
  const chanceTxt = c => c == null ? '—' : c > 0.95 ? '95%+' : c < 0.05 ? 'under 5%' : pc(c);

  function render(st) {
    const { S, R, L, B } = st, LU = V3.lineups, names = st.names || {};
    const nm = j => { if (j == null) return 'Pool average'; const n = names[j]; return n ? `#${j} ${n.trim().split(/\s+/).slice(-1)[0]}` : '#' + j; };
    const offTag = j => { const o = LU.offOf(R, String(j)); if (o.eff == null) return 'no logs'; return o.n ? `${(100 * o.eff).toFixed(0)} per 100 used · ${o.n.toFixed(0)} used` : 'no logs: rated as team'; };
    const defTag = j => { const d = LU.defOf(R, String(j)); return d.reps || d.ct ? `beaten ${pc(d.reps ? d.raw.b / d.reps : null)} of ${d.reps} reps · ${d.ct} caused TO` : 'no logs: rated as team'; };
    const foTag = j => { const o = (S.faceoffs.ours || []).find(x => String(x.j) === String(j)); return o ? `${o.w}-${o.l} on film` : 'not in the faceoff model'; };
    const gTag = j => { if (j == null) return 'the sheet\'s default'; const x = (S.ourGoalies || []).find(y => String(y.j) === String(j)); return x ? `${pc(x.base)} rated save · ${x.n} shots` : 'under 60 logged shots'; };
    const tag = (u, j) => u === 'fogo' ? foTag(j) : u === 'goalie' ? gTag(j) : isDef(u) ? defTag(j) : offTag(j);
    const thin = (u, j) => { if (u === 'fogo' || u === 'goalie' || j == null) return false; if (isDef(u)) { const d = LU.defOf(R, String(j)); return d.reps + d.ct < 30; } return LU.offOf(R, String(j)).n < 30; };
    // Logged sixes a swap makes or breaks up (their together term moves the rating).
    const sixes = X => (X.mids && X.mids.length ? X.mids : [{ players: [] }]).map(m => LU.offUnit(R, (X.attack || []).concat(m.players || [])).group).filter(Boolean);
    const groupNote = (u, r) => { if (!(u === 'attack' || /^mid\d$/.test(u))) return ''; const a = sixes(L), b = sixes(r.lineup), made = b.filter(x => !a.includes(x)), broke = a.filter(x => !b.includes(x));
      const f = (x, w) => `${w} a six logged together (${x.G.toFixed(0)} goals on ${x.U} shots + turnovers)`;
      return made.concat(broke).length ? '<br><small class="muted">' + made.map(x => f(x, 'Makes')).concat(broke.map(x => f(x, 'Breaks up'))).map(esc).join('; ') + '</small>' : ''; };
    const cur = st.cur, base = S.BT, P = pools(R, S, false);
    const head = cur ? `<p class="lead">With this lineup we win <b>${pc(cur.win)}</b>${Math.abs(cur.win - base) > 1e-9 ? ` (the sheet's lineup: ${pc(base)}, <b class="${cur.win > base ? 'good' : ''}">${pts(cur.win - base)}</b>)` : ' (the sheet\'s lineup)'}.
      ${cur.per100 ? `Settled goals per 100 possessions: ours <b>${cur.per100.oursLineup.toFixed(1)}</b>, theirs <b>${cur.per100.theirsLineup.toFixed(1)}</b>.` : ''}</p>` : '';
    const unitBlock = ([u, label]) => {
      const ps = playersOf(L, u), sel = st.sel && st.sel.unit === u ? st.sel.slot : null, res = st.res && st.res[u];
      if ((u === 'fogo' && !P.fogo.length) || (u === 'goalie' && !P.goalie.length)) return `<div class="lu"><div class="luh"><b>${esc(label)}</b></div><p class="muted">${u === 'fogo' ? 'No faceoff film data for our FOGOs, so the sheet uses season rates.' : 'No goalie with 60+ logged shots.'}</p></div>`;
      if (/^mid\d$/.test(u) && !ps.length) return '';
      const chips = ps.map((j, slot) => `<button class="pill luc ${sel === slot ? 'on' : ''}" data-lu="${u}" data-slot="${slot}" title="Click to change"${st.busy ? ' disabled' : ''}><b>${esc(nm(j))}</b><small>${esc(tag(u, j))}${thin(u, j) ? ' <span class="thin">thin</span>' : ''}</small></button>`).join('');
      const share = /^mid\d$/.test(u) ? `<label class="muted" style="font-size:12px">time share <input class="use lushare" type="number" min="0" max="100" step="5" value="${Math.round(100 * (L.mids[+u.slice(3)].share ?? 1) / L.mids.reduce((a, m) => a + (m.share ?? 1), 0))}" data-mid="${u.slice(3)}"${st.busy ? ' disabled' : ''}> %</label>` : '';
      let pick = '';
      if (sel != null) {
        const pool = (typeof poolFor(P, u) === 'function' ? poolFor(P, u)(sel) : poolFor(P, u)).map(String), inUse = new Set(u === 'attack' || /^mid\d$/.test(u) ? (L.attack || []).concat(...(L.mids || []).map(m => m.players || [])).map(String) : ps.map(String));
        const opts = (u === 'goalie' ? [null] : []).concat(pool.filter(j => !inUse.has(j)));
        pick = `<div class="pick-row lupick"><span class="muted" style="font-size:12px">Put in for ${esc(nm(ps[sel]))}:</span>${opts.map(j => `<button class="pill" data-cand="${j == null ? '' : esc(j)}" data-lu="${u}" data-slot="${sel}">${esc(nm(j))}</button>`).join('') || '<span class="muted">No one else at this position.</span>'}<button class="pill" data-cancel="1">Cancel</button></div>`;
      }
      const rows = res ? res.rows.map((r, i) => `<tr><td class="l">${esc(nm(r.out))} → <b>${esc(nm(r.in))}</b>${thin(u, r.in) ? ' <span class="thin">thin</span>' : ''}<br><small class="muted">${esc(tag(u, r.in))}</small>${groupNote(u, r)}</td>
        <td><b class="${r.dWin > 0.003 ? 'good' : ''}">${pc(r.win, 1)}</b><br><small class="muted">${pts(r.dWin)}</small></td><td>${chanceTxt(r.chance)}</td>
        <td><button class="pill" data-apply="${u}" data-i="${i}"${st.busy ? ' disabled' : ''}>Use this</button></td></tr>`).join('') : '';
      const table = res ? (rows ? `<div class="tw"><table class="lus"><thead><tr><th class="l">Best one-player swaps</th><th>We win</th><th>Chance better*</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No swap candidates with enough logs.</p>') : (st.busy ? '<p class="muted">Working out swaps…</p>' : '');
      return `<div class="lu"><div class="luh"><b>${esc(label)}</b>${share}</div><div class="chips">${chips}</div>${pick}${table}</div>`;
    };
    return `<section class="panel" id="lineups"><h2>Lineups</h2>${head}
      <p class="muted">Start from the lineup most often in our logged lineup records; click a player to change him. Each unit lists the best one-player swaps from its current players, against this opponent, on the same simulated games. Ratings come from our 2027 practices and scrimmages: offense is goals produced per 100 possessions used (an assisted goal is split half with the passer); defense is beaten rate on logged reps and caused turnovers. Suggested swaps only bring in players with ${MIN_OFF}+ possessions used or ${MIN_DEF}+ defensive entries.</p>
      <p class="muted">* Chance better counts sample size only. It doesn't include how well practice numbers carry over to games, so it reads too sure; it's shown no finer than 5% to 95%. Defense ratings count caused turnovers per practice a player logged anything in, not per minute on the field, so players who take more reps rate higher. Most groups haven't been logged together enough to rate as a group; they rate as the sum of their players.</p>
      <div class="pick-row"><button class="pill" id="luReset"${st.busy ? ' disabled' : ''}>Back to the logged lineup</button>${st.msg ? `<span class="muted">${esc(st.msg)}</span>` : ''}</div>
      <div class="lus-grid">${UNITS.map(unitBlock).join('')}</div></section>`;
  }
  V3.lineupsView = { render, pools, chanceTxt, UNITS, MIN_OFF, MIN_DEF };
})(globalThis);

// W&L Matchup Studio: provider-neutral parser for official school stat pages (SIDEARM layout) into dated team-game rows.
// Reads page text only; runs nothing from it. Missing or unreadable values stay null. No provider is required by the engine.
(function (g) {
  const MS = g.MS = g.MS || {};
  MS.OFFICIAL_PARSER_VERSION = 'official-sidearm-v1';
  const clean = s => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const cells = r => [...r.matchAll(/<t[hd][\s\S]*?<\/t[hd]>/g)].map(m => clean(m[0]));
  const tables = html => [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map(m => { const cap = /<caption[\s\S]*?>([\s\S]*?)<\/caption>/.exec(m[0]); return { caption: cap ? clean(cap[1]) : '', rows: [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map(x => cells(x[0])) }; });
  const num = s => { if (s === undefined || s === '' || s === null) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
  const pair = s => { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s || ''); return m ? [Number(m[1]), Number(m[2])] : [null, null]; };
  const made = s => { const m = /^(\d+)-(\d+)\/(\d+)-(\d+)$/.exec(s || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : [null, null, null, null]; };
  const pen = s => { const m = /^(\d+)-(\d+):(\d+)\/(\d+)-(\d+):(\d+)$/.exec(s || ''); return m ? [Number(m[1]), Number(m[2]) * 60 + Number(m[3]), Number(m[4]), Number(m[5]) * 60 + Number(m[6])] : [null, null, null, null]; };
  const minutesToSec = s => { const m = /^(\d+):(\d+)$/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  function isoDate(s) { const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(s || ''); if (!m) return null; return `20${m[3].padStart(2, '0')}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  const canonName = raw => raw.replace(/^(at|vs\.?)\s+/i, '').replace(/^#\d+\s*/, '').replace(/\(RV\)\s*/, '').trim();
  function location(raw) { return /^at\s/i.test(raw) ? 'away' : /^vs\.?\s/i.test(raw) ? 'neutral' : 'home'; }
  // Returns { teamName, games: [...], totals, notes }. Each game has "us" and "them" from the same page row.
  function parseStatsPage(html, season) {
    const T = tables(html), cmp = T.find(t => /Game-By-Game Comparison/.test(t.caption)), team = T.find(t => /Game-By-Game Team/.test(t.caption)), opp = T.find(t => /Game-By-Game Opponent/.test(t.caption));
    if (!cmp) return null;
    const head = cmp.rows[0], ix = k => head.indexOf(k), notes = [], games = [], rows = cmp.rows.slice(1);
    const totalRow = rows.find(r => !r[0]) || null, teamName = totalRow ? totalRow[1] : null;
    const upBy = {}; [[team, 'us'], [opp, 'them']].forEach(([t, side]) => { if (!t) return; const h = t.rows[0], d = h.indexOf('Date'), u = h.indexOf('UP'), dn = h.indexOf('DN'); t.rows.slice(1).forEach((r, i) => { if (r[d]) (upBy[i] = upBy[i] || {})[side] = [num(r[u]), num(r[dn])]; }); });
    rows.filter(r => r[0]).forEach((r, i) => {
      let date = isoDate(r[ix('Date')]); const yr = String(Number(season) );
      if (date && date.slice(0, 4) !== yr) { notes.push(`Page date ${r[ix('Date')]} for ${r[ix('Opponent')]} is outside ${season}; year corrected for ordering.`); date = yr + date.slice(4); }
      const sc = /^(\d+)-(\d+)/.exec(r[ix('Score')] || ''); const [au, at] = pair(r[ix('A')]), [su, st] = pair(r[ix('SH')]), [gu, gt] = pair(r[ix('SOG')]), [bu, bt] = pair(r[ix('GB')]), [tu, tt] = pair(r[ix('TO')]), [fu, ft] = pair(r[ix('FO')]), [cu, ca, ct, cb] = made(r[ix('Clears')]), [pu, pus, pt, pts] = pen(r[ix('PEN-MIN')]);
      if (!sc) { notes.push(`No final score for ${r[ix('Opponent')]} on ${r[ix('Date')]}; left out.`); return; }
      const up = upBy[i] || {}, us = { goals: Number(sc[1]), assists: au, shots: su, sog: gu, gb: bu, turnovers: tu, faceoffsWon: fu, clears: cu, clearAtt: ca, penalties: pu, penaltySec: pus, emGoals: up.us ? up.us[0] : null }, them = { goals: Number(sc[2]), assists: at, shots: st, sog: gt, gb: bt, turnovers: tt, faceoffsWon: ft, clears: ct, clearAtt: cb, penalties: pt, penaltySec: pts, emGoals: up.them ? up.them[0] : null };
      games.push({ date, opponentRaw: r[ix('Opponent')], opponent: canonName(r[ix('Opponent')]), location: location(r[ix('Opponent')]), result: r[ix('W/L')] || null, us, them });
    });
    return { teamName, games, notes, totalRow };
  }
  // Official names for one school vary between sites. Aliases live in the local inputs, and an unmatched name stays its own team.
  function keyFor(name, aliases) { const n = canonName(name).toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim(); return aliases[n] || n; }
  // Merge pages into one dated list. A game seen on two schools' pages must agree; disagreements are listed, not silently resolved.
  function mergeGames(pages, aliases) {
    const by = {}, conflicts = []; 
    pages.forEach(p => { const me = keyFor(p.teamName, aliases); p.games.forEach(x => {
      const opp = keyFor(x.opponent, aliases), k = [x.date, ...[me, opp].sort()].join('|');
      if (!by[k]) { by[k] = { date: x.date, a: me, b: opp, aStats: x.us, bStats: x.them, aLocation: x.location, sources: [p.teamName] }; return; }
      const G = by[k], flip = G.a !== me, mine = flip ? G.bStats : G.aStats, theirs = flip ? G.aStats : G.bStats; G.sources.push(p.teamName);
      ['goals', 'shots', 'sog', 'turnovers', 'faceoffsWon', 'clears', 'clearAtt', 'penalties', 'gb'].forEach(f => { if (mine[f] !== x.us[f] || theirs[f] !== x.them[f]) conflicts.push({ game: k, field: f, first: [mine[f], theirs[f]], second: [x.us[f], x.them[f]], page: p.teamName }); });
    }); });
    return { games: Object.values(by).sort((x, y) => (x.date + x.a < y.date + y.a ? -1 : 1)), conflicts };
  }
  Object.assign(MS, { parseStatsPage, mergeGames, keyFor, canonName, minutesToSec, isoDate });
})(globalThis);

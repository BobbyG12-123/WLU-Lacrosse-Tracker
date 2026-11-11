// W&L Matchup Studio, engine v3 (experimental): which data a game-week run uses.
// Rule: always the newest data for the game's season. A team record from that season is used as it is; an older record is
// used with only the players who return. Our side always comes from the tracker's own logs for the season.
(function (g) {
  const MS = g.MS = g.MS || {};
  const V3 = MS.V3 = MS.V3 || {};
  // Lacrosse seasons run Aug-May: Aug 2026 onward is the 2027 season.
  const seasonOf = date => { const m = /^(\d{4})-(\d{2})/.exec(String(date || '')); return m ? (+m[2] >= 8 ? +m[1] + 1 : +m[1]) : null; };
  const unzip = (cols, v) => { const a = typeof v === 'string' ? JSON.parse(v) : v; if (!Array.isArray(a)) return null; const o = {}; cols.forEach((c, i) => { o[c] = a[i] === undefined ? null : a[i]; }); return o; };
  const ctxName = (d, type) => d.context === 'Game' ? 'Game' : d.context === 'Practice' ? 'Practice' : 'Scrimmage';

  // Our logs for a season from an Export-All-Data copy: shots, no-shot possessions and lineup records, each with its context.
  function ourLogs(exp, cols, season) {
    const S = (exp.collections && exp.collections.sessions) || {}, shots = [], poss = [], stints = [], games = {}, opponents = {};
    Object.keys(S).sort().forEach(sid => {
      const d = S[sid], date = d.date || sid.slice(0, 10); if (seasonOf(date) !== season) return;
      const context = ctxName(d);
      if (context === 'Game' && d.opponent) games[d.opponent] = (games[d.opponent] || 0) + 1;
      if (context !== 'Practice' && d.opponent) opponents[d.opponent] = (opponents[d.opponent] || 0) + 1;
      Object.keys(d).forEach(k => {
        try {
          if (k.startsWith('s_')) { const o = unzip(cols.shot, d[k]); if (o) shots.push(Object.assign(o, { context, opponent: d.opponent || o.opponent || null })); }
          else if (k.startsWith('p_')) { const o = unzip(cols.poss, d[k]); if (o) poss.push(Object.assign(o, { context, opponent: d.opponent || o.opponent || null })); }
          else if (k.startsWith('t_')) { const o = typeof d[k] === 'string' ? JSON.parse(d[k]) : d[k]; if (o && typeof o === 'object') stints.push(o); }
        } catch (e) { /* an unreadable entry is skipped; the count of skipped entries isn't needed here */ }
      });
    });
    const A = (exp.collections && exp.collections.app) || {}, r = A['roster_' + season];
    const roster = ((r && (r.list || (r.json && JSON.parse(r.json).list))) || []).map(x => ({ j: x.jersey != null ? String(x.jersey) : null, n: x.name || null }));
    return { shots, poss, stints, roster, games, opponents };
  }
  // Tracker opponent labels that look like this team (name or short name, either way round).
  function autoLabels(logs, opp) {
    const n = s => String(s || '').toLowerCase().replace(/[^a-z]/g, ''), keys = [n(opp.name), n(opp.short)].filter(x => x.length >= 2);
    return Object.keys(logs.opponents).filter(l => { const x = n(l); return x && keys.some(k => k === x || (x.length >= 4 && k.startsWith(x)) || (k.length >= 4 && x.startsWith(k))); });
  }
  const tagDoc = (exp, id) => { const d = exp.collections && exp.collections.filmTags && exp.collections.filmTags[id]; return d ? d.t || {} : {}; };

  // D3 averages from team summaries [{ eff, emo: { goals, chances } }] and the league film lines in lrMeta.
  function d3From(meta, summaries) {
    const L = meta.sb_league || {}, ok = summaries.filter(x => x.eff != null);
    let c = 0, gl = 0; summaries.forEach(x => { if (x.emo && x.emo.chances) { c += x.emo.chances; gl += x.emo.goals; } });
    if (!ok.length || !c) throw new Error('D3 averages need team summaries');
    return { eff: ok.reduce((a, x) => a + x.eff, 0) / ok.length, emo: gl / c, by_type: L.by_type, pick: L.pick, no_pick: L.no_pick, teams: ok.length };
  }

  // Everything the sheet needs. lr: { meta, teams: { id: record }, players: { id: [player records] } }.
  // opts: { season (default 2027), oppId, wlId (default 410), d3 (precomputed), games, use }
  function inputs(exp, cols, lr, opts) {
    const season = opts.season || 2027, wlId = opts.wlId || 410, meta = lr.meta || {}, lrSeason = meta.season || null;
    const wl = lr.teams[wlId], opp = lr.teams[opts.oppId];
    if (!wl || !opp) throw new Error('Team records not found on the tracker for ' + (!wl ? 'W&L' : 'that opponent'));
    const logs = ourLogs(exp, cols, season), current = lrSeason != null && lrSeason >= season;
    const notes = [];
    notes.push(current ? `Team records: ${lrSeason} LacrosseReference data (this season), full rosters.` : `Team records: ${lrSeason || 'older'} LacrosseReference data. ${opp.name} uses only returning players until ${season} data is imported.`);
    notes.push(`Our side: the tracker's ${season} roster (${logs.roster.length} players) and ${season} logs (${logs.shots.length} shots, ${logs.poss.length} no-shot possessions, ${logs.stints.length} lineup records).`);
    // Our logged games and scrimmages against them: the labels chosen on the page, else ones that match their name.
    const labels = opts.labels || autoLabels(logs, opp);
    const A = (exp.collections && exp.collections.app) || {};
    const faceoffs = Object.entries(A.faceoffs_live || {}).filter(([k]) => k.startsWith('fo_')).map(([, v]) => { try { const r = JSON.parse(v); return { date: r[1], context: r[2], opponent: r[3], jersey: r[4], won: r[5] === 1 }; } catch (e) { return null; } })
      .filter(f => f && seasonOf(f.date) === season);
    const logged = V3.update ? V3.update.fromLogs(logs.shots, logs.poss, faceoffs, labels) : null;
    if (logged && logged.sessions) notes.push(`Our ${season} logs against them (${labels.join(', ')}): ${logged.games} games, ${logged.scrimmages} scrimmages. These update their numbers.`);
    else notes.push(`No ${season} games or scrimmages against them logged yet${labels.length ? '' : ' (pick the label we used, if any)'}.`);
    const P = (lr.players && lr.players[opts.oppId]) || [], byId = Object.fromEntries(P.map(p => [p.id, p]));
    const dodgeShots = p => Object.entries(((p || {}).sb || {}).shots || {}).filter(([k]) => k.includes('dodge')).reduce((a, [, v]) => a + v, 0);
    const oppPlayers = (opp.roster || []).map(r => { const c = byId[r.player_ID]; return { j: String(r.jersey_number), name: r.player, cls: r.team_listed_class, sbGoals: ((c || {}).sb || {}).goals || {}, dodgeShots: dodgeShots(c) }; });
    const names = { wl: Object.fromEntries(logs.roster.filter(x => x.j).map(x => [x.j, x.n])), opp: Object.fromEntries((opp.roster || []).map(r => [String(r.jersey_number), r.player])) };
    return {
      wl, opp, d3: opts.d3, practice: { shots: logs.shots, poss: logs.poss, stints: logs.stints, roster: logs.roster }, oppPlayers, names,
      // Shot-location tags save the spot and zone; the shooter comes from the goal clip they were made on.
      tags: { pickDef: tagDoc(exp, 'pick_def_' + opp.id), pickOff: tagDoc(exp, 'pick_off_' + opp.id), legacyPick: tagDoc(exp, 'pick'),
        shotOff: (() => { const jOf = Object.fromEntries(((opp.sb || {}).goal_clips_off || []).map(c => [c[5], c[3] != null ? String(c[3]) : null])); return Object.fromEntries(Object.entries(tagDoc(exp, 'shot_off')).filter(([id]) => jOf[id]).map(([id, t]) => [id, Object.assign({}, t, { j: jOf[id] })])); })() },
      opts: { games: opts.games || 4000, use: opts.use || {}, oppReturning: !current }, sourceNotes: notes, season, lrSeason, logged, labels, opponentLabels: Object.keys(logs.opponents)
    };
  }
  V3.sources = { seasonOf, ourLogs, d3From, inputs };
})(globalThis);

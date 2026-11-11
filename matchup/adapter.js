// W&L Matchup Studio: versioned, read-only adapter from a tracker "Export All Data" file to counted evidence.
// Field names live here and nowhere else. Missing evidence stays null, never 0. Cohorts stay separate. Nothing is written back.
(function (g) {
  const MS = g.MS = g.MS || {};
  MS.ADAPTER_VERSION = 'tracker-export-v1';
  // Same rule as the tracker's seasonForDate: August onward counts as the next season, so fall 2026 is 2027.
  const seasonOf = d => { const [y, m] = d.split('-').map(Number); return String(m >= 8 ? y + 1 : y); };
  function columnsFromPage(src) {
    const get = n => { const m = new RegExp('const ' + n + '\\s*=\\s*\\[(.*?)\\]\\s*;', 's').exec(src); if (!m) throw new Error('columns not found: ' + n); return [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/"([^"]+)"/g)].map(x => x[1]); };
    return { shot: get('COLS'), poss: get('POSS_COLS') };
  }
  const zip = (cols, row) => Object.fromEntries(cols.map((c, i) => [c, row[i] === undefined ? null : row[i]]));
  const blank = () => ({ shotsWhereTurnoversLogged: 0, turnoverSessions: 0, shots: 0, sog: 0, goals: 0, pipe: 0, wide: 0, blocked: 0, turnovers: 0, turnoversNamed: 0, failedClears: 0, caused: 0, causedKnown: false, assistedGoals: 0, rebounds: 0 });
  const pl = () => ({ shots: 0, sog: 0, goals: 0, pipe: 0, wide: 0, blocked: 0, assists: 0, turnovers: 0, caused: 0 });
  function tallyShot(t, x) {
    t.shots++;
    switch (x.outcome) {
      case 'Goal': t.goals++; t.sog++; break;
      case 'Saved': t.sog++; break;
      case 'Pipe': t.pipe++; break;
      case 'Blocked': t.blocked++; break;
      case 'Miss': t.wide++; break;
      default: throw new Error('unknown shot outcome ' + x.outcome);
    }
  }
  function decode(exp, pageOrCols, season) {
    const cols = typeof pageOrCols === 'string' ? columnsFromPage(pageOrCols) : pageOrCols, A = exp.collections.app, S = exp.collections.sessions, track = A.session_tracking || {}, out = [];
    Object.keys(S).sort().forEach(sid => {
      const d = S[sid], date = d.date || sid.slice(0, 10); if (seasonOf(date) !== season) return;
      const rec = track['typ_' + sid] ? JSON.parse(track['typ_' + sid]) : null, trk = track['trk_' + sid] ? JSON.parse(track['trk_' + sid]) : null;
      const type = d.context === 'Game' ? 'game' : d.context === 'Practice' ? 'practice' : (rec && rec.type === 'Opponent scrimmage') || d.opponent ? 'opponent_scrimmage' : 'intra_squad';
      const shots = [], poss = [];
      Object.keys(d).forEach(k => { if (k.startsWith('s_')) shots.push(zip(cols.shot, JSON.parse(d[k]))); else if (k.startsWith('p_')) poss.push(zip(cols.poss, JSON.parse(d[k]))); });
      out.push({ sid, date, type, opponent: d.opponent || (rec && rec.opponent) || null, shots, poss, completeness: trk ? trk.cats : null });
    });
    const fo = Object.entries(A.faceoffs_live || {}).filter(([k]) => k.startsWith('fo_')).map(([k, v]) => { const r = JSON.parse(v); return { date: r[1], context: r[2], opponent: r[3], jersey: r[4], won: r[5] === 1 }; }).filter(f => seasonOf(f.date) === season);
    const roster = (A['roster_' + season] && A['roster_' + season].list) || [];
    return { season, adapter: MS.ADAPTER_VERSION, exportedAt: exp.exportedAt, sessions: out, faceoffs: fo, roster, positions: A['positions_' + season] ? JSON.parse(A['positions_' + season].json) : {}, plan: A.scrimPlan ? JSON.parse(A.scrimPlan.json) : null };
  }
  function cohort(sessions, rosterSet) {
    const team = blank(), opp = blank(), players = {}, goalies = {}, P = j => players[j] || (players[j] = pl());
    sessions.forEach(s => {
      // A session with shots but no no-shot records doesn't show zero turnovers. It's left out of every turnover denominator.
      [[team, x => x.team !== 'OPP'], [opp, x => x.team === 'OPP']].forEach(([t, mine]) => { if (s.poss.some(mine)) { t.turnoverSessions++; t.shotsWhereTurnoversLogged += s.shots.filter(mine).length; } });
      s.shots.forEach(x => {
        const isOpp = x.team === 'OPP', t = isOpp ? opp : team; tallyShot(t, x);
        if (x.rebound === 'Yes') t.rebounds++;
        if (x.outcome === 'Goal' && x.assistJersey) t.assistedGoals++;
        if (!isOpp && x.shooterJersey) { const p = P(x.shooterJersey); tallyShot(p, x); if (x.outcome === 'Goal' && x.assistJersey && x.assistJersey !== x.shooterJersey) P(x.assistJersey).assists++; }
        // A W&L goalie faced this shot: every practice shot, and opponent shots in scrimmages.
        if ((isOpp || s.type === 'practice') && x.goalieJersey && (x.outcome === 'Goal' || x.outcome === 'Saved')) { const G = goalies[x.goalieJersey] || (goalies[x.goalieJersey] = { saves: 0, goals: 0 }); if (x.outcome === 'Goal') G.goals++; else G.saves++; }
      });
      s.poss.forEach(p => {
        const isOpp = p.team === 'OPP', t = isOpp ? opp : team;
        if (p.end === 'Failed clear') t.failedClears++;
        if (p.end !== 'Turnover') return;
        t.turnovers++;
        if (p.turnoverBy) t.turnoversNamed++;
        if (!isOpp && p.turnoverBy) P(p.turnoverBy).turnovers++;
        if (p.causedBy) { t.caused++; const defenderIsOurs = isOpp || s.type === 'practice'; if (defenderIsOurs && rosterSet.has(String(p.causedBy))) P(String(p.causedBy)).caused++; }
      });
    });
    return { sessions: sessions.map(s => s.sid), team, opponent: opp, players, goalies };
  }
  function evidence(D) {
    const rosterSet = new Set(D.roster.map(r => r.jersey)), by = t => D.sessions.filter(s => s.type === t && (s.shots.length || s.poss.length));
    const scr = by('opponent_scrimmage'), byOpp = {}; scr.forEach(s => { const k = s.opponent || 'unnamed'; (byOpp[k] = byOpp[k] || []).push(s); });
    const F = f => { const att = f.length, won = f.filter(x => x.won).length, by = {}; f.forEach(x => { const r = by[x.jersey] || (by[x.jersey] = { won: 0, att: 0 }); r.att++; if (x.won) r.won++; }); return { att, won, by }; };
    const ev = { season: D.season, adapter: D.adapter, exportedAt: D.exportedAt,
      counts: { game: by('game').length, practice: by('practice').length, opponent_scrimmage: scr.length, intra_squad: by('intra_squad').length },
      practice: cohort(by('practice'), rosterSet), opponent_scrimmage: cohort(scr, rosterSet),
      scrimmages: Object.fromEntries(scr.map(s => [s.sid, Object.assign(cohort([s], rosterSet), { opponentName: s.opponent, completeness: s.completeness })])).valueOf(),
      byOpponent: Object.fromEntries(Object.entries(byOpp).map(([k, v]) => [k, cohort(v, rosterSet)])),
      faceoffs: { practice: F(D.faceoffs.filter(f => f.context === 'Practice')), byOpponent: Object.fromEntries([...new Set(D.faceoffs.filter(f => f.opponent).map(f => f.opponent))].map(o => [o, F(D.faceoffs.filter(f => f.opponent === o))])) },
      missing: { groundBalls: 'not tracked in this export', penalties: 'not logged', clock: 'quarter and clock blank on all records', clears: 'no field' } };
    return ev;
  }
  Object.assign(MS, { seasonOf, columnsFromPage, decode, evidence });
})(globalThis);

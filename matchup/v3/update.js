// W&L Matchup Studio, engine v3 (experimental): update an opponent from our own logged games against them.
// Starting point = their LacrosseReference record (2027 if imported, else 2026 with returning players). Our logged games and
// scrimmages against them (counted the same) pull their offense, defense, faceoffs, shooters and shot placement toward
// what we saw. Fixed weights, set before any 2027 games were logged; changing one is a model change.
(function (g) {
  const MS = g.MS = g.MS || {};
  const V3 = MS.V3 = MS.V3 || {};
  const odds = p => p / (1 - p), logit = p => Math.log(p / (1 - p)), unlogit = x => 1 / (1 + Math.exp(-x));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  // Prior weights: their record counts as this many possessions (draws for faceoffs). A record from another division is
  // rated against that division, so it gets less weight.
  const UK = Object.freeze({ level: 150, levelCross: 50, faceoff: 40, faceoffCross: 20, shooterMin: 30, placementMin: 5 });

  // Counts from our logged rows against one opponent. Possessions = shots that aren't rebounds + no-shot possessions.
  function fromLogs(shots, poss, faceoffs, labels) {
    const want = new Set((labels || []).map(String)), mine = r => r.opponent && want.has(String(r.opponent)) && r.context !== 'Practice';
    const S = shots.filter(mine), Pn = poss.filter(mine), side = t => {
      const s = S.filter(x => (t === 'opp') === (x.team === 'OPP')), p = Pn.filter(x => (t === 'opp') === (x.team === 'OPP'));
      const start = s.filter(x => x.rebound !== 'Yes');
      // Man-up for the team with the ball: W&L rows say Man-Up; their rows say Man-Down (from our side).
      const manUp = x => t === 'opp' ? x.manSituation === 'Man-Down' : x.manSituation === 'Man-Up';
      return { poss: start.length + p.filter(x => x.end === 'Turnover' || x.end === 'Failed clear').length, goals: s.filter(x => x.goal).length, shots: s.length,
        transition: { poss: start.filter(x => x.transition).length, goals: s.filter(x => x.transition && x.goal).length },
        manUp: { poss: start.filter(manUp).length, goals: s.filter(x => manUp(x) && x.goal).length }, rows: s };
    };
    const sessions = new Set(S.map(x => x.date + '|' + x.context).concat(Pn.map(x => x.date + '|' + x.context)));
    const fo = (faceoffs || []).filter(f => f.opponent && want.has(String(f.opponent)) && f.context !== 'Practice');
    return { labels: [...want], sessions: sessions.size, games: [...sessions].filter(k => k.endsWith('|Game')).length, scrimmages: [...sessions].filter(k => k.endsWith('|Scrimmage')).length,
      us: side('wl'), them: side('opp'), fo: { att: fo.length, won: fo.filter(f => f.won).length } };
  }
  // Observed rate against our level, put back on an average-opponent footing (log5 inverse), then blended with the prior.
  const blend = (prior, obsRate, n, ours, base, k) => {
    if (!n) return { value: prior, moved: 0 };
    const obs = clamp(odds(clamp(obsRate, 0.01, 0.95)) * odds(base) / odds(ours), 0.01, 20), obsP = obs / (1 + obs);
    const v = unlogit((k * logit(prior) + n * logit(obsP)) / (k + n)); return { value: v, moved: v - prior, observed: obsP };
  };
  // Returns a new opponent model plus what changed. O and W are V3.team() results.
  function applyLogs(O, W, L, d3, opts) {
    opts = opts || {};
    const k = opts.crossDivision ? UK.levelCross : UK.level, out = Object.assign({}, O), notes = [];
    if (!L || !L.sessions) return { team: O, notes: ['No 2027 games or scrimmages against them logged in the tracker yet.'], changed: false };
    if (L.sessions === 1) notes.push('Based on one logged session against them: treat their updated numbers as a first read.');
    const off = blend(O.adjOff, L.them.goals / Math.max(1, L.them.poss), L.them.poss, W.adjDef, d3.eff, k);
    const def = blend(O.adjDef, L.us.goals / Math.max(1, L.us.poss), L.us.poss, W.adjOff, d3.eff, k);
    out.adjOff = off.value; out.adjDef = def.value;
    notes.push(`From ${L.sessions} logged ${L.sessions === 1 ? 'session' : 'sessions'} against them (${L.games} games, ${L.scrimmages} scrimmages): their offense ${pct(O.adjOff)} → ${pct(off.value)} goals per possession on ${L.them.poss} possessions; their defense ${pct(O.adjDef)} → ${pct(def.value)} allowed on our ${L.us.poss}. Their record counts as ${k} possessions${opts.crossDivision ? ' (lower: it is rated against another division)' : ''}.`);
    // Shooters: once we've logged enough of their shots, who shoots and how well comes from our logs.
    const byJ = {}; L.them.rows.forEach(x => { if (!x.oppShooter) return; const v = byJ[x.oppShooter] || (byJ[x.oppShooter] = { shots: 0, goals: 0 }); v.shots++; if (x.goal) v.goals++; });
    const logged = Object.values(byJ).reduce((a, v) => a + v.shots, 0);
    if (logged >= UK.shooterMin) {
      const tf = Object.values(byJ).reduce((a, v) => a + v.goals, 0) / logged, nameOf = j => { const r = (O.shooters || []).find(s => s.j === String(j)); return r ? r.name : null; };
      out.shooters = Object.entries(byJ).map(([j, v]) => ({ j: String(j), name: nameOf(j), shots: v.shots, goals: v.goals, share: v.shots / logged, fin: (v.goals + V3.K.shooter * tf) / (v.shots + V3.K.shooter), fromLogs: true }));
      out.teamFin = tf;
      notes.push(`Their shooters: from ${logged} of their shots we logged (names matched by number to their record where it has one).`);
    } else notes.push(`Their shooters: from their record (${logged} of their shots logged; ${UK.shooterMin} needed to switch).`);
    // Where they shoot: their shots on our goalies, per shooter with 5+, the rest at their team mix.
    const zm = {}, team = {}; let tN = 0;
    L.them.rows.forEach(x => { if (x.goalX == null || !(x.goal || x.onKeeper || x.onGoal)) return; const z = V3.zoneOf(x.goalX, x.goalY); team[z] = (team[z] || 0) + 1; tN++; if (x.oppShooter) { const m = zm[x.oppShooter] || (zm[x.oppShooter] = {}); m[z] = (m[z] || 0) + 1; } });
    let placement = null;
    if (tN >= 10) {
      const norm = m => { const n = Object.values(m).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(m).map(([z, c]) => [z, c / n])); }, tm = norm(team);
      placement = { _team: tm }; Object.entries(zm).forEach(([j, m]) => { const n = Object.values(m).reduce((a, b) => a + b, 0); placement[j] = n >= UK.placementMin ? norm(m) : tm; });
      (out.shooters || []).forEach(s => { if (!placement[s.j]) placement[s.j] = tm; });
      notes.push(`Where they shoot: from ${tN} of their on-goal shots on our goalies.`);
    }
    // Faceoffs: our logged draws against them, blended into the matchup chance.
    const fk = opts.crossDivision ? UK.faceoffCross : UK.faceoff, foLogged = L.fo.att ? { att: L.fo.att, won: L.fo.won, k: fk } : null;
    if (foLogged) notes.push(`Faceoffs: ${L.fo.won} of ${L.fo.att} logged draws against them won (blended with the matchup estimate at ${fk} draws${opts.crossDivision ? ', lower for another division' : ''}).`);
    return { team: out, notes, placement, foLogged, changed: true, off, def, counts: L };
  }
  const pct = v => (100 * v).toFixed(1) + '%';
  V3.UK = UK; V3.update = { fromLogs, applyLogs };
})(globalThis);

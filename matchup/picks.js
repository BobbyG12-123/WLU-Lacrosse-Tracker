// W&L Matchup Studio: pick rates. Turns the Scouting page's pick tags (filmTags/pick_def_<team>, pick_off_<team>,
// and the older one-word filmTags/pick) into sim inputs, each with its counts, its prior and the formula used.
// Pure functions on plain objects. No database, no network. Experimental: nothing here is validated against games yet.
(function (g) {
  const MS = g.MS = g.MS || {};

  // Prior weights, in picks. Fixed when this file was written (Nov 9, 2026), before any result-tagged picks existed,
  // and never tuned on tagged data. Changing them is a model change and must be recorded as one.
  const PICK_K = Object.freeze({ team: 30, coverage: 20, mix: 10, result: 20, player: 15 });
  const PICK_COV = Object.freeze(['Switch', 'Fight over', 'Go under', 'Hedge & recover', 'Jump / double', 'Got beat (slip/roll)']);
  // Result keys as saved by the tagger, grouped the way the sim uses them.
  const PICK_RESULT_GROUP = Object.freeze({ goal_pick: 'goal', goal_later: 'goal', shot_saved: 'shot', shot_missed: 'shot', shot_blocked: 'shot',
    to_forced: 'to', to_unforced: 'to', penalty: 'other', slide: 'other', reset: 'other', broke: 'other', rescreen: 'other' });
  // Same thresholds as the game-week coverage report.
  const trust = n => n >= 100 ? 'solid' : n >= 30 ? 'usable' : 'thin';
  const shrink = (k, n, prior, w) => (k + w * prior) / (n + w);
  const row = (value, k, n, prior, w, priorName) => ({ value, k, n, prior, w, trust: trust(n), formula: `(${k} + ${w} × ${round(prior)}) / (${n} + ${w})`, priorName });
  const round = x => Math.round(x * 1000) / 1000;

  // One record per clip that carries a tag: coverage and/or result. A tag with neither (cleared on the page) is ignored.
  // clip: [sb, video, film, possessionScored, typ, id, offenseTeam] as in lrTeams sb.pick_clips_def / pick_clips_off.
  function pickRecords(side, teamId, clips, tags, legacy) {
    const out = [];
    for (const c of clips || []) {
      const id = c[5], t = (tags || {})[id];
      const hasNew = t && (t.cov || t.res);
      const old = side === 'def' && !hasNew && legacy && legacy[id] ? legacy[id] : null;
      if (!hasNew && !old) continue;
      const grp = hasNew && t.res ? PICK_RESULT_GROUP[t.res] || null : null;
      out.push({ id, cov: hasNew ? t.cov || null : old, res: hasNew ? t.res || null : null, grp,
        // Goals are always known: from the tagged result when there is one, otherwise from whether the possession scored.
        goal: grp ? grp === 'goal' : !!c[3], resultTagged: !!grp, legacy: !!old,
        oT: hasNew && t.oT != null ? t.oT : side === 'def' ? c[6] : teamId, dT: hasNew && t.dT != null ? t.dT : side === 'def' ? teamId : null,
        scr: hasNew ? t.scr ?? null : null, usr: hasNew ? t.usr ?? null : null, sd: hasNew ? t.sd ?? null : null, ud: hasNew ? t.ud ?? null : null,
        call: hasNew ? t.call ?? null : null, cj: hasNew ? t.cj ?? null : null, cT: hasNew ? t.cT ?? null : null,
        lat: hasNew ? t.lat ?? null : null, dist: hasNew ? t.dist ?? null : null });
    }
    return out;
  }

  // Rates for one team and one side.
  // side 'def': picks run against the team (how they defend picks). side 'off': the team's own picks.
  // teamPick: the team's film-tag pick line for that side, { n, goal_pct } (every pick possession, not only staff-tagged ones).
  // d3Pick: the D3 pick line, { n, goal_pct }. leagueMix: optional coverage counts pooled over every tagged team.
  function pickRates({ side, teamId, clips, tags, legacy, teamPick, d3Pick, leagueMix, leagueResults }) {
    if (side !== 'def' && side !== 'off') throw new Error('side must be def or off');
    const K = PICK_K, recs = pickRecords(side, teamId, clips, tags, legacy);
    const d3 = d3Pick && d3Pick.goal_pct != null ? d3Pick.goal_pct : null;
    if (d3 == null) throw new Error('D3 pick rate is required');
    // 1. Team goals per pick possession, from every film-tagged pick possession, pulled toward D3.
    const tn = teamPick && teamPick.n ? teamPick.n : 0, tg = tn ? Math.round(teamPick.goal_pct * tn) : 0;
    const team = row(shrink(tg, tn, d3, K.team), tg, tn, d3, K.team, 'D3 pick possessions');
    // 2. Coverage mix, pulled toward the pooled league mix (or an even split over the coverages seen, when none is given).
    const covRecs = recs.filter(r => r.cov), N = covRecs.length;
    const cnt = {}; covRecs.forEach(r => { cnt[r.cov] = (cnt[r.cov] || 0) + 1; });
    const lm = leagueMix && Object.values(leagueMix).reduce((a, b) => a + b, 0) > 0 ? leagueMix : null;
    // No coverage tags for this team: no split at all (never borrow another team's mix as if it were theirs).
    const names = N ? [...new Set([...PICK_COV.filter(c => cnt[c] || (lm && lm[c])), ...Object.keys(cnt)])] : [];
    const lmTot = lm ? names.reduce((a, c) => a + (lm[c] || 0), 0) : 0;
    const priorShare = c => lm && lmTot ? (lm[c] || 0) / lmTot : 1 / Math.max(1, names.length);
    // 3. Results by coverage. Goal rate per pick shrinks toward the team rate; shots and turnovers toward the team's own
    //    tagged results, which shrink toward the league's tagged results when given (else stay raw, marked thin).
    const resRecs = recs.filter(r => r.resultTagged), nR = resRecs.length;
    const lr = leagueResults && leagueResults.n ? leagueResults : null;
    const teamRes = k => { const c = resRecs.filter(r => r.grp === k).length; if (lr) return row(shrink(c, nR, lr[k] / lr.n, K.result), c, nR, lr[k] / lr.n, K.result, 'league tagged results');
      return { value: nR ? c / nR : null, k: c, n: nR, prior: null, w: 0, trust: trust(nR), formula: nR ? `${c} / ${nR}` : 'no results tagged', priorName: null }; };
    const teamShot = teamRes('shot'), teamTo = teamRes('to');
    const coverage = names.map(c => {
      const rs = covRecs.filter(r => r.cov === c), n = rs.length, gk = rs.filter(r => r.goal).length;
      const rr = rs.filter(r => r.resultTagged), nr = rr.length;
      const sub = (k, base) => base.value == null ? { value: null, k: 0, n: nr, trust: trust(nr), formula: 'no results tagged' } : row(shrink(rr.filter(r => r.grp === k).length, nr, base.value, K.result), rr.filter(r => r.grp === k).length, nr, base.value, K.result, 'team tagged results');
      return { coverage: c, n, share: row(shrink(n, N, priorShare(c), K.mix), n, N, priorShare(c), K.mix, lm ? 'league coverage mix' : 'even split'),
        goal: row(shrink(gk, n, team.value, K.coverage), gk, n, team.value, K.coverage, 'team pick rate'), shot: sub('shot', teamShot), to: sub('to', teamTo) };
    });
    const shareSum = coverage.reduce((a, c) => a + c.share.value, 0);
    coverage.forEach(c => { c.share.value /= shareSum || 1; });
    // 4. Players: judged on goals off the pick only (a goal later in the possession isn't theirs), over picks with a tagged
    //    result. Expected = the team's goal-off-pick rate for the coverage played (pulled toward the team's overall rate).
    const slots = side === 'def' ? ['sd', 'ud'] : ['scr', 'usr'];
    const own = r => side === 'def' ? r.dT === teamId : r.oT === teamId;
    const offPick = r => r.res === 'goal_pick';
    const teamGP = nR ? resRecs.filter(offPick).length / nR : null;
    const covGP = {}; if (teamGP != null) names.forEach(c => { const rr = resRecs.filter(r => r.cov === c); covGP[c] = (rr.filter(offPick).length + K.result * teamGP) / (rr.length + K.result); });
    const P = new Map(); const get = j => P.get(j) || (P.set(j, { jersey: j, all: 0, n: 0, goals: 0, later: 0, expected: 0, roles: {}, fault: 0, credit: 0 }), P.get(j));
    for (const r of recs) {
      if (own(r)) for (const s of slots) { const j = r[s]; if (j == null || j === '') continue; const v = get(String(j)); v.all++; v.roles[s] = (v.roles[s] || 0) + 1;
        if (r.resultTagged) { v.n++; if (offPick(r)) v.goals++; if (r.res === 'goal_later') v.later++; v.expected += r.cov && covGP[r.cov] != null ? covGP[r.cov] : teamGP; } }
      if (r.call && r.cj != null && r.cj !== 'team' && r.cT === teamId) get(String(r.cj))[r.call === 'fault' ? 'fault' : 'credit']++;
    }
    const players = [...P.values()].map(v => {
      const exp = v.n ? v.expected / v.n : teamGP;
      const rate = exp == null ? null : row(shrink(v.goals, v.n, exp, K.player), v.goals, v.n, exp, K.player, 'team goal-off-pick rate for the coverages played');
      // diff < 0 on defense = fewer goals off the pick than expected (better); on offense, diff > 0 is better.
      return { jersey: v.jersey, all: v.all, n: v.n, goals: v.goals, later: v.later, expected: exp == null ? null : round(exp), rate, diff: rate ? round(rate.value - exp) : null, roles: v.roles, fault: v.fault, credit: v.credit, used: v.n >= 10 };
    }).sort((a, b) => b.n - a.n || b.all - a.all || String(a.jersey).localeCompare(String(b.jersey)));
    return { side, teamId, k: K, d3: d3Pick, team, tagged: recs.length, coverageTagged: N, resultTagged: nR, legacyTags: recs.filter(r => r.legacy).length,
      mixPrior: lm ? 'league coverage mix' : 'even split over coverages seen', coverage, teamShot, teamTo, players,
      enough: { coverage: N >= 15, results: nR >= 15 } };
  }

  // Pooled league inputs from every team's tags: coverage counts and result counts.
  function leaguePools(list) {
    const mix = {}, res = { n: 0, goal: 0, shot: 0, to: 0, other: 0 };
    for (const x of list) for (const r of pickRecords(x.side, x.teamId, x.clips, x.tags, x.legacy)) {
      if (r.cov) mix[r.cov] = (mix[r.cov] || 0) + 1;
      if (r.resultTagged) { res.n++; res[r.grp]++; }
    }
    return { mix, results: res };
  }

  // Our picks against their pick defense. off = our pickRates('off'), def = their pickRates('def').
  // Each coverage combines our rate against it with theirs when playing it, on the odds scale relative to D3
  // (log5): equal to D3 when both are at D3. The total weights coverages by their mix.
  const odds = p => p / (1 - p), prob = o => o / (1 + o);
  const log5 = (a, b, base) => prob(odds(a) * odds(b) / odds(base));
  function pickMatchup(off, def) {
    const d3 = def.d3.goal_pct;
    const offTeam = off.team.value, defTeam = def.team.value;
    // Below 15 coverage tags for the defense, its split isn't used: team rates only.
    if (def.enough && def.enough.coverage === false) return { d3, overall: log5(offTeam, defTeam, d3), teamOnly: log5(offTeam, defTeam, d3), rows: [], note: `Only ${def.coverageTagged || 0} coverage tags for this defense (15 needed): team rates only.` };
    const offBy = Object.fromEntries((off.coverage || []).map(c => [c.coverage, c]));
    const rows = def.coverage.map(c => {
      const o = offBy[c.coverage]; const offRate = o ? o.goal.value : offTeam;
      return { coverage: c.coverage, share: c.share.value, theirN: c.n, ourN: o ? o.n : 0, ourRate: offRate, theirRate: c.goal.value, expected: log5(offRate, c.goal.value, d3) };
    });
    const overall = rows.length ? rows.reduce((a, r) => a + r.share * r.expected, 0) : log5(offTeam, defTeam, d3);
    return { d3, overall, teamOnly: log5(offTeam, defTeam, d3), rows, note: rows.length ? null : 'No coverage tags for them yet: team rates only.' };
  }

  MS.PICK_K = PICK_K; MS.PICK_COV = PICK_COV; MS.PICK_RESULT_GROUP = PICK_RESULT_GROUP;
  MS.pickRecords = pickRecords; MS.pickRates = pickRates; MS.pickLeaguePools = leaguePools; MS.pickMatchup = pickMatchup; MS.pickLog5 = log5;
})(globalThis);

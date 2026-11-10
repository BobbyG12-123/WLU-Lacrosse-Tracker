// W&L Matchup Studio, engine v3 (experimental): the model builder.
// Turns plain records (LacrosseReference team docs as stored on the tracker, the tracker's own logs and staff tags)
// into game parameters. Pure functions, no database, no network. Nothing here is validated against games yet;
// the first test is 2027 games. v1 and v2 are untouched.
(function (g) {
  const MS = g.MS = g.MS || {};
  const V3 = MS.V3 = MS.V3 || {};
  const odds = p => p / (1 - p), prob = o => o / (1 + o), logit = p => Math.log(p / (1 - p)), unlogit = x => 1 / (1 + Math.exp(-x));
  const log5 = (a, b, base) => prob(odds(a) * odds(b) / odds(base));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const TYPES = ['transition', 'early', 'settled'];
  const ZONES = ['High Left', 'High Center', 'High Right', 'Mid Left', 'Mid Center', 'Mid Right', 'Low Left', 'Low Center', 'Low Right'];
  // Fixed prior weights (Nov 10, 2026), not tuned on games. Changing one is a model change.
  const K = Object.freeze({ shooter: 30, goalieZone: 8, fogo: 20, defender: 10, pair: 10, group: 40 });
  const film = bt => TYPES.reduce((a, t) => a + bt[t].n * bt[t].goal_pct, 0) / TYPES.reduce((a, t) => a + bt[t].n, 0);
  const share = (bt, t) => bt[t].n / TYPES.reduce((a, x) => a + bt[x].n, 0);
  const graduating = cls => /^(SR|GR|5TH|5Y)/i.test(String(cls || ''));

  // One team's inputs from its LacrosseReference record. opts.returning drops players listed SR/GR (for next season).
  // opts.names: the names on a real next-season roster (matched by name, since jersey numbers get reassigned), which wins
  // over opts.returning. opts.roster: jerseys to keep (same season only). opts.d3eff: the D3 average, needed when players leave.
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  function team(T, opts) {
    opts = opts || {};
    const names = opts.names ? new Set(opts.names.map(norm)) : null;
    const keep = r => names ? names.has(norm(r.player)) : opts.roster ? opts.roster.map(String).includes(String(r.jersey_number)) : opts.returning ? !graduating(r.team_listed_class) : true;
    const roster = (T.roster || []).filter(keep);
    const sb = T.sb, st = T.stats, ev = T.ev;
    if (!sb || !sb.off || !sb.def) throw new Error(`${T.name}: no film-tag data (sb) to build from`);
    const shotsTot = roster.reduce((a, r) => a + (r.shots || 0), 0);
    const teamFin = roster.reduce((a, r) => a + (r.goals || 0), 0) / Math.max(1, shotsTot);
    const shooters = roster.filter(r => (r.shots || 0) > 0).map(r => ({ j: String(r.jersey_number), name: r.player, cls: r.team_listed_class, shots: r.shots, goals: r.goals || 0,
      share: r.shots / shotsTot, fin: ((r.goals || 0) + K.shooter * teamFin) / (r.shots + K.shooter) }));
    const gk = roster.filter(r => (r.sog_faced || 0) > 0).map(r => ({ j: String(r.jersey_number), name: r.player, cls: r.team_listed_class, faced: r.sog_faced, save: r.save_pct }));
    const gkTot = gk.reduce((a, x) => a + x.faced, 0); gk.forEach(x => { x.share = x.faced / Math.max(1, gkTot); });
    // Returning value: share of the team's positive offensive / defensive EGA still on the roster. The share that left is
    // pulled to the D3 average (incoming players are unknown), on the log-odds scale. Full roster = 1, no change.
    const ega = (rs, k) => rs.reduce((a, r) => a + Math.max(0, r[k] || 0), 0);
    const retOff = ega(T.roster || [], 'offensive_EGA') ? ega(roster, 'offensive_EGA') / ega(T.roster, 'offensive_EGA') : 1;
    const retDef = ega(T.roster || [], 'defensive_EGA') ? ega(roster, 'defensive_EGA') / ega(T.roster, 'defensive_EGA') : 1;
    const toward = (v, ret) => ret >= 0.999 || !opts.d3eff ? v : unlogit(logit(opts.d3eff) + ret * (logit(v) - logit(opts.d3eff)));
    if ((retOff < 0.999 || retDef < 0.999) && !opts.d3eff) throw new Error(`${T.name}: players removed, so opts.d3eff (the D3 average) is required`);
    return {
      id: T.id, name: T.name, season: opts.season || null, rosterNote: names ? 'next-season roster (matched by name)' : opts.roster ? 'given roster' : opts.returning ? 'returning players (SR/GR removed)' : 'full listed roster',
      retOff, retDef, adjOff2026: st.adjusted_off_efficiency, adjDef2026: st.adjusted_def_efficiency,
      removed: (T.roster || []).filter(r => !keep(r) && ((r.shots || 0) > 0 || (r.sog_faced || 0) > 0 || (r.faceoffs_taken || 0) > 0)).map(r => ({ j: String(r.jersey_number), name: r.player, cls: r.team_listed_class })),
      poss: ev.poss.per_game, len: ev.poss.off_len, pens: ev.pens_pg, emo: ev.emo, mdd: ev.mdd, clear: st.clear_rate,
      adjOff: toward(st.adjusted_off_efficiency, retOff), adjDef: toward(st.adjusted_def_efficiency, retDef), foSeason: st.adjusted_true_faceoff_win_rate,
      off: sb.off, def: sb.def, shooters, goalies: gk, teamFin,
      fogos: (sb.fo_by_man || []).filter(([j]) => !opts.roster && !opts.returning ? true : roster.some(r => String(r.jersey_number) === String(j)) || !(T.roster || []).some(r => String(r.jersey_number) === String(j)))
        .map(([j, name, w, l, vs]) => ({ j: String(j), name: name || null, w, l, vs }))
    };
  }

  // Faceoffs: each pair from head-to-head first, then FOGOs both have faced (half weight), then season records (weight 20).
  function foPair(o, t, oTeam, tTeam) {
    const rate = m => (m.w + 1) / (m.w + m.l + 2);
    const p0 = rate(o) * (1 - rate(t)) / (rate(o) * (1 - rate(t)) + rate(t) * (1 - rate(o)));
    const a = o.vs.find(v => v[1] === tTeam && v[0] === t.name), b = t.vs.find(v => v[1] === oTeam && v[0] === '#' + o.j);
    const dir = a && b ? (a[2] + a[3] >= b[2] + b[3] ? [a[2], a[3]] : [b[3], b[2]]) : a ? [a[2], a[3]] : b ? [b[3], b[2]] : null;
    const ind = [];
    o.vs.forEach(v => { if (v[1] === tTeam || v[1] === oTeam) return; const u = t.vs.find(x => x[0] === v[0] && x[1] === v[1]); if (!u) return;
      const po = (v[2] + 1) / (v[2] + v[3] + 2), pt = (u[2] + 1) / (u[2] + u[3] + 2); ind.push({ via: v[0], team: v[1], p: unlogit(logit(po) - logit(pt)), w: 0.5 * Math.min(v[2] + v[3], u[2] + u[3]) }); });
    let num = K.fogo * logit(p0), den = K.fogo;
    if (dir) { const n = dir[0] + dir[1]; num += n * logit((dir[0] + 0.5) / (n + 1)); den += n; }
    ind.forEach(x => { num += x.w * logit(x.p); den += x.w; });
    return { p: unlogit(num / den), p0, dir, ind };
  }
  // usage: optional { ours: { jersey: share }, theirs: { jersey: share } }; default ours = most-used man, theirs = their film usage.
  function faceoffs(A, B, usage) {
    usage = usage || {};
    if (!A.fogos.length || !B.fogos.length) {
      const a = A.foSeason, b = B.foSeason; return { p: a * (1 - b) / (a * (1 - b) + b * (1 - a)), M: [], note: 'no FOGO film data: team season rates' };
    }
    const M = A.fogos.map(o => B.fogos.map(t => foPair(o, t, A.id, B.id)));
    const tShare = usage.theirs ? B.fogos.map(t => usage.theirs[t.j] || 0) : B.fogos.map(t => t.w + t.l);
    const tTot = tShare.reduce((a, b) => a + b, 0) || 1;
    const main = A.fogos.reduce((bi, o, i) => (o.w + o.l > A.fogos[bi].w + A.fogos[bi].l ? i : bi), 0);
    const oShare = usage.ours ? A.fogos.map(o => usage.ours[o.j] || 0) : A.fogos.map((o, i) => i === main ? 1 : 0);
    const oTot = oShare.reduce((a, b) => a + b, 0) || 1;
    let p = 0; M.forEach((row, i) => row.forEach((c, j) => { p += (oShare[i] / oTot) * (tShare[j] / tTot) * c.p; }));
    return { p, M, main, oShare: oShare.map(x => x / oTot), tShare: tShare.map(x => x / tTot) };
  }

  // Goalie save by zone from logged shots { goalieJersey, goalX, goalY, goal, onKeeper, onGoal }.
  const zoneOf = (gx, gy) => { const col = Math.min(2, Math.floor(gx * 3)), row = 2 - Math.min(2, Math.floor(gy * 3)); return ZONES[row * 3 + col]; };
  function goalieZones(shots) {
    const by = {};
    (shots || []).filter(s => s.goalieJersey && s.goalX != null && (s.goal || s.onKeeper || s.onGoal)).forEach(s => {
      const v = by[s.goalieJersey] || (by[s.goalieJersey] = { j: String(s.goalieJersey), n: 0, sv: 0, z: {} }); const z = zoneOf(s.goalX, s.goalY); const c = v.z[z] || (v.z[z] = [0, 0]);
      c[1]++; v.n++; if (!s.goal) { c[0]++; v.sv++; } });
    Object.values(by).forEach(v => { v.base = v.sv / v.n; v.zr = Object.fromEntries(ZONES.map(z => { const c = v.z[z] || [0, 0]; return [z, (c[0] + K.goalieZone * v.base) / (c[1] + K.goalieZone)]; })); });
    return by;
  }
  const EVEN_MIX = Object.fromEntries(ZONES.map(z => [z, 1 / 9]));
  // Save rate of a goalie against a shot mix { zone: share }.
  const saveVs = (gz, mix) => ZONES.reduce((a, z) => a + (mix[z] || 0) * gz.zr[z], 0);

  // Game parameters for attack A against defense B. ctx: { d3, picks (pickMatchup result or null), placement: { jersey: mix },
  // goalieZones (for B's goalies), goalie: B's goalie jersey in net, fo }.
  function side(A, B, ctx) {
    const d3 = ctx.d3, kA = odds(A.adjOff) / odds(film(A.off.by_type)), kB = odds(B.adjDef) / odds(film(B.def.by_type)), kD = odds(d3.eff) / odds(film(d3.by_type));
    const adj = (p, k) => prob(odds(p) * k);
    const P = { shares: {}, rate: {} };
    TYPES.forEach(t => { P.shares[t] = (share(A.off.by_type, t) + share(B.def.by_type, t)) / 2; const base = adj(d3.by_type[t].goal_pct, kD); P.rate[t] = log5(adj(A.off.by_type[t].goal_pct, kA), adj(B.def.by_type[t].goal_pct, kB), base); });
    const pickBase = adj(d3.pick.goal_pct, kD), noPickBase = adj(d3.no_pick.goal_pct, kD);
    P.pickShare = (A.off.pick.n / A.off.by_type.settled.n + B.def.pick.n / B.def.by_type.settled.n) / 2;
    P.pickRate = log5(adj(A.off.pick.goal_pct, kA), adj(B.def.pick.goal_pct, kB), pickBase);
    P.cov = ctx.picks && ctx.picks.rows && ctx.picks.rows.length ? ctx.picks.rows.map(r => ({ name: r.coverage, share: r.share, rate: log5(adj(r.ourRate, kA), adj(r.theirRate, kB), pickBase) })) : null;
    P.noPickRate = log5(adj(A.off.no_pick_settled.goal_pct, kA), adj(B.def.no_pick_settled.goal_pct, kB), noPickBase);
    P.emoChance = B.pens / B.poss;
    P.emoRate = log5(A.emo.goals / A.emo.chances, B.mdd.goals_allowed / B.mdd.chances, d3.emo);
    P.clear = A.clear;
    P.len = A.len * ctx.dead;
    // Shooters: usage from shots, finishing relative to the team, normalized so the team level stays calibrated.
    const sh = A.shooters.length ? A.shooters : [{ j: '?', name: 'team', share: 1, fin: A.teamFin || 0.3 }];
    const tot = sh.reduce((a, s) => a + s.share, 0);
    let mean = 0; sh.forEach(s => { s.m = odds(s.fin) / odds(A.teamFin || s.fin); mean += s.share / tot * s.m; });
    P.shooters = sh.map(s => ({ j: s.j, name: s.name, share: s.share / tot, m: s.m / mean }));
    // Goalie in net for B, against each shooter's placement. Relative to B's usual goalie mix, so the team level stays calibrated.
    const gz = ctx.goalieZones || {}, inNet = ctx.goalie && gz[ctx.goalie] ? gz[ctx.goalie] : null;
    // Reference = the defense's usual goalies that have zone logs; if none match (jersey numbers change between seasons),
    // the logged goalie pool itself, weighted by shots faced.
    let ref = B.goalies.filter(x => gz[x.j]);
    if (!ref.length) { const pool = Object.values(gz).filter(x => x.n >= 30), tot = pool.reduce((a, x) => a + x.n, 0); ref = pool.map(x => ({ j: x.j, share: x.n / tot })); }
    P.goalie = inNet ? inNet.j : (B.goalies[0] && B.goalies[0].j) || null;
    P.shooters.forEach(s => {
      const mix = (ctx.placement && ctx.placement[s.j]) || EVEN_MIX;
      if (inNet && ref.length) { const refSave = ref.reduce((a, x) => a + x.share * saveVs(gz[x.j], mix), 0) / ref.reduce((a, x) => a + x.share, 0); s.g = odds(refSave) / odds(saveVs(inNet, mix)); }
      else s.g = 1;
    });
    return P;
  }
  // Whole-game parameters. ctx.dead: dead-time factor so each team averages its real possessions per game.
  function matchup(W, O, ctx) {
    const dead = 3600 / (((W.poss + O.poss) / 2) * (W.len + O.len));
    const fo = faceoffs(W, O, ctx.foUsage);
    return { fo: fo.p, foModel: fo, t: [side(W, O, Object.assign({}, ctx.wl || {}, { d3: ctx.d3, dead })), side(O, W, Object.assign({}, ctx.opp || {}, { d3: ctx.d3, dead }))], teams: [W, O], k: K };
  }

  V3.K = K; V3.ZONES = ZONES; V3.TYPES = TYPES; V3.team = team; V3.faceoffs = faceoffs; V3.foPair = foPair; V3.goalieZones = goalieZones; V3.saveVs = saveVs; V3.zoneOf = zoneOf;
  V3.side = side; V3.matchup = matchup; V3.log5 = log5; V3.odds = odds; V3.prob = prob; V3.graduating = graduating; V3.clamp = clamp;
})(globalThis);

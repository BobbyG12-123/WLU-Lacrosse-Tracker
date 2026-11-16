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
  // Prior weights. Nov 16, 2026: shooter, fogo and goalie fitted on the 2026 D3 player records already on the tracker
  // (docs/BACKTEST_V3.md, "Trust weights"); poolZone and goalieZone from our logged shots on our goalies. The rest are
  // still the fixed Nov 10 weights (not enough data to fit). Changing one is a model change.
  //  shooter 80: last season's finishing predicts this season's best at ~80 shots (was 30).
  //  fogo 85: same test for faceoff men, ~85 draws (was 20).
  //  goalie 150: a goalie's overall save rate is pulled toward the pool with ~150 shots on goal (was not pulled at all).
  //  poolZone 8: zone pattern shared by all goalies (low corners go in more).
  //  goalieZone 100: one goalie's own zone pattern beyond the shared one; none was detectable in our logs (split-half
  //    correlation about -0.06), so it stays near zero until a goalie has a lot of shots in a zone (was 8).
  const K = Object.freeze({ shooter: 80, goalie: 150, poolZone: 8, goalieZone: 100, fogo: 85, defender: 10, pair: 10, group: 40, film: 30, emo: 20 });
  // Calibration (docs/BACKTEST_V3.md), chosen on 2026 D3 games before Apr 1 and scored once on the rest:
  //  lam: a same-season record's level is pulled toward the D3 average with this many possessions;
  //  priorInfo: a record from last season counts as this many possessions this season (the same weight our logs use, UK.level);
  //  form: per-team, per-game SD on the log-odds of scoring; pace: per-game SD on the log of possession length;
  //  home / homeFo: home edge on the log-odds of scoring and of the faceoff chance.
  const CAL = Object.freeze({ lam: 5, priorInfo: 150, form: 0, pace: 0.095, home: 0.044, homeFo: 0.049 }); // chosen Nov 16 (joint rule, development games); priorInfo is an assumption
  const film = bt => TYPES.reduce((a, t) => a + bt[t].n * bt[t].goal_pct, 0) / TYPES.reduce((a, t) => a + bt[t].n, 0);
  const share = (bt, t) => { const tot = TYPES.reduce((a, x) => a + (bt[x].n || 0), 0); return tot ? (bt[t].n || 0) / tot : 1 / TYPES.length; };
  // Film-tag rates are small samples: each is pulled toward the D3 rate for that kind (weight 30) before use.
  const shr = (x, d3x) => ((x.n || 0) * (x.goal_pct || 0) + K.film * d3x) / ((x.n || 0) + K.film);
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
    let sb = T.sb, noFilm = false; const st = T.stats, ev = T.ev;
    if (!sb || !sb.off || !sb.def) {
      // No film-tag data: possession types take the D3 shape (with the D3 counts as weight, so they stay at D3), and the
      // team's own adjusted efficiency sets the level. Labeled so the sheet can say so.
      if (!opts.d3) throw new Error(`${T.name}: no film-tag data (sb) to build from`);
      const dd = opts.d3, sideOf = () => ({ by_type: JSON.parse(JSON.stringify(dd.by_type)), pick: { n: dd.pick.n, goal_pct: dd.pick.goal_pct }, no_pick_settled: { n: dd.no_pick.n, goal_pct: dd.no_pick.goal_pct } });
      sb = Object.assign({ fo_by_man: [] }, T.sb || {}, { off: sideOf(), def: sideOf() }); noFilm = true;
    }
    if (!ev || !ev.poss || !ev.emo || !ev.mdd) throw new Error(`${T.name}: no game-event summary (ev) to build from`);
    const shotsTot = roster.reduce((a, r) => a + (r.shots || 0), 0);
    const teamFin = roster.reduce((a, r) => a + (r.goals || 0), 0) / Math.max(1, shotsTot);
    const shooters = roster.filter(r => (r.shots || 0) > 0).map(r => ({ j: String(r.jersey_number), name: r.player, cls: r.team_listed_class, shots: r.shots, goals: r.goals || 0,
      share: r.shots / shotsTot, fin: teamFin > 0 ? ((r.goals || 0) + K.shooter * teamFin) / (r.shots + K.shooter) : null }));
    const gk = roster.filter(r => (r.sog_faced || 0) > 0).map(r => ({ j: String(r.jersey_number), name: r.player, cls: r.team_listed_class, faced: r.sog_faced, save: r.save_pct }));
    const gkTot = gk.reduce((a, x) => a + x.faced, 0); gk.forEach(x => { x.share = x.faced / Math.max(1, gkTot); });
    // Returning value: share of the team's positive offensive / defensive EGA still on the roster. The share that left is
    // pulled to the D3 average (incoming players are unknown), on the log-odds scale. Full roster = 1, no change.
    const ega = (rs, k) => rs.reduce((a, r) => a + Math.max(0, r[k] || 0), 0);
    const retOff = ega(T.roster || [], 'offensive_EGA') ? ega(roster, 'offensive_EGA') / ega(T.roster, 'offensive_EGA') : 1;
    const retDef = ega(T.roster || [], 'defensive_EGA') ? ega(roster, 'defensive_EGA') / ega(T.roster, 'defensive_EGA') : 1;
    const toward = (v, ret) => ret >= 0.999 || !opts.d3eff ? v : unlogit(logit(opts.d3eff) + ret * (logit(v) - logit(opts.d3eff)));
    if ((retOff < 0.999 || retDef < 0.999) && !opts.d3eff) throw new Error(`${T.name}: players removed, so opts.d3eff (the D3 average) is required`);
    // How much the record is worth, in possessions: a same-season record is its own possessions, pulled toward D3 with CAL.lam;
    // last season's record counts as CAL.priorInfo (teams change). The level's uncertainty is 1 / sqrt(p(1 - p) * info).
    const nPoss = (ev.poss.per_game || 0) * ((ev && ev.n_games) || (sb && sb.n_games) || st.games_played || 0);
    const info = opts.priorSeason || !(nPoss > 0) ? CAL.priorInfo : nPoss + CAL.lam; // unknown sample: treated like last season's record
    const pull = v => opts.priorSeason || !opts.d3eff || !(nPoss > 0) || !(v > 0 && v < 1) ? v : unlogit(logit(opts.d3eff) + (nPoss / (nPoss + CAL.lam)) * (logit(v) - logit(opts.d3eff)));
    const unc = v => v > 0 && v < 1 ? 1 / Math.sqrt(v * (1 - v) * info) : 0;
    return {
      id: T.id, name: T.name, lg: T.lg || null, noFilm, season: opts.season || null, rosterNote: names ? 'next-season roster (matched by name)' : opts.roster ? 'given roster' : opts.returning ? 'returning players (SR/GR removed)' : 'full listed roster',
      retOff, retDef, adjOff2026: st.adjusted_off_efficiency, adjDef2026: st.adjusted_def_efficiency,
      removed: (T.roster || []).filter(r => !keep(r) && ((r.shots || 0) > 0 || (r.sog_faced || 0) > 0 || (r.faceoffs_taken || 0) > 0)).map(r => ({ j: String(r.jersey_number), name: r.player, cls: r.team_listed_class })),
      poss: ev.poss.per_game, len: ev.poss.off_len, pens: ev.pens_pg, emo: ev.emo, mdd: ev.mdd, clear: st.clear_rate,
      adjOff: toward(pull(st.adjusted_off_efficiency), retOff), adjDef: toward(pull(st.adjusted_def_efficiency), retDef), foSeason: st.adjusted_true_faceoff_win_rate,
      info, unc: { off: unc(st.adjusted_off_efficiency), def: unc(st.adjusted_def_efficiency) },
      off: sb.off, def: sb.def, shooters, goalies: gk, teamFin,
      // Faceoff men follow the same rule as everyone else: the roster row with that jersey this season, or the FOGO's own name.
      // A FOGO with no name and no roster row at that number (rosters list numbers inconsistently) is kept: we can't tell
      // he left. If the next-season roster has someone at that number, he's labeled with that name, marked as a number match.
      fogos: (sb.fo_by_man || []).filter(([j, name]) => { const row = (T.roster || []).find(r => String(r.jersey_number) === String(j));
          if (row) return keep(row); if (names && name) return names.has(norm(name)); return true; })
        .map(([j, name, w, l, vs]) => { const row = (T.roster || []).find(r => String(r.jersey_number) === String(j)), next = opts.namesByJersey && opts.namesByJersey[String(j)];
          return { j: String(j), name: name || (row && row.player) || next || null, nameBy: name || row ? 'record' : next ? 'number on next-season roster' : 'unknown', w, l, vs }; }),
      games: (ev && ev.n_games) || (sb && sb.n_games) || st.games_played || null, failedClears: ev && ev.failed_clears_pg != null ? ev.failed_clears_pg : null
    };
  }

  // Faceoffs: each pair from head-to-head first, then FOGOs both have faced (half weight), then season records (weight 20).
  function foPair(o, t, oTeam, tTeam) {
    const a = o.vs.find(v => v[1] === tTeam && (v[0] === t.name || v[0] === '#' + t.j)), b = t.vs.find(v => v[1] === oTeam && (v[0] === '#' + o.j || (o.name && v[0] === o.name)));
    const dir = a && b ? (a[2] + a[3] >= b[2] + b[3] ? [a[2], a[3]] : [b[3], b[2]]) : a ? [a[2], a[3]] : b ? [b[3], b[2]] : null;
    // Prior from each man's record with the head-to-head draws taken out, so they aren't counted twice.
    const rate = (m, w, l) => (m.w - w + 1) / (m.w - w + m.l - l + 2);
    const ro = rate(o, dir ? dir[0] : 0, dir ? dir[1] : 0), rt = rate(t, dir ? dir[1] : 0, dir ? dir[0] : 0);
    const p0 = ro * (1 - rt) / (ro * (1 - rt) + rt * (1 - ro));
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
      const a = A.foSeason ?? 0.5, b = B.foSeason ?? 0.5; return { p: a * (1 - b) / (a * (1 - b) + b * (1 - a)), M: [], note: 'no FOGO film data: team season rates' };
    }
    const M = A.fogos.map(o => B.fogos.map(t => foPair(o, t, A.id, B.id)));
    let tShare = usage.theirs ? B.fogos.map(t => usage.theirs[t.j] || 0) : B.fogos.map(t => t.w + t.l);
    if (!tShare.some(x => x > 0)) tShare = B.fogos.map(t => t.w + t.l); // usage that names nobody on the list falls back to film usage
    const tTot = tShare.reduce((a, b) => a + b, 0) || 1;
    const main = A.fogos.reduce((bi, o, i) => (o.w + o.l > A.fogos[bi].w + A.fogos[bi].l ? i : bi), 0);
    let oShare = usage.ours ? A.fogos.map(o => usage.ours[o.j] || 0) : A.fogos.map((o, i) => i === main ? 1 : 0);
    if (!oShare.some(x => x > 0)) oShare = A.fogos.map((o, i) => i === main ? 1 : 0);
    const oTot = oShare.reduce((a, b) => a + b, 0) || 1;
    let p = 0; M.forEach((row, i) => row.forEach((c, j) => { p += (oShare[i] / oTot) * (tShare[j] / tTot) * c.p; }));
    return { p, M, main, oShare: oShare.map(x => x / oTot), tShare: tShare.map(x => x / tTot) };
  }

  // Goalie save by zone from logged shots { goalieJersey, goalX, goalY, goal, onKeeper, onGoal }.
  // Three layers, each pulled toward the one above: the pool's save rate; the pool's zone pattern (weight poolZone);
  // each goalie's level (weight goalie, applied on the log-odds scale to the pool pattern); his own zone deviations
  // (weight goalieZone). v.raw is his unpulled save rate, v.base the pulled one.
  const zoneOf = (gx, gy) => { const col = Math.min(2, Math.floor(gx * 3)), row = 2 - Math.min(2, Math.floor(gy * 3)); return ZONES[row * 3 + col]; };
  function goalieZones(shots) {
    const by = {}, pool = {};
    (shots || []).filter(s => s.goalieJersey && s.goalX != null && (s.goal || s.onKeeper || s.onGoal)).forEach(s => {
      const v = by[s.goalieJersey] || (by[s.goalieJersey] = { j: String(s.goalieJersey), n: 0, sv: 0, z: {} }); const z = zoneOf(s.goalX, s.goalY); const c = v.z[z] || (v.z[z] = [0, 0]);
      const pc = pool[z] || (pool[z] = [0, 0]); c[1]++; v.n++; pc[1]++; if (!s.goal) { c[0]++; v.sv++; pc[0]++; } });
    const L = Object.values(by), N = L.reduce((a, v) => a + v.n, 0); if (!N) return by;
    const pm = clamp(L.reduce((a, v) => a + v.sv, 0) / N, 0.02, 0.98);
    const pz = Object.fromEntries(ZONES.map(z => { const c = pool[z] || [0, 0]; return [z, clamp((c[0] + K.poolZone * pm) / (c[1] + K.poolZone), 0.02, 0.98)]; }));
    L.forEach(v => {
      v.raw = v.sv / v.n; v.base = (v.sv + K.goalie * pm) / (v.n + K.goalie); const shift = logit(v.base) - logit(pm);
      v.zr = Object.fromEntries(ZONES.map(z => { const c = v.z[z] || [0, 0], e = unlogit(logit(pz[z]) + shift); return [z, c[1] ? e + (c[1] / (c[1] + K.goalieZone)) * (c[0] / c[1] - e) : e]; }));
    });
    return by;
  }
  const EVEN_MIX = Object.fromEntries(ZONES.map(z => [z, 1 / 9]));
  // Save rate of a goalie against a shot mix { zone: share }.
  const saveVs = (gz, mix) => ZONES.reduce((a, z) => a + (mix[z] || 0) * gz.zr[z], 0);

  // Game parameters for attack A against defense B. ctx: { d3, picks (pickMatchup result or null), placement: { jersey: mix },
  // goalieZones (for B's goalies), goalie: B's goalie jersey in net, fo }.
  function side(A, B, ctx) {
    const d3 = ctx.d3, P = { shares: {}, rate: {} };
    const sA = t => shr(A.off.by_type[t], d3.by_type[t].goal_pct), sB = t => shr(B.def.by_type[t], d3.by_type[t].goal_pct);
    const filmS = f => TYPES.reduce((a, t) => a + share(A.off.by_type, t) * f(t), 0);
    const filmD = f => TYPES.reduce((a, t) => a + share(B.def.by_type, t) * f(t), 0);
    const filmD3 = TYPES.reduce((a, t) => a + share(d3.by_type, t) * d3.by_type[t].goal_pct, 0);
    // Man-up: chances per possession from both teams' records; rates pulled toward D3 (weight 20).
    const aEmo = (A.emo.goals + K.emo * d3.emo) / (A.emo.chances + K.emo), bMdd = (B.mdd.goals_allowed + K.emo * d3.emo) / (B.mdd.chances + K.emo);
    const aEmoPg = A.games ? A.emo.chances / A.games : null, bMddPg = B.games ? B.mdd.chances / B.games : null;
    P.emoChance = aEmoPg != null && bMddPg != null ? ((aEmoPg + bMddPg) / 2) / A.poss : B.pens / B.poss;
    P.emoRate = log5(aEmo, bMdd, d3.emo);
    // Adjusted efficiency includes man-up goals, so the even-strength film rates are anchored to it with man-up taken out.
    const eA = A.games ? A.emo.chances / A.games / A.poss : 0, eB = B.games ? B.mdd.chances / B.games / B.poss : 0;
    const evenA = (A.adjOff - eA * aEmo) / (1 - eA), evenB = (B.adjDef - eB * bMdd) / (1 - eB), evenD3 = (d3.eff - P.emoChance * d3.emo) / (1 - P.emoChance);
    const kA = odds(clamp(evenA, 0.02, 0.9)) / odds(filmS(sA)), kB = odds(clamp(evenB, 0.02, 0.9)) / odds(filmD(sB)), kD = odds(clamp(evenD3, 0.02, 0.9)) / odds(filmD3);
    const adj = (p, k) => prob(odds(p) * k);
    TYPES.forEach(t => { P.shares[t] = (share(A.off.by_type, t) + share(B.def.by_type, t)) / 2; P.rate[t] = log5(adj(sA(t), kA), adj(sB(t), kB), adj(d3.by_type[t].goal_pct, kD)); });
    const pickBase = adj(d3.pick.goal_pct, kD), noPickBase = adj(d3.no_pick.goal_pct, kD);
    const aPick = adj(shr(A.off.pick, d3.pick.goal_pct), kA), bPick = adj(shr(B.def.pick, d3.pick.goal_pct), kB);
    const ps = (x, y) => y && y.n ? x.n / y.n : 0;
    P.pickShare = clamp((ps(A.off.pick, A.off.by_type.settled) + ps(B.def.pick, B.def.by_type.settled)) / 2, 0, 0.95);
    P.pickRate = log5(aPick, bPick, pickBase);
    // Coverage split: only the differences between coverages come from the tags; the level stays the film pick rate,
    // so entering the 15th tag doesn't shift the level.
    const pm = ctx.picks, pt = ctx.pickTeams;
    P.cov = pm && pm.rows && pm.rows.length && pt ? pm.rows.map(r => ({ name: r.coverage, share: r.share,
      rate: log5(prob(odds(aPick) * odds(r.ourRate) / odds(pt.off)), prob(odds(bPick) * odds(r.theirRate) / odds(pt.def)), pickBase) })) : null;
    P.noPickRate = log5(adj(shr(A.off.no_pick_settled, d3.no_pick.goal_pct), kA), adj(shr(B.def.no_pick_settled, d3.no_pick.goal_pct), kB), noPickBase);
    P.len = A.len * ctx.dead;
    // Shooters: usage from shots; finishing relative to the team on the probability scale, normalized to average exactly 1.
    const sh = A.shooters.length ? A.shooters : [{ j: '?', name: 'team', share: 1, fin: null }];
    const tot = sh.reduce((a, s) => a + s.share, 0);
    sh.forEach(s => { s.m = s.fin != null && A.teamFin > 0 ? s.fin / A.teamFin : 1; });
    const mean = sh.reduce((a, s) => a + s.share / tot * s.m, 0) || 1;
    P.shooters = sh.map(s => ({ j: s.j, name: s.name, share: s.share / tot, m: s.m / mean }));
    // Goalie in net: goals scale with goals allowed per shot on goal, (1 - save in net) / (1 - usual save), against each
    // shooter's placement. Usual = the defense's goalies that have zone logs, else the logged pool by shots faced.
    const gz = ctx.goalieZones || {}, inNet = ctx.goalie && gz[ctx.goalie] ? gz[ctx.goalie] : null;
    let ref = B.goalies.filter(x => gz[x.j]);
    if (!ref.length) { const pool = Object.values(gz).filter(x => x.n >= 30), tt = pool.reduce((a, x) => a + x.n, 0); ref = pool.map(x => ({ j: x.j, share: x.n / tt })); }
    P.goalie = inNet ? inNet.j : (B.goalies[0] && B.goalies[0].j) || null;
    P.shooters.forEach(s => {
      const mix = (ctx.placement && ctx.placement[s.j]) || EVEN_MIX;
      if (inNet && ref.length) { const refSave = ref.reduce((a, x) => a + x.share * saveVs(gz[x.j], mix), 0) / ref.reduce((a, x) => a + x.share, 0); s.g = (1 - saveVs(inNet, mix)) / (1 - refSave); }
      else s.g = 1;
    });
    return P;
  }
  // Whole-game parameters. ctx.dead: dead-time factor so each team averages its real possessions per game.
  // Expected goals per possession for one side's parameters.
  const gpp = q => (1 - q.emoChance) * (q.shares.transition * q.rate.transition + q.shares.early * q.rate.early + q.shares.settled * (q.pickShare * q.pickRate + (1 - q.pickShare) * q.noPickRate)) + q.emoChance * q.emoRate;
  // Level uncertainty is on the log-odds scale; the engine varies the log of the rate, so it's scaled by (1 - rate).
  const varSd = (uLogit, rate) => Math.sqrt(((1 - rate) * uLogit) ** 2 + CAL.form ** 2);
  // ctx.home: 0 = W at home, 1 = O at home, null/undefined = neutral. ctx.variance === false turns off game-to-game variation.
  function matchup(W0, O0, ctx) {
    const hs = ctx.home === 0 ? 1 : ctx.home === 1 ? -1 : 0;
    // Home edge: half on the home offense, half on the away defense (log5 multiplies them), so the home offense gets CAL.home.
    const atHome = (T, s) => s ? Object.assign({}, T, { adjOff: unlogit(logit(T.adjOff) + s * CAL.home / 2), adjDef: unlogit(logit(T.adjDef) - s * CAL.home / 2) }) : T;
    const W = atHome(W0, hs), O = atHome(O0, -hs);
    const dead = 3600 / (((W.poss + O.poss) / 2) * (W.len + O.len));
    const fo = faceoffs(W, O, ctx.foUsage);
    if (hs) { fo.pNeutral = fo.p; fo.p = unlogit(logit(fo.p) + hs * CAL.homeFo); }
    // Our logged draws against this opponent, blended in (ctx.foLogged: { att, won, k }).
    if (ctx.foLogged && ctx.foLogged.att) { const L = ctx.foLogged, obs = (L.won + 0.5) / (L.att + 1); fo.pModel = fo.p; fo.p = unlogit((L.k * logit(fo.p) + L.att * logit(obs)) / (L.k + L.att)); fo.logged = L; }
    const t = [side(W, O, Object.assign({}, ctx.wl || {}, { d3: ctx.d3, dead })), side(O, W, Object.assign({}, ctx.opp || {}, { d3: ctx.d3, dead }))];
    // Clears: a clear is attempted after each non-goal possession by the other team. The failure chance per attempt is set
    // so each team's failed clears per game match its record (falls back to 1 - clear rate). Film transition shares already
    // include possessions that follow failed clears, so that part is taken out of the shares the engine draws from.
    const X = [W, O];
    [0, 1].forEach(i => { const j = 1 - i, attempts = Math.max(1, X[j].poss * (1 - gpp(t[j])));
      const fail = X[i].failedClears != null ? clamp(X[i].failedClears / attempts, 0, 0.5) : 1 - (X[i].clear ?? 0.9);
      t[i].clear = 1 - fail; t[i].clearAttempts = attempts; });
    [0, 1].forEach(i => { const j = 1 - i, f = clamp((1 - t[j].clear) * (1 - gpp(t[i])), 0, 0.3); // share of i's possessions that start from j's failed clear
      const s0 = t[i].shares; t[i].sharesFilm = Object.assign({}, s0); const tr = Math.max(0, (s0.transition - f) / (1 - f)), rest = 1 - tr, other = s0.early + s0.settled;
      t[i].shares = { transition: tr, early: rest * s0.early / other, settled: rest * s0.settled / other }; t[i].failedClearShare = f; });
    // Game-to-game variation: how sure we are of each scoring level (this offense and the other defense) plus game form.
    const u = (T, k) => (T.unc && T.unc[k]) || 0, V = ctx.variance === false ? null : {
      sd: [varSd(Math.hypot(u(W, 'off'), u(O, 'def')), gpp(t[0])), varSd(Math.hypot(u(O, 'off'), u(W, 'def')), gpp(t[1]))], fo: 0, pace: CAL.pace };
    return { fo: fo.p, foModel: fo, t, teams: [W, O], k: K, home: ctx.home === 0 || ctx.home === 1 ? ctx.home : null, var: V };
  }

  V3.CAL = CAL; V3.gpp = gpp; V3.K = K; V3.ZONES = ZONES; V3.TYPES = TYPES; V3.team = team; V3.faceoffs = faceoffs; V3.foPair = foPair; V3.goalieZones = goalieZones; V3.saveVs = saveVs; V3.zoneOf = zoneOf;
  V3.side = side; V3.matchup = matchup; V3.log5 = log5; V3.odds = odds; V3.prob = prob; V3.graduating = graduating; V3.clamp = clamp;
})(globalThis);

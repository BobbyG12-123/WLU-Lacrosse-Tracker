// W&L Matchup Studio, engine v3 (experimental): the game-week staff sheet.
// Builds the sheet from real inputs only. Anything not tagged yet is reported as missing, never invented.
(function (g) {
  const MS = g.MS = g.MS || {};
  const V3 = MS.V3 = MS.V3 || {};
  const lastName = s => String(s || '').trim().split(/\s+/).slice(-1)[0];
  const pct = v => v == null || !isFinite(v) ? '—' : Math.round(100 * v) + '%';
  const ZONES = () => V3.ZONES;

  // Our practice and scrimmage logs. shots/poss rows are decoded objects; stints have { id, offense, offTeam }.
  function ourPairs(shots) {
    const S = shots.filter(s => s.team !== 'OPP' && s.pickScreener && s.pickUser);
    const tot = S.length, team = tot ? S.filter(s => s.goal).length / tot : null, k = V3.K.pair, m = {};
    S.forEach(s => { const key = s.pickScreener + '>' + s.pickUser; const v = m[key] || (m[key] = { scr: String(s.pickScreener), usr: String(s.pickUser), n: 0, g: 0, freed: 0 }); v.n++; if (s.goal) v.g++; if (/freed/i.test(s.pickResult || '')) v.freed++; });
    return { team, tot, k, list: team == null ? [] : Object.values(m).map(v => Object.assign(v, { rate: (v.g + k * team) / (v.n + k) })).sort((a, b) => b.rate - a.rate) };
  }
  function ourGroups(shots, poss, stints) {
    const st = Object.fromEntries(stints.filter(t => t.offTeam === 'WLU' && Array.isArray(t.offense) && t.offense.length >= 3).map(t => [t.id, t.offense.map(String).sort((a, b) => +a - +b)]));
    const g = {}, add = (sid, goal) => { const pl = st[sid]; if (!pl) return; const key = pl.join(' '); const v = g[key] || (g[key] = { players: pl, n: 0, goals: 0 }); v.n++; if (goal) v.goals++; };
    shots.filter(s => s.team !== 'OPP' && s.stintId).forEach(s => add(s.stintId, s.goal));
    poss.filter(p => p.team !== 'OPP' && p.stintId && p.end === 'Turnover').forEach(p => add(p.stintId, 0));
    const L = Object.values(g), N = L.reduce((a, v) => a + v.n, 0), G = L.reduce((a, v) => a + v.goals, 0), team = N ? G / N : null, k = V3.K.group;
    return { team, N, k, list: team == null ? [] : L.map(v => Object.assign(v, { rate: (v.goals + k * team) / (v.n + k) })).sort((a, b) => b.rate - a.rate) };
  }
  // Our defense: practice reps, plus scrimmage possessions where the other team shot (our defenders, our goalie).
  // In a scrimmage, our own shots are against their goalie and their defenders, so they're left out.
  const ourDefense = s => !(s.context === 'Scrimmage' && s.team !== 'OPP');
  function defenders(shots) {
    const reps = shots.filter(ourDefense).filter(x => x.defender && (x.defBeaten === 'Yes' || x.defBeaten === 'No'));
    const team = reps.length ? reps.filter(x => x.defBeaten === 'Yes').length / reps.length : null, by = {}, k = V3.K.defender;
    reps.forEach(x => { const v = by[x.defender] || (by[x.defender] = { j: String(x.defender), n: 0, b: 0 }); v.n++; if (x.defBeaten === 'Yes') v.b++; });
    return { team, n: reps.length, list: team == null ? [] : Object.values(by).map(v => Object.assign(v, { r: (v.b + k * team) / (v.n + k) })).sort((a, b) => a.r - b.r) };
  }
  function slides(shots) {
    const ds = shots.filter(ourDefense).filter(x => x.offDodge), sl = ds.filter(x => x.slideDefender), ns = ds.filter(x => !x.slideDefender);
    return { slid: sl.length, slidGoals: sl.filter(x => x.goal).length, not: ns.length, notGoals: ns.filter(x => x.goal).length };
  }
  // Placement of their shooters from the Scouting page's shot-location tags ({ jersey: zone mix }), or null.
  function placementFromTags(shotTags) {
    if (!shotTags) return null; const by = {};
    Object.values(shotTags).forEach(t => { if (!t || !t.zone || !t.j) return; const z = String(t.zone).replace(/middle/i, 'Center').replace(/\b\w/g, c => c.toUpperCase()); const v = by[t.j] || (by[t.j] = {}); v[z] = (v[z] || 0) + 1; });
    const out = {}; Object.entries(by).forEach(([j, m]) => { const n = Object.values(m).reduce((a, b) => a + b, 0); if (n >= 5) out[j] = Object.fromEntries(Object.entries(m).map(([z, c]) => [z, c / n])); });
    return Object.keys(out).length ? out : null;
  }

  // Main entry. in: { wl, opp (LacrosseReference team records), d3, practice: { shots, poss, stints, roster: [{ j, n }] },
  // tags: { pickDef, pickOff, legacyPick, shotOff }, opts: { games, seed, use: { key: % }, goalie, oppReturning } }
  function build(inp) {
    const o = Object.assign({ games: 4000, seed: 11, use: {}, goalie: null, oppReturning: true }, inp.opts || {});
    const d3 = inp.d3, P0 = inp.practice || {}, shots = P0.shots || [], tags = inp.tags || {}, missing = [];
    const names = (P0.roster || []).map(x => x.n).filter(Boolean);
    // Names for jerseys in our practice logs come from the same season's roster only.
    const wn = j => { const r = (P0.roster || []).find(x => String(x.j) === String(j)); return r && r.n ? `#${j} ${lastName(r.n)}` : '#' + j; };
    const byJ = Object.fromEntries((P0.roster || []).filter(x => x.j && x.n).map(x => [String(x.j), x.n]));
    const W = V3.team(inp.wl, names.length ? { names, namesByJersey: byJ, d3eff: d3.eff } : { d3eff: d3.eff });
    const O = V3.team(inp.opp, o.oppReturning ? { returning: true, d3eff: d3.eff } : { d3eff: d3.eff });
    // Picks: their coverage split only from real tags.
    let picks = null, lynDef = null, lynOff = null;
    if (MS.pickRates) {
      const sb = inp.opp.sb || {};
      lynDef = MS.pickRates({ side: 'def', teamId: inp.opp.id, clips: sb.pick_clips_def || [], tags: tags.pickDef || {}, legacy: tags.legacyPick || {}, teamPick: sb.def && sb.def.pick, d3Pick: d3.pick });
      lynOff = MS.pickRates({ side: 'off', teamId: inp.opp.id, clips: sb.pick_clips_off || [], tags: tags.pickOff || {}, teamPick: sb.off && sb.off.pick, d3Pick: d3.pick });
      const ourOff = MS.pickRates({ side: 'off', teamId: inp.wl.id, clips: [], tags: {}, teamPick: inp.wl.sb.off.pick, d3Pick: d3.pick });
      picks = MS.pickMatchup(ourOff, lynDef); picks._off = ourOff.team.value; picks._def = lynDef.team.value;
      if (!lynDef.enough.coverage) missing.push(`Their pick coverage: ${lynDef.coverageTagged} of ${(sb.pick_clips_def || []).length} pick clips tagged (15 needed). Team pick rates used.`);
    }
    const placement = placementFromTags(tags.shotOff);
    if (!placement) missing.push('Where their shooters put the ball: not tagged yet (Scouting page shot locations). Goalie comparison uses an even spread.');
    const gz = V3.goalieZones(shots.filter(ourDefense));
    const ctx = g2 => ({ d3, wl: { picks: picks && picks.rows.length ? picks : null, pickTeams: picks ? { off: picks._off, def: picks._def } : null }, opp: { placement, goalieZones: gz, goalie: g2 } });
    const P = V3.matchup(W, O, ctx(o.goalie));
    const n = o.games, tn = Math.min(n, 3000), seed = o.seed;
    const base = V3.runBatch(P, n, seed), bt = V3.runBatch(P, tn, seed), BT = V3.winPct(bt);
    const avg = (G, f) => G.reduce((a, b) => a + f(b), 0) / G.length;
    const now = (tm, kinds) => avg(bt, b => kinds.reduce((a, k) => a + (b.goals[tm][k] || 0), 0));
    // A change of dG goals a game in one kind of scoring, as a multiplier on that kind's rate for this game.
    const scaled = (key, cur, dG) => ({ [key]: cur > 0.05 ? Math.max(0.05, (cur + dG) / cur) : 1 });
    const win = sets => V3.winPct(V3.runBatch(P, tn, seed, sets));
    const draws = avg(bt, b => b.fo[0] + b.fo[1]);
    const levers = [];
    const L = (x) => { x.w = win(x.sets); levers.push(x); };
    // their best dodger
    const dodge = r => Object.entries(r.sbGoals || {}).filter(([k]) => k.includes('dodge')).reduce((a, [, v]) => a + v, 0);
    const games = (inp.opp.sb && inp.opp.sb.n_games) || 1;
    const oppSix = now(1, ['no pick', 'pick']);
    const topD = (inp.oppPlayers || []).filter(p => !o.oppReturning || !V3.graduating(p.cls)).filter(p => dodge(p) > 0).sort((a, b) => dodge(b) - dodge(a))[0];
    if (topD) L({ area: 'Defense', src: 'real', title: `Take away one #${topD.j} ${lastName(topD.name)} dodge goal`, why: `He scored ${dodge(topD)} dodge goals in their ${games} filmed games (${(dodge(topD) / games).toFixed(1)} a game). Assumes nobody else picks it up.`, n: topD.dodgeShots || null, unit: 'dodge shots', dG: -1, who: 'opp', sets: scaled('opp.six', oppSix, -1) });
    else missing.push('Their dodgers by player: player film data not loaded.');
    // faceoffs vs their main man
    const fm = P.foModel;
    if (fm.M && fm.M.length) { const j0 = fm.tShare.indexOf(Math.max(...fm.tShare)), t0 = O.fogos[j0], c = fm.M[fm.main][j0];
      L({ area: 'Faceoffs', src: 'real', title: `Win 3 more of #${t0.j} ${lastName(t0.name)}'s draws`, why: `He takes ${pct(fm.tShare[j0])} of their draws; #${W.fogos[fm.main].j} is ${c.dir ? c.dir.join('-') : 'without a head-to-head'} against him.`, n: c.dir ? c.dir[0] + c.dir[1] : null, unit: 'head-to-head draws', poss: 3, who: 'wl', sets: { fo: Math.min(0.95, P.fo + 3 / draws) } }); }
    // our best pick pair, at the entered usage
    const PR = ourPairs(shots), ourPick = now(0, ['pick']), ourPickPoss = avg(bt, b => b.kinds[0].pick || 0);
    const pr3 = PR.list.filter(v => v.n >= 3);
    pr3.slice(0, 1).forEach(v => { const dG = 3 * (ourPickPoss ? ourPick / ourPickPoss : 0) * (v.rate / PR.team - 1);
      L({ area: 'Offense', src: 'real', title: `Give ${wn(v.scr)} → ${wn(v.usr)} 3 more picks a game`, why: `${v.g} goals on ${v.n} logged pick shots (team ${pct(PR.team)}). Best of ${pr3.length} pairs with 3+ shots, so some of the edge is luck.`, n: v.n, unit: 'practice pick shots', dG, who: 'wl', sets: scaled('wl.pick', ourPick, dG) }); });
    // defender on their best dodger
    const DF = defenders(shots);
    const dl = DF.list.filter(v => v.n >= 8);
    if (topD && dl.length) { const bd = dl[0], dG = -(dodge(topD) / games) * (1 - bd.r / DF.team);
      L({ area: 'Defense', src: 'real', title: `Put ${wn(bd.j)} on #${topD.j} ${lastName(topD.name)}`, why: `${wn(bd.j)} was beaten on ${bd.b} of ${bd.n} logged practice reps that ended in a shot (team ${pct(DF.team)}). Best of ${dl.length} defenders with 8+ reps, so some of the edge is luck.`, n: bd.n, unit: 'practice reps', dG, who: 'opp', sets: scaled('opp.six', oppSix, dG) }); }
    // slides
    const SL = slides(shots);
    if (SL.slid >= 20 && SL.not >= 20) { const dG = -3 * (SL.notGoals / SL.not - SL.slidGoals / SL.slid);
      L({ area: 'Defense', src: 'real', title: 'Slide on 3 more of their dodges a game', why: `In our practices dodgers scored on ${pct(SL.slidGoals / SL.slid)} of shots when we slid (${SL.slid}) and ${pct(SL.notGoals / SL.not)} when we didn't (${SL.not}). Per shot only: doesn't count slides that stop a shot from happening.`, n: SL.slid, unit: 'practice slide shots', dG, who: 'opp', sets: scaled('opp.six', oppSix, dG) }); }
    // shot clock
    const ck = ((inp.opp.off_shot_profile || {}).this_year || []).find(p => p.tag === 'shot_clock_remaining_bucket');
    if (ck) { const early = ck.buckets.find(b => b.bucket === 60), late = ck.buckets.filter(b => b.bucket < 40);
      if (early && late.length) { const lp = late.reduce((a, b) => a + b.goals, 0) / late.reduce((a, b) => a + b.shots, 0), dG = -3 * (early.pct - lp);
        L({ area: 'Defense', src: 'real', title: 'Make them shoot later: push 3 early shots past 40 seconds', why: `They score on ${pct(early.pct)} of shots with 60+ seconds left and ${pct(lp)} with under 40. Per shot only.`, n: early.shots, unit: 'shots', dG, who: 'opp', sets: scaled('opp.six', oppSix, dG) }); } }
    // clears, both ways
    // Clears are played in the engine: these change how often each team fails a clear, and the games are replayed.
    const theirFails = avg(bt, b => b.failedClears[1]), ourFails = avg(bt, b => b.failedClears[0]);
    if (theirFails > 0.05) L({ area: 'Ride', src: 'real', title: 'Force 1 more failed clear a game', why: `They fail about ${theirFails.toFixed(1)} clears a game in the sim (${O.failedClears != null ? O.failedClears + ' a game in 2026' : 'clear rate ' + pct(O.clear)}). Each one is a possession for us that they don't get.`, n: null, unit: 'season totals', poss: 1, who: 'wl', sets: { 'opp.clearfail': (theirFails + 1) / theirFails } });
    if (ourFails > 1.05) L({ area: 'Clear', src: 'real', title: 'Clear cleanly: 1 fewer failed clear a game', why: `We fail about ${ourFails.toFixed(1)} clears a game in the sim (${W.failedClears != null ? W.failedClears + ' a game in 2026' : 'clear rate ' + pct(W.clear)}). Each one hands them a possession.`, n: null, unit: 'season totals', poss: 1, who: 'wl', sets: { 'wl.clearfail': (ourFails - 1) / ourFails } });
    // our picks into their weakest coverage (only with tags)
    if (picks && picks.rows.length) { const cv = picks.rows.slice().sort((a, b) => b.expected - a.expected)[0], dG = 3 * (cv.expected - picks.overall);
      L({ area: 'Offense', src: 'real', title: `Draw their ${cv.coverage} on 3 more of our picks`, why: `Our picks are expected to score ${pct(cv.expected)} against it vs ${pct(picks.overall)} overall. Best of ${picks.rows.length} coverages.`, n: cv.theirN, unit: 'tagged picks', dG, who: 'wl', sets: scaled('wl.pick', ourPick, dG) }); }
    else missing.push('Pick levers (their coverage, their weakest pick defender, their pick pairs): need their pick tags.');
    missing.push('Wing ground balls on draws: not logged yet.');
    levers.sort((a, b) => b.w - a.w);

    // Units at the entered usage
    const useOf = key => o.use[key] ?? 50;
    const unit = (key, rate, team, kinds) => { const m = 1 + useOf(key) / 100 * (rate / team - 1); return win(kinds === 'pick' ? { 'wl.pick': m } : { 'wl.nopick': m, 'wl.pick': m }); };
    const pairs = PR.list.filter(v => v.n >= 3).map(v => Object.assign({}, v, { key: 'pair:' + v.scr + '>' + v.usr })).map(v => Object.assign(v, { use: useOf(v.key), w: unit(v.key, v.rate, PR.team, 'pick') }));
    const GR = ourGroups(shots, P0.poss || [], P0.stints || []);
    const groups = GR.list.filter(v => v.n >= 8).map(v => Object.assign({}, v, { key: 'group:' + v.players.join(' ') })).map(v => Object.assign(v, { use: useOf(v.key), w: unit(v.key, v.rate, GR.team, 'six') }));

    // Our goalies: replay with each in net
    const ourGoalies = Object.values(gz).filter(x => x.n >= 60).map(x => { const Pg = V3.matchup(W, O, ctx(x.j)); return { j: x.j, n: x.n, base: x.base, w: V3.winPct(V3.runBatch(Pg, tn, seed)), weakest: V3.ZONES.slice().sort((a, b) => x.zr[a] - x.zr[b])[0], zr: x.zr }; }).sort((a, b) => b.w - a.w);

    // Ways we lose
    const six = b => (b.goals[1]['no pick'] || 0) + (b.goals[1].pick || 0), our6 = b => (b.goals[0]['no pick'] || 0) + (b.goals[0].pick || 0);
    const C = [
      { title: 'Their 6-on-6 got hot', f: six, sign: 1, fmt: v => `${v.toFixed(0)} settled goals for them`, todo: 'Slide earlier to their top dodgers; take away their best pick pair.' },
      { title: 'We lost the faceoff battle', f: b => b.fo[0] / (b.fo[0] + b.fo[1]), sign: -1, fmt: v => `we won ${pct(v)} of draws`, todo: 'Win the matchup with their main man; win the wings.' },
      { title: 'Our 6-on-6 went cold', f: our6, sign: -1, fmt: v => `${v.toFixed(0)} settled goals for us`, todo: 'Feature our best pick pairs and groups; shoot high or low.' },
      { title: 'No transition goals for us', f: b => b.goals[0].transition || 0, sign: -1, fmt: v => `${v.toFixed(0)} transition goals for us`, todo: 'Push after saves and takeaways; ride for short fields.' },
      { title: 'They ran on us', f: b => b.goals[1].transition || 0, sign: 1, fmt: v => `${v.toFixed(0)} transition goals for them`, todo: 'Get back and stop the ball early.' },
      { title: 'Their man-up hurt us', f: b => b.goals[1]['man-up'] || 0, sign: 1, fmt: v => `${v.toFixed(0)} man-up goals for them`, todo: 'Stay out of the box.' }
    ];
    C.forEach(c => { c.m = avg(base, c.f); c.s = Math.sqrt(avg(base, b => (c.f(b) - c.m) ** 2)) || 1; c.n = 0; c.sum = 0; });
    const losses = base.filter(b => b.score[0] <= b.score[1]), wins = base.filter(b => b.score[0] > b.score[1]);
    losses.forEach(b => { let best = C[0], bz = -1e9; C.forEach(c => { const z = c.sign * (c.f(b) - c.m) / c.s; if (z > bz) { bz = z; best = c; } }); best.n++; best.sum += best.f(b); });
    const causes = C.filter(c => c.n).map(c => ({ title: c.title, share: c.n / losses.length, inLoss: c.fmt(c.sum / c.n), inWin: wins.length ? c.fmt(avg(wins, c.f)) : '—', todo: c.todo })).sort((a, b) => b.share - a.share);

    const out = { version: V3.VERSION, teams: { wl: { name: W.name, note: W.rosterNote, retOff: W.retOff, retDef: W.retDef }, opp: { name: O.name, note: O.rosterNote, retOff: O.retOff, retDef: O.retDef, removed: O.removed } },
      base: { win: V3.winPct(base), score: [avg(base, b => b.score[0]), avg(base, b => b.score[1])], ot: base.filter(b => b.ot).length / base.length, fo: P.fo, games: n },
      levers, causes, pairs: { team: PR.team, tot: PR.tot, list: pairs }, groups: { team: GR.team, N: GR.N, list: groups }, defenders: DF, ourGoalies,
      faceoffs: { model: fm, ours: W.fogos, theirs: O.fogos }, picks: { def: lynDef, off: lynOff, matchup: picks }, missing, BT };
    // Kept off the JSON so a single unit row can be replayed without rebuilding the sheet.
    Object.defineProperty(out, '_ctx', { enumerable: false, value: { P, tn, seed, pairTeam: PR.team, groupTeam: GR.team } });
    return out;
  }
  // Replays one pick pair or group at a new usage %, updating that row in place. Same result as a full rebuild.
  function unitWin(S, key, use) {
    const c = S._ctx, row = S.pairs.list.find(x => x.key === key) || S.groups.list.find(x => x.key === key); if (!c || !row) return null;
    const isPair = key.startsWith('pair:'), m = 1 + use / 100 * (row.rate / (isPair ? c.pairTeam : c.groupTeam) - 1);
    row.use = use; row.w = V3.winPct(V3.runBatch(c.P, c.tn, c.seed, isPair ? { 'wl.pick': m } : { 'wl.nopick': m, 'wl.pick': m }));
    return row.w;
  }
  V3.sheet = { build, unitWin, ourPairs, ourGroups, defenders, slides, placementFromTags };
})(globalThis);

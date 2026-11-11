// W&L Matchup Studio, engine v3 (experimental): the possession engine.
// One game = a list of events; the box score is rebuilt from the events only. Same parameters and seed give the same game.
(function (g) {
  const MS = g.MS = g.MS || {};
  const V3 = MS.V3 = MS.V3 || {};
  const odds = p => p / (1 - p), prob = o => o / (1 + o), cap = v => Math.max(0.005, Math.min(0.95, v));
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (r, items, w) => { let x = r() * items.reduce((a, it) => a + w(it), 0); for (const it of items) { if ((x -= w(it)) < 0) return it; } return items[items.length - 1]; };
  const pickKey = (r, obj) => pick(r, Object.keys(obj), k => obj[k]);

  // Changes for one run, applied to a copy of the parameters:
  //  { fo: absolute win chance } and { 'wl.transition' | 'wl.nopick' | 'wl.pick' | 'wl.emo' | 'opp.six' | 'opp.transition' | 'opp.emo' | ... : multiplier }
  function applySets(P, sets) {
    const Q = JSON.parse(JSON.stringify(P));
    const pickNow = p => p.cov ? p.cov.reduce((a, c) => a + c.share * c.rate, 0) : p.pickRate;
    const setPick = (p, v) => { const m = odds(cap(v)) / odds(pickNow(p)); p.pickRate = cap(v); if (p.cov) p.cov.forEach(c => { c.rate = prob(odds(c.rate) * m); }); };
    for (const [k, v] of Object.entries(sets || {})) {
      if (k === 'fo') { Q.fo = cap(v); continue; }
      const [tm, what] = k.split('.'), p = Q.t[tm === 'wl' ? 0 : 1];
      if (!p) throw new Error('unknown change ' + k);
      if (what === 'nopick') p.noPickRate = cap(p.noPickRate * v);
      else if (what === 'pick') setPick(p, pickNow(p) * v);
      else if (what === 'six') { p.noPickRate = cap(p.noPickRate * v); setPick(p, pickNow(p) * v); }
      else if (what === 'emo') p.emoRate = cap(p.emoRate * v);
      else if (what === 'clearfail') p.clear = Math.max(0, Math.min(1, 1 - (1 - p.clear) * v)); // multiplier on this team's failed clears
      else if (p.rate[what] != null) p.rate[what] = cap(p.rate[what] * v);
      else throw new Error('unknown change ' + k);
    }
    return Q;
  }

  // One possession for team A. Returns the event.
  function possession(P, A, r, start) {
    const p = P.t[A], ev = { team: A, start, kind: null, cov: null, shooter: null, res: null };
    if (r() < p.emoChance) { ev.kind = 'man-up'; ev.rate = p.emoRate; }
    else {
      ev.kind = pickKey(r, p.shares);
      if (start === 'failed clear') ev.kind = 'transition';
      if (ev.kind === 'settled') {
        if (r() < p.pickShare) { ev.kind = 'pick'; if (p.cov) { const c = pick(r, p.cov, x => x.share); ev.cov = c.name; ev.rate = c.rate; } else ev.rate = p.pickRate; }
        else { ev.kind = 'no pick'; ev.rate = p.noPickRate; }
      } else ev.rate = p.rate[ev.kind];
    }
    // The shooter carries his finishing and the goalie-vs-placement effect, on the odds scale.
    const s = pick(r, p.shooters, x => x.share); ev.shooter = s.j;
    const q = prob(odds(ev.rate) * s.m * s.g);
    ev.res = r() < q ? 'goal' : 'no goal';
    delete ev.rate;
    return ev;
  }
  function simulateGame(P, seed) {
    const r = rng(seed), E = [], sc = [0, 0];
    let t = 0, q = 0, ball = null, start = 'faceoff';
    const faceoff = () => { const w = r() < P.fo ? 0 : 1; E.push({ type: 'faceoff', t, q, winner: w }); return w; };
    const clearOrNot = to => { if (r() < P.t[to].clear) return { ball: to, start: 'clear' }; E.push({ type: 'failed clear', t, q, team: to }); return { ball: 1 - to, start: 'failed clear' }; };
    ball = faceoff();
    while (t < 3600) {
      const ev = possession(P, ball, r, start); ev.type = 'possession'; ev.t = t; ev.q = q; E.push(ev);
      t += P.t[ball].len * (0.4 + 1.2 * r());
      if (ev.res === 'goal') sc[ball]++;
      const nq = Math.floor(t / 900);
      if (t >= 3600) break;
      if (nq > q) { q = nq; ball = faceoff(); start = 'faceoff'; continue; }
      if (ev.res === 'goal') { ball = faceoff(); start = 'faceoff'; }
      else { const c = clearOrNot(1 - ball); ball = c.ball; start = c.start; }
    }
    let ot = false;
    if (sc[0] === sc[1]) {
      ot = true; q = 4; ball = faceoff(); start = 'faceoff';
      for (let i = 0; i < 80 && sc[0] === sc[1]; i++) { const ev = possession(P, ball, r, start); ev.type = 'possession'; ev.t = t; ev.q = q; E.push(ev); if (ev.res === 'goal') sc[ball]++; else { const c = clearOrNot(1 - ball); ball = c.ball; start = c.start; } }
      if (sc[0] === sc[1]) { const w = r() < 0.5 ? 0 : 1; E.push({ type: 'tiebreak', t, q, winner: w }); sc[w]++; }
    }
    E.push({ type: 'end', t, q, score: sc.slice(), ot });
    return E;
  }
  // Box score from events only.
  function box(E) {
    const b = { score: [0, 0], fo: [0, 0], poss: [0, 0], failedClears: [0, 0], goals: [{}, {}], kinds: [{}, {}], pickCov: {}, shooters: [{}, {}], ot: false };
    for (const e of E) {
      if (e.type === 'faceoff') b.fo[e.winner]++;
      else if (e.type === 'failed clear') b.failedClears[e.team]++;
      else if (e.type === 'tiebreak') b.score[e.winner]++;
      else if (e.type === 'possession') {
        b.poss[e.team]++; b.kinds[e.team][e.kind] = (b.kinds[e.team][e.kind] || 0) + 1;
        const sh = b.shooters[e.team][e.shooter] || (b.shooters[e.team][e.shooter] = [0, 0]); sh[1]++;
        if (e.cov && e.team === 0) { const c = b.pickCov[e.cov] || (b.pickCov[e.cov] = [0, 0]); c[1]++; if (e.res === 'goal') c[0]++; }
        if (e.res === 'goal') { b.score[e.team]++; b.goals[e.team][e.kind] = (b.goals[e.team][e.kind] || 0) + 1; sh[0]++; }
      } else if (e.type === 'end') b.ot = e.ot;
    }
    return b;
  }
  // Checks a game's events: the end score equals goals counted, one winner, possessions alternate after misses, times in order.
  function validate(E) {
    const errs = [], b = box(E), end = E[E.length - 1];
    if (!end || end.type !== 'end') errs.push('no end event');
    else { if (end.score[0] !== b.score[0] || end.score[1] !== b.score[1]) errs.push(`score ${end.score} vs counted ${b.score}`); if (end.score[0] === end.score[1]) errs.push('tie at the end'); }
    for (let i = 1; i < E.length; i++) if (E[i].t < E[i - 1].t) errs.push('time went backwards at event ' + i);
    return { ok: !errs.length, errs, box: b };
  }
  function runBatch(P, n, seed, sets) {
    const Q = sets ? applySets(P, sets) : P, out = [];
    for (let i = 0; i < n; i++) out.push(box(simulateGame(Q, seed * 7919 + i)));
    return out;
  }
  const winPct = G => G.filter(b => b.score[0] > b.score[1]).length / G.length;
  V3.rng = rng; V3.applySets = applySets; V3.simulateGame = simulateGame; V3.box = box; V3.validate = validate; V3.runBatch = runBatch; V3.winPct = winPct;
  V3.VERSION = 'matchup-v3-0.1.0';
})(globalThis);

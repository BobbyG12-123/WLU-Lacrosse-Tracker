// W&L Matchup Studio, engine v3 (experimental): lineup unit ratings (Lineups step 1).
// Player ratings from our logged practices and scrimmages, a together term for groups logged as a lineup, and a builder
// that turns a lineup into engine changes (V3.applySets keys) measured against a baseline lineup. The baseline lineup
// reproduces the game-week sheet exactly: every multiplier is 1. Nothing is invented: a player with no logs rates as
// the team average and says so (n = 0).
(function (g) {
  const MS = g.MS = g.MS || {};
  const V3 = MS.V3 = MS.V3 || {};

  // Trust weights (Nov 17, 2026, Nov 5 logs: 39 players with offensive logs, 29 with defensive reps; see docs/LINEUPS_V3.md).
  //  off 30: goals produced per possession used. Method of moments said 49; a split by date (first 9 sessions predict the
  //    last 9) was best at 10-25. 30 sits between. Player ratings beat the team average in that split (error 0.0065 vs 0.0092).
  //  beaten 12: a defender's beaten rate on logged reps (method of moments 12).
  //  caused 200: caused turnovers per logged entry in sessions he logged anything as a defender (method of moments 206).
  //  assist 0.5: share of an assisted goal (and of that possession) credited to the passer. An assumption, not fitted.
  //  usage 3: a player's involvement per session is pulled toward the team's by 3 sessions. An assumption.
  //  group 40: a logged group's together term, on the log-odds scale, pulled to zero by 40 possessions (V3.K.group).
  const LK = Object.freeze({ off: 30, beaten: 12, caused: 200, assist: 0.5, usage: 3, group: 40 });
  const logit = p => Math.log(p / (1 - p)), unlogit = x => 1 / (1 + Math.exp(-x));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const J = x => x == null || x === '' ? null : String(x);
  const isOurs = e => e.team !== 'OPP';
  // Our defense: every practice entry, and scrimmage/game entries where the other team had the ball (as in sheet.js).
  const ourDefense = e => !(e.context && e.context !== 'Practice' && e.team !== 'OPP');
  const sessOf = e => e.sid || ((e.date || '') + '|' + (e.context || '') + '|' + (e.opponent || ''));
  const posMap = p => { const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch (e) { return {}; } };
    return p ? { main: parse(p.json != null ? p.json : p.main), alt: parse(p.alt) } : { main: {}, alt: {} }; };

  // logs: { shots, poss, stints, positions: { json, alt } | { main, alt } }. man: null (all even-strength entries),
  // 'Man-Up' (our man-up entries only), used for the man-up unit.
  function offense(shots, poss, man) {
    const want = e => isOurs(e) && (man ? e.manSituation === man : e.manSituation !== 'Man-Up' && e.manSituation !== 'Man-Down');
    const P = {}, get = j => P[j] || (P[j] = { j, G: 0, U: 0, shots: 0, goals: 0, feeds: 0, fedGoals: 0, to: 0, sess: new Set() });
    let G = 0, U = 0;
    shots.filter(want).forEach(s => { const j = J(s.shooterJersey), goal = s.goal ? 1 : 0; G += goal; U += 1; if (!j) return; const a = J(s.assistJersey), w = a && a !== j ? LK.assist : 0;
      const p = get(j); p.shots++; p.goals += goal; p.G += (1 - w) * goal; p.U += 1 - w; p.sess.add(sessOf(s));
      if (w) { const q = get(a); q.feeds++; q.fedGoals += goal; q.G += w * goal; q.U += w; q.sess.add(sessOf(s)); } });
    poss.filter(want).filter(p => p.end === 'Turnover').forEach(p => { U += 1; const j = J(p.turnoverBy); if (!j) return; const q = get(j); q.to++; q.U += 1; q.sess.add(sessOf(p)); });
    const eff = U ? G / U : null, list = Object.values(P), S = list.reduce((a, p) => a + p.sess.size, 0), inv = S ? list.reduce((a, p) => a + p.U, 0) / S : 0;
    list.forEach(p => { p.n = p.sess.size; delete p.sess; });
    return { eff, U, G, inv, players: P };
  }
  function defense(shots, poss) {
    const reps = shots.filter(ourDefense).filter(x => x.defender && (x.defBeaten === 'Yes' || x.defBeaten === 'No'));
    const beaten = reps.filter(x => x.defBeaten === 'Yes'), gb = beaten.filter(x => x.goal).length, gn = reps.filter(x => x.defBeaten === 'No' && x.goal).length;
    const D = {}, get = j => D[j] || (D[j] = { j, reps: 0, b: 0, ct: 0, sess: new Set() });
    reps.forEach(x => { const d = get(J(x.defender)); d.reps++; if (x.defBeaten === 'Yes') d.b++; d.sess.add(sessOf(x)); });
    const dPoss = poss.filter(ourDefense), dShots = shots.filter(ourDefense), perSess = {};
    dShots.concat(dPoss).forEach(e => { const k = sessOf(e); perSess[k] = (perSess[k] || 0) + 1; });
    const turnovers = dPoss.filter(p => p.end === 'Turnover');
    turnovers.filter(p => p.causedBy).forEach(p => { const d = get(J(p.causedBy)); d.ct++; d.sess.add(sessOf(p)); });
    const list = Object.values(D); list.forEach(d => { d.X = [...d.sess].reduce((a, k) => a + (perSess[k] || 0), 0); d.n = d.sess.size; delete d.sess; });
    const X = list.reduce((a, d) => a + d.X, 0), CT = list.reduce((a, d) => a + d.ct, 0);
    const entries = dShots.length + dPoss.length, goalsAgainst = dShots.filter(x => x.goal).length;
    return { players: D, beatTeam: reps.length ? beaten.length / reps.length : null, reps: reps.length,
      gb: beaten.length ? gb / beaten.length : null, gn: reps.length - beaten.length ? gn / (reps.length - beaten.length) : null,
      ctRate: X ? CT / X : null, ctShare: entries ? turnovers.filter(p => p.causedBy).length / entries : 0,
      repGoalShare: goalsAgainst ? (gb + gn) / goalsAgainst : 0, entries };
  }
  // Groups logged together on offense (lineup records): goals and possessions used while that exact six (or fewer) was on.
  function groups(shots, poss, stints) {
    const st = Object.fromEntries((stints || []).filter(t => t.offTeam === 'WLU' && Array.isArray(t.offense) && t.offense.length >= 3).map(t => [t.id, t.offense.map(String).sort((a, b) => +a - +b)]));
    const out = {}, add = (sid, goal) => { const pl = st[sid]; if (!pl) return; const key = pl.join(' '); const v = out[key] || (out[key] = { players: pl, U: 0, G: 0 }); v.U++; v.G += goal; };
    shots.filter(s => isOurs(s) && s.stintId && s.manSituation !== 'Man-Up' && s.manSituation !== 'Man-Down').forEach(s => add(s.stintId, s.goal ? 1 : 0));
    poss.filter(p => isOurs(p) && p.stintId && p.end === 'Turnover' && p.manSituation !== 'Man-Up' && p.manSituation !== 'Man-Down').forEach(p => add(p.stintId, 0));
    return out;
  }

  function ratings(logs) {
    const shots = logs.shots || [], poss = logs.poss || [], pos = posMap(logs.positions);
    const O = offense(shots, poss, null), MU = offense(shots, poss, 'Man-Up'), D = defense(shots, poss);
    const R = { k: LK, pos, off: O, manUp: MU, def: D, groups: groups(shots, poss, logs.stints) };
    // FO-win and ground-ball possession starts by player (wing ground balls are logged this way when they are logged).
    const st = {}; shots.concat(poss).filter(isOurs).forEach(e => { const j = J(e.possStartJersey); if (!j || !e.possStart) return; const v = st[j] || (st[j] = {}); v[e.possStart] = (v[e.possStart] || 0) + 1; });
    R.starts = st;
    // How often each player appears in a logged lineup record, on our offense and on our defense. Practice records list
    // both sides as ours; in a scrimmage or game, offTeam says which side was ours.
    const onO = {}, onD = {}, inc = (m, j) => { m[j] = (m[j] || 0) + 1; };
    (logs.stints || []).forEach(t => { if (t.offTeam === 'WLU') { (t.offense || []).map(String).forEach(j => inc(onO, j)); if (!t.context || t.context === 'Practice') (t.defense || []).map(String).forEach(j => inc(onD, j)); }
      else if (t.offTeam === 'OPP') (t.defense || []).map(String).forEach(j => inc(onD, j)); });
    R.onField = { off: onO, def: onD };
    return R;
  }
  // One player's offensive rating: goals produced per possession used, pulled toward the team; and his involvement per session.
  function offOf(R, j, man) {
    const O = R.off, p = O.players[j] || { j, G: 0, U: 0, n: 0, shots: 0, goals: 0, feeds: 0, to: 0 };
    if (O.eff == null) return { j, eff: null, v: 0, inv: 1, n: 0, nMan: null, raw: p };
    const eff = (p.G + LK.off * O.eff) / (p.U + LK.off);
    let e = eff, U = p.U;
    if (man === 'Man-Up') { const M = R.manUp.players[j] || { G: 0, U: 0 }; e = (M.G + LK.off * eff) / (M.U + LK.off); U = M.U; }
    return { j, eff: e, v: e * (1 - e) / (p.U + LK.off + (man ? U : 0)), inv: (p.U + LK.usage * O.inv) / (p.n + LK.usage), n: p.U, nMan: man ? U : null, raw: p };
  }
  function defOf(R, j) {
    const D = R.def, d = D.players[j] || { j, reps: 0, b: 0, ct: 0, X: 0, n: 0 };
    const r = D.beatTeam == null ? null : (d.b + LK.beaten * D.beatTeam) / (d.reps + LK.beaten);
    const c = D.ctRate == null ? null : (d.ct + LK.caused * D.ctRate) / (d.X + LK.caused);
    return { j, r, c, vr: r == null ? 0 : r * (1 - r) / (d.reps + LK.beaten), vc: c == null ? 0 : c * (1 - c) / (d.X + LK.caused), reps: d.reps, ct: d.ct, X: d.X, raw: d };
  }
  const Phi = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

  // An offensive unit (any set of players): goals per possession used, usage-weighted, plus the together term for that exact group.
  function offUnit(R, players, man) {
    const P = players.map(String).map(j => offOf(R, j, man)), tot = P.reduce((a, p) => a + p.inv, 0) || 1;
    P.forEach(p => { p.u = p.inv / tot; });
    if (!P.length || P.some(p => p.eff == null)) return { players: P, value: null, base: null, together: 0, tvar: 0, group: null };
    const base = P.reduce((a, p) => a + p.u * p.eff, 0);
    const key = players.map(String).sort((a, b) => +a - +b).join(' '), gr = man ? null : R.groups[key];
    let together = 0, tv = 0;
    if (gr && gr.U) { const obs = clamp((gr.G + 0.5) / (gr.U + 1), 0.01, 0.99), wt = gr.U / (gr.U + LK.group); together = wt * (logit(obs) - logit(clamp(base, 0.01, 0.99)));
      tv = wt * wt / (gr.U * obs * (1 - obs)); } // its error on the log-odds scale
    const value = unlogit(logit(clamp(base, 0.01, 0.99)) + together);
    // tvar: the together term's error on the rate scale (delta method), for chance-better.
    return { players: P, value, base, together, tvar: tv * (value * (1 - value)) ** 2, group: gr || null };
  }
  // A defensive unit: share of their possessions we end with a caused turnover, and goals allowed on 1-on-1 reps.
  // Goals allowed per possession, relative to the team: (1 - caused share) * (1 + rep share of goals * (rep goal rate / team's - 1)).
  function defUnit(R, players) {
    const D = R.def, P = players.map(String).map(j => defOf(R, j)), n = P.length || 1;
    const rbar = D.beatTeam == null ? null : P.reduce((a, p) => a + p.r, 0) / n;
    const cbar = D.ctRate == null ? null : P.reduce((a, p) => a + p.c, 0) / n;
    const repG = r => r * D.gb + (1 - r) * D.gn;
    const ok = rbar != null && D.gb != null && D.gn != null && repG(D.beatTeam) > 0;
    const repFactor = ok ? 1 + D.repGoalShare * (repG(rbar) / repG(D.beatTeam) - 1) : 1;
    const caused = cbar == null ? D.ctShare : D.ctShare * cbar / D.ctRate;
    return { players: P, rbar, cbar, caused, repFactor, value: (1 - caused) * repFactor };
  }

  // P(unit A is better than unit B): players' rating errors are treated as independent; shared players cancel.
  function chanceBetter(R, A, B, side, man) {
    if (side === 'off') {
      const a = offUnit(R, A, man), b = offUnit(R, B, man), w = {};
      a.players.forEach(p => { w[p.j] = (w[p.j] || 0) + p.u; }); b.players.forEach(p => { w[p.j] = (w[p.j] || 0) - p.u; });
      const v = Object.entries(w).reduce((s, [j, x]) => s + x * x * offOf(R, j, man).v, 0) + (a.group !== b.group ? a.tvar + b.tvar : 0);
      const d = a.value - b.value; return v > 0 ? Phi(d / Math.sqrt(v)) : (d > 0 ? 1 : d < 0 ? 0 : 0.5);
    }
    const a = defUnit(R, A), b = defUnit(R, B), D = R.def, w = {};
    A.map(String).forEach(j => { w[j] = (w[j] || 0) + 1 / A.length; }); B.map(String).forEach(j => { w[j] = (w[j] || 0) - 1 / B.length; });
    // Lower value (goals allowed) is better. Linearized in each player's beaten rate and caused rate.
    const dRep = D.gb != null && D.gn != null && D.beatTeam != null ? D.repGoalShare * (D.gb - D.gn) / (D.beatTeam * D.gb + (1 - D.beatTeam) * D.gn) : 0;
    const dCt = D.ctRate ? D.ctShare / D.ctRate : 0;
    const v = Object.entries(w).reduce((s, [j, x]) => { const p = defOf(R, j); return s + x * x * (dRep * dRep * p.vr + dCt * dCt * p.vc); }, 0);
    const d = b.value - a.value; return v > 0 ? Phi(d / Math.sqrt(v)) : (d > 0 ? 1 : d < 0 ? 0 : 0.5);
  }

  // Lineup shape: { attack: [3], mids: [{ players: [3], share }], defense: [6: close D, LSM, SSDMs], goalie, fogo,
  // manUp: [6], manDown: [players] }. Any part may be missing; a missing part is the baseline's.
  function sixOf(R, L, man) {
    const lines = (L.mids && L.mids.length ? L.mids : [{ players: [], share: 1 }]), tot = lines.reduce((a, m) => a + (m.share ?? 1), 0) || 1;
    return lines.reduce((a, m) => a + (m.share ?? 1) / tot * offUnit(R, (L.attack || []).concat(m.players || []), man).value, 0);
  }
  // The engine changes for lineup L measured against baseline B. S is the built sheet (V3.sheet.build); it supplies
  // the faceoff model. Returns { sets, goalie, parts } where parts has each unit's value and the relative change.
  function toSets(R, L0, B, S) {
    const has = v => Array.isArray(v) ? v.length > 0 : v != null && v !== '';
    const L = Object.fromEntries(Object.entries(L0 || {}).filter(([, v]) => has(v))), sets = {}, parts = {};
    const rel = (k, a, b) => { const m = a > 0 && b > 0 ? a / b : 1; parts[k] = { lineup: a, baseline: b, m }; return m; };
    const six = rel('offense', sixOf(R, Object.assign({}, B, pick(L, ['attack', 'mids'])), null), sixOf(R, B, null));
    if (Math.abs(six - 1) > 1e-12) sets['wl.six'] = six;
    if (L.defense && has(B.defense)) { const m = rel('defense', defUnit(R, L.defense).value, defUnit(R, B.defense).value); if (Math.abs(m - 1) > 1e-12) sets['opp.six'] = m; }
    if (L.manUp && has(B.manUp)) { const m = rel('manUp', offUnit(R, L.manUp, 'Man-Up').value, offUnit(R, B.manUp, 'Man-Up').value); if (Math.abs(m - 1) > 1e-12) sets['wl.emo'] = m; }
    if (L.manDown && has(B.manDown)) { const m = rel('manDown', defUnit(R, L.manDown).value, defUnit(R, B.manDown).value); if (Math.abs(m - 1) > 1e-12) sets['opp.emo'] = m; }
    if (L.fogo && S && String(L.fogo) !== String(B.fogo)) {
      // His head-to-head row against their FOGOs (their usage), moved onto the sheet's chance on the log-odds scale from the
      // baseline FOGO's row, so the sheet's logged-draw blend is kept.
      const fm = S.faceoffs && S.faceoffs.model, ours = (S.faceoffs && S.faceoffs.ours) || [], ix = j => ours.findIndex(o => String(o.j) === String(j));
      const row = i => fm.M[i].reduce((a, c, j) => a + fm.tShare[j] * c.p, 0), i = ix(L.fogo), b = ix(B.fogo);
      if (fm && fm.M && fm.M.length && i >= 0 && b >= 0) { const p = unlogit(logit(S.base.fo) + logit(row(i)) - logit(row(b))); parts.fogo = { lineup: p, baseline: S.base.fo, rows: [row(i), row(b)] }; sets.fo = p; }
      else parts.fogo = { lineup: null, baseline: S.base.fo, note: 'no faceoff record for #' + (i < 0 ? L.fogo : B.fogo) + ' in the faceoff model' };
    }
    return { sets, goalie: L.goalie != null && String(L.goalie) !== String(B.goalie) ? String(L.goalie) : null, parts };
  }
  // A starting lineup from the logs alone (step 2 makes it editable): by position, the players in the most logged lineup
  // records, then the most possessions used (offense) or logged defensive entries (defense); the sheet's FOGO and goalie. Midfield lines split time equally until a coach sets it. Positions: A, M, S (SSDM), L (LSM), D, F, G.
  function defaultLineup(R, S) {
    const main = R.pos.main, byPos = c => Object.keys(main).filter(j => main[j] === c);
    const oF = (R.onField || {}).off || {}, dF = (R.onField || {}).def || {};
    const offN = j => [oF[j] || 0, (R.off.players[j] || {}).U || 0], defN = j => { const d = R.def.players[j]; return [dF[j] || 0, d ? d.reps + d.ct : 0]; };
    const top = (c, k, f) => byPos(c).sort((a, b) => { const x = f(a), y = f(b); return y[0] - x[0] || y[1] - x[1] || +a - +b; }).slice(0, k);
    const mids = top('M', 9, offN), lines = [0, 1, 2].map(i => mids.slice(3 * i, 3 * i + 3)).filter(l => l.length === 3);
    const fm = S && S.faceoffs && S.faceoffs.model, ours = (S && S.faceoffs && S.faceoffs.ours) || [];
    const attack = top('A', 3, offN), defense = top('D', 3, defN).concat(top('L', 1, defN), top('S', 2, defN));
    return { attack, mids: lines.map(p => ({ players: p, share: 1 })), defense,
      fogo: fm && fm.M && fm.M.length && ours[fm.main] ? String(ours[fm.main].j) : null, goalie: S && S._ctx ? S._ctx.goalie : null,
      manUp: attack.concat(lines[0] || []), manDown: defense.slice() };
  }
  const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] != null).map(k => [k, o[k]]));

  // Goals per 100 settled possessions for us and for them in the sheet's batch, then each lineup's: baseline x multiplier.
  function per100(S, parts) {
    const c = S._ctx; if (!c || !c.bt) return null;
    const settled = (b, t) => (b.goals[t]['no pick'] || 0) + (b.goals[t].pick || 0), poss = (b, t) => (b.kinds[t]['no pick'] || 0) + (b.kinds[t].pick || 0);
    const sum = f => c.bt.reduce((a, b) => a + f(b), 0);
    const ours = 100 * sum(b => settled(b, 0)) / (sum(b => poss(b, 0)) || 1), theirs = 100 * sum(b => settled(b, 1)) / (sum(b => poss(b, 1)) || 1);
    return { ours, theirs, oursLineup: ours * ((parts.offense && parts.offense.m) || 1), theirsLineup: theirs * ((parts.defense && parts.defense.m) || 1) };
  }
  // Win chance with lineup L instead of baseline B, on the sheet's own batch size and seed (common random numbers).
  function simulate(S, R, L, B, games) {
    const c = S._ctx; if (!c) throw new Error('sheet context missing');
    const T = toSets(R, L, B, S), P = T.goalie ? c.withGoalie(T.goalie) : c.P, n = games || c.tn;
    const w = V3.winPct(V3.runBatch(P, n, c.seed, Object.keys(T.sets).length ? T.sets : undefined));
    return { win: w, baseWin: c.BT, sets: T.sets, goalie: T.goalie, parts: T.parts, per100: per100(S, T.parts), games: n };
  }

  // Lineups step 2: one-player swaps. Units: 'attack', 'mid0'..'mid2', 'defense', 'manUp', 'manDown', 'fogo', 'goalie'.
  const clone = L => JSON.parse(JSON.stringify(L));
  const unitPlayers = (L, u) => u === 'attack' ? L.attack : /^mid\d$/.test(u) ? ((L.mids || [])[+u.slice(3)] || {}).players : L[u];
  function swapIn(L, u, slot, j) {
    const X = clone(L);
    if (u === 'fogo' || u === 'goalie') { X[u] = j == null ? null : String(j); return X; }
    const arr = unitPlayers(X, u); arr[slot] = String(j); return X;
  }
  // Each player's weight in the lineup's settled-offense value (attack plays every line; each line by its share), for
  // the chance-better error. Together terms are left out of the error.
  function offWeights(R, L, man) {
    const w = {}, lines = L.mids && L.mids.length ? L.mids : [{ players: [], share: 1 }], tot = lines.reduce((a, m) => a + (m.share ?? 1), 0) || 1;
    lines.forEach(m => offUnit(R, (L.attack || []).concat(m.players || []), man).players.forEach(p => { w[p.j] = (w[p.j] || 0) + (m.share ?? 1) / tot * p.u; }));
    return w;
  }
  // Chance lineup A beats lineup B on one part ('offense' | 'defense' | 'manUp' | 'manDown'), from sample sizes only.
  function chanceBetterPart(R, A, B, part) {
    if (part === 'defense' || part === 'manDown') return chanceBetter(R, A[part], B[part], 'def');
    if (part === 'manUp') return chanceBetter(R, A.manUp, B.manUp, 'off', 'Man-Up');
    const wa = offWeights(R, A), wb = offWeights(R, B), w = Object.assign({}, wa);
    Object.entries(wb).forEach(([j, x]) => { w[j] = (w[j] || 0) - x; });
    const tv = L => { const lines = L.mids && L.mids.length ? L.mids : [{ players: [], share: 1 }], tot = lines.reduce((a, m) => a + (m.share ?? 1), 0) || 1;
      return lines.map(m => { const u = offUnit(R, (L.attack || []).concat(m.players || [])); return { g: u.group, v: ((m.share ?? 1) / tot) ** 2 * u.tvar }; }); };
    const ta = tv(A), tb = tv(B), gs = x => new Set(x.filter(t => t.g).map(t => t.g));
    const ga = gs(ta), gb = gs(tb), tsum = ta.filter(t => t.g && !gb.has(t.g)).concat(tb.filter(t => t.g && !ga.has(t.g))).reduce((a, t) => a + t.v, 0);
    const v = Object.entries(w).reduce((s2, [j, x]) => s2 + x * x * offOf(R, j).v, 0) + tsum, d = sixOf(R, A) - sixOf(R, B);
    return v > 0 ? Phi(d / Math.sqrt(v)) : (d > 0 ? 1 : d < 0 ? 0 : 0.5);
  }
  const partOf = u => u === 'attack' || /^mid\d$/.test(u) ? 'offense' : u;
  // Best one-player swaps for unit u of lineup L. pool: candidate jerseys, or slot => jerseys. Offense and defense swaps are ranked by the
  // rating (closed form), and the best `sim` are played on the sheet's games against B (common random numbers).
  // FOGO and goalie candidates are all played. Returns rows sorted by win chance.
  function swaps(S, R, L, B, u, pool, opts) {
    opts = Object.assign({ sim: 3, games: null }, opts || {});
    const cur = LU_sim(S, R, L, B, opts.games), rows = [], part = partOf(u);
    // A midfield line with no time, or a special unit the baseline doesn't have, can't change anything: no swaps.
    if (/^mid\d$/.test(u)) { const m = (L.mids || [])[+u.slice(3)]; if (!m || !((m.share ?? 1) > 0)) return { current: cur, rows }; }
    if ((u === 'manUp' || u === 'manDown' || u === 'defense') && !(B[u] && B[u].length)) return { current: cur, rows };
    if (u === 'fogo' || u === 'goalie') {
      (pool || []).map(String).filter(j => j !== String(L[u])).forEach(j => { const X = swapIn(L, u, 0, j), r = LU_sim(S, R, X, B, opts.games); rows.push({ unit: u, slot: 0, out: L[u] == null ? null : String(L[u]), in: j, win: r.win, dWin: r.win - cur.win, chance: null, lineup: X }); });
    } else {
      const now = unitPlayers(L, u) || [], used = new Set(u === 'attack' || /^mid\d$/.test(u) ? (L.attack || []).concat(...(L.mids || []).map(m => m.players || [])).map(String) : now.map(String));
      const val = X => { const p = toSets(R, X, B, S).parts[part]; return p ? p.m : 1; }, v0 = val(L), better = part === 'defense' || part === 'manDown' ? -1 : 1;
      const cands = [];
      const poolOf = slot => (typeof pool === 'function' ? pool(slot) : pool) || [];
      now.forEach((out, slot) => poolOf(slot).map(String).filter(j => !used.has(j)).forEach(j => { const X = swapIn(L, u, slot, j); cands.push({ unit: u, slot, out: String(out), in: j, m: val(X), lineup: X }); }));
      cands.forEach(c => { c.gain = better * (c.m - v0); });
      cands.sort((a, b) => b.gain - a.gain || +a.in - +b.in);
      cands.slice(0, opts.sim).forEach(c => { const r = LU_sim(S, R, c.lineup, B, opts.games); rows.push(Object.assign(c, { win: r.win, dWin: r.win - cur.win, chance: chanceBetterPart(R, c.lineup, L, part) })); });
    }
    rows.sort((a, b) => b.win - a.win || +a.in - +b.in);
    return { current: cur, rows };
  }
  const LU_sim = (S, R, L, B, games) => simulate(S, R, L, B, games);
  // Midfield time shares as percents. Line k gets v% (0-100) and is marked as set by the coach. Lines the coach hasn't
  // set split what's left in their current proportions (equally if they all had none). If the set lines add to more
  // than what's left, they're scaled down to fit and the unset lines get none. Returns null if no line would have time.
  function setShare(mids, k, v) {
    v = Math.max(0, Math.min(100, Math.round(v))); const M = mids.map(m => Object.assign({}, m)), others = M.map((m, i) => i).filter(i => i !== k);
    if (!others.length) return v === 0 ? null : (M[k].share = 100, M[k].set = true, M);
    M[k].share = v; M[k].set = true;
    const fixed = others.filter(i => M[i].set), free = others.filter(i => !M[i].set), left = 100 - v;
    const fixedSum = fixed.reduce((a, i) => a + M[i].share, 0);
    if (fixedSum > left || !free.length) { const f = fixedSum > 0 ? left / fixedSum : 0; fixed.forEach(i => { M[i].share *= f; }); free.forEach(i => { M[i].share = 0; });
      if (!free.length && fixedSum === 0) fixed.forEach(i => { M[i].share = left / fixed.length; }); }
    else { const rest = left - fixedSum, tot = free.reduce((a, i) => a + (M[i].share ?? 1), 0); free.forEach(i => { M[i].share = tot > 0 ? rest * (M[i].share ?? 1) / tot : rest / free.length; }); }
    return M.some(m => m.share > 0) ? M : null;
  }
  V3.lineups = { LK, ratings, defaultLineup, swaps, setShare, swapIn, chanceBetterPart, offWeights, offOf, defOf, offUnit, defUnit, chanceBetter, toSets, simulate, per100, posMap };
})(globalThis);

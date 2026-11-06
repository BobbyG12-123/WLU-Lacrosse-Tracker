// W&L Matchup Studio: replay built only from a game's event ledger. Motion is a schematic reconstruction of simulated actions: it isn't
// tracking data and it doesn't predict where players stand. Off-ball actions (dodges, cuts, picks) are illustrations, not simulated events and
// not tactical evidence. It can't change results and uses none of the engine's random streams; variation comes from its own hash stream.
//
// Movement: every player has persistent position, velocity, heading, role, purpose and target, steered at a fixed 20 updates per second.
// Each has their own reaction delay, speed, acceleration and rhythm. The whole path is computed once when a game loads, so seeking lands on the correct
// state, and rendering only interpolates between updates: playback speed, pause and seek can't skip a step or change anything.
// Every speed and acceleration here is a rendering assumption, not a player rating.
(function (g) {
  const MS = g.MS = g.MS || {};
  // Field in yards, per Rule 1: 110 x 60, restraining lines 20 yards from each goal line and 20 from the center line, so goal lines at 15 and 95.
  const FIELD = Object.freeze({ L: 110, W: 60, goalL: 15, goalR: 95, restrainL: 35, restrainR: 75, mid: 55, crease: 3, boxW: 40, wingY: 20, wingX: 10, goalW: 2 });
  const DT = 0.05, BREAK_SEC = 14, GOAL_PAUSE = 7, PASS_SPEED = 32, SHOT_SPEED = 44;   // rendering only: seconds of display-only dead ball, and yards per second. The game clock is frozen during both pauses.
  const PURPOSES = ['hold', 'carry', 'dodge', 'cut', 'screen', 'support', 'space', 'transition', 'defend', 'on-ball', 'recover', 'ride', 'loose', 'goalie', 'sub', 'set'];
  const PU = Object.fromEntries(PURPOSES.map((x, i) => [x, i]));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), hash = (s, n) => (MS.hash32(String(s), n >>> 0) >>> 0) / 4294967296;
  // Role areas: x is yards from the goal being attacked (negative = behind it), y from the field center.
  const OFF = [[0, 15], [0, -15], [-9, 2], [11, 17], [16, 1], [11, -17]], DEFEND_HOLD = [[48, 12], [50, 0], [48, -12]], ATT_HOLD = [[30, 14], [33, 0], [30, -14]];
  const dirOf = (team, period) => { const odd = period % 2 === 1; return team === 0 ? (odd ? 1 : -1) : (odd ? -1 : 1); };
  const goalX = (team, period) => (dirOf(team, period) > 0 ? FIELD.goalR : FIELD.goalL);   // the goal this team attacks; teams change ends each period (Rule 4-25)
  const fromGoal = (team, period, x, y) => { const d = dirOf(team, period); return { x: goalX(team, period) - d * x, y: FIELD.W / 2 + y }; };
  function labelFor(id) { return id === MS.TEAM ? 'Team' : `#${id}`; }
  function describe(e, names) {
    const who = (t, id) => `${names.teams[t]}${id && id !== MS.TEAM ? ` ${labelFor(id)}` : ''}`;
    switch (e.type) {
      case 'period_start': return e.overtime ? `Overtime period ${e.period - 4} starts` : `Quarter ${e.period} starts`;
      case 'period_end': return e.reason === 'horn' ? `End of ${e.period > 4 ? `OT${e.period - 4}` : `Q${e.period}`}` : 'Game ends';
      case 'faceoff': return `Faceoff won by ${who(e.winner, e.fw)}`;
      case 'clear': return `${names.teams[e.team]} ${e.ok ? 'clears' : 'fails to clear'}`;
      case 'shot': { const o = { goal: 'GOAL', save: 'saved', pipe: 'off the pipe', wide: 'wide', blocked: 'blocked' }[e.outcome]; return `${who(e.team, e.shooter)} shot: ${o}${e.assist ? (e.assist === MS.TEAM ? ', assisted' : `, assist ${labelFor(e.assist)}`) : ''}${e.extraMan ? ' (extra man)' : ''}`; }
      case 'retained': return `${names.teams[e.team]} keeps the ball`;
      case 'turnover': { const why = { play: 'turnover', failed_clear: 'failed clear', shot_clock: 'shot clock violation', foul: 'foul with the ball' }[e.reason]; return `${who(e.team, e.player)}: ${why}${e.causedBy ? (e.causedBy === MS.TEAM ? `, caused by ${names.teams[1 - e.team]}` : `, caused by ${labelFor(e.causedBy)}`) : ''}`; }
      case 'penalty': return `Penalty on ${who(e.team, e.player)}: ${e.ds ? `${e.ds / 10}s` : 'possession only'}`;
      case 'penalty_end': return e.reason === 'goal' ? `${names.teams[e.team]} released by the goal` : `${names.teams[e.team]} penalty ends`;
      case 'game_end': return `Final: ${names.teams[0]} ${e.score[0]}, ${names.teams[1]} ${e.score[1]}`;
      default: return null;
    }
  }

  function buildReplay(ledger, P, names) {
    const shift = new Float64Array(ledger.length); { let off = 0, afterGoal = false; ledger.forEach((e, n) => { if (afterGoal && (e.type === 'lineup' || e.type === 'faceoff' || e.type === 'period_start')) { off += GOAL_PAUSE; afterGoal = false; } if (e.type === 'period_start' && e.period > 1) off += BREAK_SEC; shift[n] = off; if (e.type === 'shot' && e.outcome === 'goal') afterGoal = true; }); }
    const tOf = e => e.t / 10 + shift[e.seq], end = ledger[ledger.length - 1], duration = tOf(end) + 3;
    const R = [0, 1].map(i => P.teams[i].rotation), teamLevel = i => !R[i].attack.length && !R[i].lines.length;
    const generic = i => Array.from({ length: 10 }, (_, k) => `${i}:${k}`);
    // The on-field roster comes from the ledger. Ten slots per team: 0 goalie, 1-3 close defense or holding defenders, 4-6 midfield or short-stick unit, 7-9 attack.
    const slotsFor = (i, offense, acting, fogo) => {
      if (teamLevel(i)) return generic(i);
      const r = R[i], unit = acting && acting.length ? acting : [], goalie = r.goalie || MS.TEAM, att = r.attack, close = r.defense.slice(0, 3), d = r.defense;
      if (fogo) { const mids = unit.filter(j => !att.includes(j) && j !== fogo); return [goalie, close[0], close[1], close[2], fogo, mids[0], mids[1], att[0], att[1], att[2]]; }
      if (offense) { const mids = unit.filter(j => !att.includes(j)); return [goalie, close[0], close[1], close[2], mids[0], mids[1], mids[2], att[0], att[1], att[2]]; }
      return [goalie, d[0], d[1], d[2], d[3], d[4], d[5], att[0], att[1], att[2]];
    };
    // ---- segments: one phase of play between ledger moments ----
    const segs = []; let cur = { start: 0, phase: 'dead', off: null, period: 1 }, lineups = [[], []], fogoNow = [null, null];
    const stamp = () => { cur.slots = [0, 1].map(i => slotsFor(i, cur.off === i, lineups[i], cur.phase === 'faceoff' ? fogoNow[i] : null)); };
    const openSeg = (t, phase, off, period) => { cur.end = t; if (cur.end > cur.start || !segs.length) { if (!cur.slots) stamp(); segs.push(cur); } cur = { start: t, phase, off, period }; stamp(); };
    const penaltyLog = [], rosterF = i => R[i].fogo || [];
    for (let k = 0; k < ledger.length; k++) {
      const e = ledger[k], t = tOf(e);
      if (e.type === 'period_start') openSeg(t - (e.period > 1 ? BREAK_SEC : 0), 'faceoff', null, e.period);
      else if (e.type === 'lineup') { lineups[e.team] = e.players; if (cur.phase === 'faceoff') { const f = e.players.find(j => rosterF(e.team).some(x => x.id === j)); if (f) { fogoNow[e.team] = f; stamp(); } } }
      else if (e.type === 'possession_start') { let clearing = false; for (let n = k + 1; n < ledger.length && ledger[n].type !== 'possession_end'; n++) if (ledger[n].type === 'clear') { clearing = true; break; } openSeg(t, clearing ? 'transition' : 'settled', e.team, e.period); }
      else if (e.type === 'clear') { if (e.ok) openSeg(t, 'settled', e.team, e.period); }
      else if (e.type === 'loose_ball') openSeg(t, 'loose', e.team, e.period);
      else if (e.type === 'retained' || e.type === 'restart') openSeg(t, 'settled', e.team, e.period);
      else if (e.type === 'possession_end') { if (e.reason === 'goal' || e.reason === 'period_end') openSeg(t, e.reason === 'goal' ? 'faceoff' : 'dead', null, e.period); }
      else if (e.type === 'penalty_start') penaltyLog.push({ team: e.team, id: e.penaltyId, player: e.player, start: t, end: Infinity });
      else if (e.type === 'penalty_end') { const p = penaltyLog.find(x => x.team === e.team && x.id === e.penaltyId); if (p) p.end = t; }
    }
    cur.end = duration; if (!cur.slots) stamp(); segs.push(cur);
    segs.forEach(s => { s.maps = s.slots.map(sl => { const m = new Map(); sl.forEach((id, n) => { if (id && !m.has(id)) m.set(id, n); }); return m; }); });
    const segAt = t => { let lo = 0, hi = segs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].start <= t) lo = m; else hi = m - 1; } return lo; };
    const looseAt = seg => { const per = seg.period, off = seg.off, gx = goalX(off, per), d = dirOf(off, per); return { x: gx + d * (hash(seg.start, 41) * 8 - 2), y: FIELD.W / 2 + (hash(seg.start, 43) - 0.5) * 22 }; };

    // ---- the ball is planned first, because players react to it. Positions are filled in once movement is computed. ----
    const plan = [], events = [], scores = [], shotsBy = {}, goalieCues = [[], []], catches = [], tok = {}; let holder = null, holdFrom = 0, score = [0, 0], lastT = 0;
    const carry = t1 => { if (holder && t1 > holdFrom) plan.push({ t0: holdFrom, t1, kind: 'carry', team: holder.team, id: holder.id }); holder = null; };
    const take = (team, id, t) => { holder = { team, id }; holdFrom = t; };
    const fly = (t0, t1, to, arc, extra) => { plan.push(Object.assign({ t0, t1, kind: 'fly', to, arc }, extra)); holdFrom = t1; };
    const idOf = (seg, team, want, salt) => { if (want && want !== MS.TEAM && seg.maps[team].has(want)) return want; const pool = seg.slots[team].slice(4).filter(Boolean); return pool[Math.floor(hash(salt, 17) * pool.length)] || seg.slots[team][0]; };
    const passes = (team, target, passer, t0, t1, key, seg) => {   // illustrate ball movement between ledger moments; the last goes to the shooter, from the credited passer when there is one
      if (t1 - t0 < 3 || !holder || holder.team !== team) return; const n = Math.min(5, Math.floor((t1 - t0) / 5.5));
      for (let m = 1; m <= n; m++) { const last = m === n, pool = seg.slots[team].slice(4).filter(Boolean), want = last ? (passer || target) : pool[Math.floor(hash(`${key}:${m}`, 29) * pool.length)]; if (!want || want === holder.id) continue; const rel = t0 + (t1 - t0) * (m / (n + 1)) + (hash(`${key}:${m}`, 31) - 0.5) * 0.8, from = holder.id; carry(rel); fly(rel, rel + 0.6, { id: want, team }, 1.5, { pass: true, from: { id: from, team } }); take(team, want, rel + 0.6); }
    };
    for (const e of ledger) {
      const t = tOf(e), seg = segs[segAt(Math.max(0, t - 0.01))], line = describe(e, names);
      if (line) events.push({ t, type: e.type, text: line, period: e.period, left: e.left, goal: e.type === 'shot' && e.outcome === 'goal' });
      if (e.type === 'faceoff') { carry(t); if (t - holdFrom > 0.3) fly(Math.max(holdFrom + 0.3, t - 3.5), t - 0.2, { x: FIELD.mid, y: FIELD.W / 2 }, 0.2, {}); const id = idOf(seg, e.winner, e.fw, e.seq); fly(t, t + 0.45, { id, team: e.winner }, 0.7, { fromPt: { x: FIELD.mid, y: FIELD.W / 2 } }); take(e.winner, id, t + 0.45); lastT = t; }
      else if (e.type === 'shot') {
        const shooter = idOf(seg, e.team, e.shooter, e.seq), passer = e.assist && e.assist !== MS.TEAM && e.assist !== shooter ? e.assist : null;
        passes(e.team, shooter, passer, Math.max(lastT, holdFrom), t - 1.8, e.seq, seg);
        const rel = Math.max(holdFrom + 0.01, t - 0.75);
        if (!holder || holder.team !== e.team || holder.id !== shooter) { const from = holder ? holder.id : null, ht = holder ? holder.team : null, st = Math.max(holdFrom, rel - 0.6); carry(st); fly(st, rel, { id: shooter, team: e.team }, 1.2, Object.assign({ pass: true }, from ? { from: { id: from, team: ht } } : {})); take(e.team, shooter, rel); }
        carry(rel); (shotsBy[`${shooter}|${e.team}`] = shotsBy[`${shooter}|${e.team}`] || []).push(rel);
        const gx = goalX(e.team, e.period), d = dirOf(e.team, e.period), spread = e.outcome === 'wide' ? 9 : e.outcome === 'blocked' ? 0 : 1.6, yy = FIELD.W / 2 + (hash(e.seq, 23) - 0.5) * spread;
        const to = e.outcome === 'wide' ? { x: gx + d * 9, y: yy } : e.outcome === 'blocked' ? { blockedFrom: shooter, team: e.team, gx, y: FIELD.W / 2 } : { x: gx + d * 0.3, y: yy };
        fly(rel, t, to, 0.3, { shot: e.outcome, from: { id: shooter, team: e.team } });
        if (e.outcome !== 'blocked' && e.outcome !== 'wide') goalieCues[1 - e.team].push({ t0: rel - 0.1, t1: t + 0.5, y: yy, outcome: e.outcome });
        lastT = t;
        if (e.outcome === 'goal') { score = score.slice(); score[e.team]++; scores.push({ t, score: score.slice() }); }
      }
      else if (e.type === 'loose_ball') { const L = looseAt(segs[segAt(t)]); fly(t, t + Math.min(0.5, e.ds / 10), { x: L.x, y: L.y }, 1.1, {}); }
      else if (e.type === 'possession_start' && e.source !== 'faceoff') { const o = segs[segAt(t)]; let id; if (e.source === 'goalie_save') id = o.slots[e.team][0]; else { id = `?p${e.seq}`; catches.push({ t, token: id, team: e.team }); } if (!holder || holder.team !== e.team) { carry(t); fly(t, t + 0.45, { id, team: e.team }, 0.9, {}); take(e.team, id, t + 0.45); } lastT = t; }
      else if (e.type === 'retained') { const id = `?r${e.seq}`; catches.push({ t, token: id, team: e.team }); carry(t); fly(t, t + 0.35, { id, team: e.team }, 0.6, {}); take(e.team, id, t + 0.35); lastT = t; }
      else if (e.type === 'turnover' && holder && holder.team === e.team) { const want = idOf(seg, e.team, e.player, `to${e.seq}`); passes(e.team, want, null, Math.max(lastT, holdFrom), t - 1, `t${e.seq}`, seg); lastT = t; }
      else if (e.type === 'period_end') { carry(t); fly(t, t + 1, { x: FIELD.mid, y: FIELD.W / 2 }, 0.4, {}); lastT = t; }
    }
    carry(duration);
    plan.sort((a, b) => a.t0 - b.t0);
    // ---- fixed-step movement ----
    const N = Math.ceil(duration / DT) + 1, ids = new Map(), Pl = [];
    const addId = (id, team) => { const k = `${team}|${id}`; if (!ids.has(k)) { ids.set(k, Pl.length); Pl.push({ k, id, team, x: 0, y: 0, vx: 0, vy: 0, heading: 0, on: false, seen: false, vis: false, tx: 0, ty: 0, purpose: 0, delay: 0.1 + 0.75 * hash(k, 2), top: 8.0 + 1.6 * hash(k, 1), jog: 4.2 + 1.6 * hash(k, 3), accel: 6.5 + 2.5 * hash(k, 4), cut: 3.2 + 3.6 * hash(k, 5), phase: 7 * hash(k, 6), reach: 2.5 + 3.5 * hash(k, 7), X: new Float32Array(N), Y: new Float32Array(N), H: new Float32Array(N), V: new Uint8Array(N), U: new Uint8Array(N) }); } return ids.get(k); };
    segs.forEach(s => [0, 1].forEach(i => s.slots[i].forEach(id => { if (id) addId(id, i); })));
    const subSpot = (i, k) => ({ x: FIELD.mid + (i === 0 ? -1 : 1) * (1 + 4 * hash(k, 8)), y: FIELD.W + 1.2 });   // the 10-yard substitution area
    const penaltySpot = i => ({ x: FIELD.mid + (i === 0 ? -1.5 : 1.5), y: FIELD.W + 2.6 });
    const anchorFor = (seg, i, s) => {
      const per = seg.period;
      if (s === 0) return { x: goalX(1 - i, per) + dirOf(i, per) * 1.8, y: FIELD.W / 2 };
      if (seg.phase === 'faceoff' || seg.phase === 'dead') { const m = -dirOf(i, per); if (s === 4) return { x: FIELD.mid + m * 1.4, y: FIELD.W / 2 }; if (s === 5 || s === 6) return { x: FIELD.mid + m * 2.4, y: s === 5 ? 8 : FIELD.W - 8 }; if (s <= 3) return fromGoal(i, per, 66, [-13, 1, 15][s - 1]); return fromGoal(i, per, 12, [-16, -2, 12][s - 7]); }
      if (seg.off === i) { if (s <= 3) { const h = DEFEND_HOLD[s - 1]; return fromGoal(i, per, h[0], h[1]); } const b = OFF[s >= 7 ? s - 7 : s - 1]; return seg.phase === 'transition' ? fromGoal(i, per, b[0] + 26 + 3 * s, b[1] * 1.2) : fromGoal(i, per, b[0], b[1]); }
      if (s >= 7) { const h = ATT_HOLD[s - 7]; return fromGoal(i, per, h[0], h[1]); }
      return null;   // marks an opponent
    };
    const start = segs[0]; [0, 1].forEach(i => start.slots[i].forEach((id, s) => { if (!id) return; const p = Pl[ids.get(`${i}|${id}`)], a = anchorFor(start, i, s); p.x = a.x; p.y = a.y; p.on = true; p.seen = true; p.vis = true; p.heading = dirOf(i, 1) > 0 ? 0 : Math.PI; }));
    const holderAt = new Int32Array(N).fill(-1), carrySpans = {}, pts = plan.filter(b => b.kind === 'fly' && b.to.x !== undefined).map(b => ({ t: b.t1, x: b.to.x, y: b.to.y })); let ptIx = 0, catchIx = 0, ballEst = { x: FIELD.mid, y: FIELD.W / 2 };
    const fillCarry = (b, h) => { const a = Math.max(0, Math.floor(b.t0 / DT)), z = Math.min(N - 1, Math.ceil(b.t1 / DT)); for (let n = a; n <= z; n++) holderAt[n] = h; };
    plan.forEach(b => { if (b.kind !== 'carry') return; if (String(b.id).startsWith('?')) (carrySpans[b.id] = carrySpans[b.id] || []).push(b); else { const h = ids.get(`${b.team}|${b.id}`); if (h !== undefined) fillCarry(b, h); } });
    const shotsOf = Pl.map(p => (shotsBy[`${p.id}|${p.team}`] || []).slice().sort((a, b) => a - b)), shotIx = Pl.map(() => 0);
    const serving = (i, t) => penaltyLog.filter(p => p.team === i && p.start <= t && t < p.end);
    // A schematic pick: in a longer settled spell, one attacker sets a spot near the carrier's defender and the carrier uses it.
    const pickFor = seg => { if (seg.pick !== undefined) return seg.pick; seg.pick = null; if (seg.phase === 'settled' && seg.end - seg.start > 11 && hash(seg.start, 61) < 0.6) { const pool = seg.slots[seg.off].slice(4).filter(Boolean); seg.pick = { t0: seg.start + 3 + 3 * hash(seg.start, 62), dur: 3.6, who: pool[Math.floor(hash(seg.start, 63) * pool.length)], spot: null }; } return seg.pick; };
    for (let n = 0; n < N; n++) {
      const t = n * DT, segNow = segs[segAt(t)], hid = [new Set(), new Set()];
      if (holderAt[n] >= 0) { const h = Pl[holderAt[n]]; ballEst = { x: h.x, y: h.y }; } while (ptIx < pts.length && pts[ptIx].t <= t) { ballEst = pts[ptIx]; ptIx++; }
      // A loose ball or a change of possession goes to whoever on that team is nearest, among players in the event log's on-field roster.
      while (catchIx < catches.length && catches[catchIx].t <= t) { const c = catches[catchIx++], sg = segs[segAt(c.t)]; let best = null, bd = Infinity; sg.slots[c.team].forEach((id, sl) => { if (!id || sl === 0) return; const q = Pl[ids.get(`${c.team}|${id}`)], dd = Math.hypot(q.x - ballEst.x, q.y - ballEst.y) + (q.vis ? 0 : 40); if (dd < bd) { bd = dd; best = id; } }); tok[c.token] = best || sg.slots[c.team][0]; const h = ids.get(`${c.team}|${tok[c.token]}`); (carrySpans[c.token] || []).forEach(b => { b.id = tok[c.token]; fillCarry(b, h); }); }
      const holderIx = holderAt[n], ballCarrier = holderIx >= 0 ? Pl[holderIx] : null;
      [0, 1].forEach(i => { let sp = 9; serving(i, t).forEach(pn => { if (pn.player !== MS.TEAM) { const j = ids.get(`${i}|${pn.player}`); if (j !== undefined) hid[i].add(j); } else { while (sp >= 4) { const id = segNow.slots[i][sp], j = id ? ids.get(`${i}|${id}`) : undefined; sp--; if (j !== undefined && j !== holderIx && !hid[i].has(j)) { hid[i].add(j); break; } } } }); });
      const looseGo = segNow.phase === 'loose' ? (() => { const L = looseAt(segNow); return [0, 1].map(i => { const gk = segNow.slots[i][0]; return Pl.filter(p => p.team === i && p.on && p.vis && p.id !== gk).map(p => ({ p, d: Math.hypot(p.x - L.x, p.y - L.y) })).sort((a, b) => a.d - b.d).slice(0, 2).map(x => x.p); }); })() : null;
      for (let pi = 0; pi < Pl.length; pi++) {
        const p = Pl[pi], i = p.team, hidden = hid[i].has(pi), rosterSlot = segNow.maps[i].has(p.id) ? segNow.maps[i].get(p.id) : -1, active = rosterSlot >= 0 && !hidden, lagged = segs[segAt(Math.max(0, t - p.delay))], seg = lagged.maps[i].has(p.id) ? lagged : segNow, s = seg.maps[i].has(p.id) ? seg.maps[i].get(p.id) : rosterSlot;   // the roster follows the ledger exactly; only reactions lag
        // Entries and exits go through the substitution area, and identities stay with the player. A penalized player goes to the table.
        if (active && !p.on) { if (!p.vis) { const q = subSpot(i, `${p.k}:${n}`); p.x = q.x; p.y = q.y; p.vx = 0; p.vy = 0; } p.on = true; p.seen = true; p.vis = true; }
        if (!active) p.on = false;
        if (!p.vis) { p.X[n] = p.x; p.Y[n] = p.y; p.H[n] = p.heading; p.V[n] = 0; p.U[n] = PU.sub; continue; }
        let tx, ty, speed = p.jog, stopNear = 1.0, purpose = PU.space;
        if (!p.on) { const off = hidden ? penaltySpot(i) : subSpot(i, p.k); tx = off.x; ty = off.y; speed = p.jog + 1.2; purpose = PU.sub; if (Math.hypot(p.x - tx, p.y - ty) < 1.3) { p.vis = false; p.vx = 0; p.vy = 0; p.X[n] = p.x; p.Y[n] = p.y; p.H[n] = p.heading; p.V[n] = 0; p.U[n] = PU.sub; continue; } }
        else {
          const a = anchorFor(seg, i, s), set = seg.phase === 'faceoff' || seg.phase === 'dead', sprint = seg.phase === 'transition' || (set && a && Math.hypot(p.x - a.x, p.y - a.y) > 8), per = seg.period, gx = goalX(i, per), d = dirOf(i, per);
          if (s === 0) {
            // Goalie: tracks the ball on the arc, then steps to the shot.
            purpose = PU.goalie; const by = ballCarrier ? ballCarrier.y : FIELD.W / 2, ownGoal = goalX(1 - i, per), q = goalieCues[i].find(c => t >= c.t0 && t <= c.t1); ty = FIELD.W / 2 + (q ? clamp((q.y - FIELD.W / 2) * 1.0 + (q.outcome === 'goal' ? (q.y >= FIELD.W / 2 ? -0.7 : 0.7) : 0), -1.6, 1.6) : clamp((by - FIELD.W / 2) * 0.1, -1.7, 1.7)); tx = ownGoal + d * (1.3 + (q ? 0.6 : 0.4)); speed = q ? 6 : 3.2; stopNear = 0.1;
          } else if (set) { tx = a.x; ty = a.y; speed = sprint ? p.top * 0.82 : p.jog; purpose = PU.set; stopNear = 0.5; }
          else if (seg.off === i && s >= 4) {
            const k = Math.floor((t + p.phase) / p.cut), frac = ((t + p.phase) % p.cut) / p.cut, b = hash(`${p.k}:${k}:${seg.start}`, 51), pk = pickFor(seg), inPick = pk && t >= pk.t0 && t < pk.t0 + pk.dur;
            if (seg.phase === 'transition') { tx = a.x + (hash(p.k, 65) - 0.5) * 6; ty = a.y + (hash(p.k, 66) - 0.5) * 6; speed = p.top; purpose = PU.transition; }
            else if (pi === holderIx) {
              const L = shotsOf[pi]; let ix = shotIx[pi]; while (ix < L.length && L[ix] < t) ix++; shotIx[pi] = ix; const until = ix < L.length ? L[ix] - t : Infinity;
              if (until < 3.4) {
                // Dodge: approach to one side, plant, then drive the other way toward a shooting spot.
                purpose = PU.dodge; const side = hash(L[ix], 67) < 0.5 ? 1 : -1, yNow = p.y - FIELD.W / 2, near = Math.abs(gx - p.x) + 0, wantDist = clamp(near - 3, 10, 18);
                if (until > 1.3) { tx = gx - d * (wantDist + 3); ty = FIELD.W / 2 + clamp(yNow + side * 7, -17, 17); speed = p.jog + 1.5; } else { tx = gx - d * Math.max(9, wantDist - 4); ty = FIELD.W / 2 + clamp(yNow - side * 8, -14, 14); speed = p.top * 0.95; }
              } else if (inPick && pk.spot) { purpose = PU.carry; const o = pk.spot, across = o.y >= FIELD.W / 2 ? -1 : 1; tx = o.x + (gx - o.x) * 0.12; ty = o.y + across * 6; speed = p.jog + 1.5; }
              else { purpose = PU.carry; const ang = 6.283 * hash(`${p.k}:${k}`, 53); tx = a.x + Math.cos(ang) * p.reach * 1.2; ty = a.y + Math.sin(ang) * p.reach * 1.2; if (Math.abs(a.x - gx) < 8 && Math.abs(tx - gx) < 3 && Math.abs(ty - FIELD.W / 2) < 4) ty += ty >= FIELD.W / 2 ? 4 : -4; speed = p.jog * (0.55 + 0.45 * hash(`${p.k}:${k}`, 54)); }
            }
            else if ((() => { const L = shotsOf[pi]; let ix = shotIx[pi]; while (ix < L.length && L[ix] < t) ix++; shotIx[pi] = ix; return ix < L.length && L[ix] - t < 3.2; })()) {
              // About to take the shot: cut to an open spot in front of the goal before the feed arrives.
              purpose = PU.cut; const L = shotsOf[pi], side = hash(L[shotIx[pi]], 71) - 0.5; tx = gx - d * (9 + 5 * Math.abs(side)); ty = FIELD.W / 2 + side * 22; speed = p.top * 0.92;
            }
            else if (inPick && pk.who === p.id && ballCarrier && ballCarrier.team === i) {
              // Screen: go to a spot beside the carrier, set it, then roll toward the goal.
              if (!pk.spot) { const to = gx - ballCarrier.x, yo = FIELD.W / 2 - ballCarrier.y, dd = Math.hypot(to, yo) || 1; pk.spot = { x: ballCarrier.x + (to / dd) * 4, y: ballCarrier.y + (yo / dd) * 4 }; }
              const rolling = t > pk.t0 + pk.dur * 0.68; tx = rolling ? pk.spot.x + (gx - pk.spot.x) * 0.45 : pk.spot.x; ty = rolling ? pk.spot.y + (FIELD.W / 2 - pk.spot.y) * 0.5 : pk.spot.y; speed = rolling ? p.top * 0.8 : p.jog + 1; stopNear = 0.25; purpose = PU.screen;
            }
            else if (b < 0.36) {
              // Cut: a destination near the crease, then recovery to the player's own area.
              purpose = PU.cut; const sideY = (hash(`${p.k}:${k}`, 55) < 0.5 ? -1 : 1) * (4.5 + 5 * hash(`${p.k}:${k}`, 56)), crease = { x: gx - d * (6.5 + 4 * hash(`${p.k}:${k}`, 58)), y: FIELD.W / 2 + sideY * 1.2 };
              if (frac < 0.5) { tx = crease.x; ty = crease.y; speed = p.top * 0.92; } else { tx = a.x; ty = a.y; speed = p.jog; }
            }
            else if (b < 0.62 && ballCarrier && ballCarrier.team === i && ballCarrier !== p) {
              // Support: an open angle to the ball.
              purpose = PU.support; const ang = Math.atan2(a.y - ballCarrier.y, a.x - ballCarrier.x) + (hash(`${p.k}:${k}`, 59) - 0.5) * 0.9, r = 11 + 4 * hash(`${p.k}:${k}`, 60); tx = ballCarrier.x + Math.cos(ang) * r; ty = ballCarrier.y + Math.sin(ang) * r; speed = p.jog;
            }
            else { purpose = PU.space; const ang = 6.283 * hash(`${p.k}:${k}`, 57), r = p.reach * (0.4 + 0.6 * hash(`${p.k}:${k}`, 64)); tx = a.x + Math.cos(ang) * r; ty = a.y + Math.sin(ang) * r; speed = p.jog * (0.55 + 0.45 * hash(`${p.k}:${k}`, 68)); }
            if (Math.abs(tx - gx) < 3.3 && Math.abs(ty - FIELD.W / 2) < 3.3) ty += ty >= FIELD.W / 2 ? 3.4 : -3.4;   // keep out of the crease
          }
          else if (a) {
            // Players holding their side of the midfield: an easy drift, and a ride when the other team is clearing near them.
            const k = Math.floor((t + p.phase) / (p.cut * 1.5)), ang = 6.283 * hash(`${p.k}:${k}`, 69), r = p.reach * 0.9; tx = a.x + Math.cos(ang) * r; ty = a.y + Math.sin(ang) * r; speed = p.jog * 0.6; purpose = PU.hold;
            if (seg.off !== null && seg.off !== i && seg.phase === 'transition' && ballCarrier && ballCarrier.team !== i && Math.hypot(ballCarrier.x - p.x, ballCarrier.y - p.y) < 18) { tx = ballCarrier.x; ty = ballCarrier.y; speed = p.top * 0.85; purpose = PU.ride; stopNear = 3; }
          } else {
            // Defender: on-ball keeps a cushion and pursues; off-ball stays goal side of an assignment and sags toward the ball; recovers hard when beaten.
            const opp = 1 - i, markId = seg.slots[opp][s <= 3 ? s + 6 : s], mk = markId ? Pl[ids.get(`${opp}|${markId}`)] : null;
            if (mk && mk.vis) {
              const lead = 0.5, mx = mk.x + mk.vx * lead, my = mk.y + mk.vy * lead, ownGx = goalX(opp, per), dx = ownGx - mx, dy = FIELD.W / 2 - my, dd = Math.hypot(dx, dy) || 1, onBall = ballCarrier === mk, gap = Math.min(onBall ? 2.4 : 2.4 + p.reach * 0.3, dd * 0.4), sag = !onBall && ballCarrier ? 0.05 + 0.07 * hash(p.k, 70) : 0;
              tx = mx + (dx / dd) * gap + (ballCarrier ? (ballCarrier.x - mx) * sag : 0); ty = my + (dy / dd) * gap + (ballCarrier ? (ballCarrier.y - my) * sag : 0);
              const behind = Math.hypot(p.x - tx, p.y - ty) > 7, need = Math.hypot(mk.vx, mk.vy) + 1; speed = behind ? p.top : Math.min(p.top, Math.max(p.jog * 0.75, need)); stopNear = 0.6; purpose = behind ? PU.recover : onBall ? PU['on-ball'] : PU.defend;
            } else { const q = fromGoal(opp, per, 14, (s - 5) * 8); tx = q.x; ty = q.y; purpose = PU.defend; }
          }
          if (looseGo && looseGo[i].includes(p)) { const L = looseAt(segNow); tx = L.x; ty = L.y; speed = p.top; stopNear = 0.3; purpose = PU.loose; }
        }
        if (p.on) { tx = clamp(tx, 1.5, FIELD.L - 1.5); ty = clamp(ty, 1.5, FIELD.W - 1.5); }
        p.tx = tx; p.ty = ty; p.purpose = purpose;
        // Local separation: a gentle nudge when very close, not a magnet. Field players stay out of the crease.
        let sx = 0, sy = 0; if (p.on) { const isG = segNow.slots[i][0] === p.id; if (!isG) [FIELD.goalL, FIELD.goalR].forEach(gc => { const cx = p.x - gc, cy = p.y - FIELD.W / 2, cd = Math.hypot(cx, cy) || 1; if (cd < 5) { const w = (5 - cd) / 5 * 6; sx += (cx / cd) * w; sy += (cy / cd) * w; } }); } for (let qi = 0; qi < Pl.length; qi++) { if (qi === pi) continue; const q = Pl[qi]; if (!q.vis) continue; const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy, room = q.team === i ? 3.6 : 1.7; if (d2 < room * room && d2 > 1e-4) { const dd = Math.sqrt(d2), w = (room - dd) / room; sx += (dx / dd) * w * 3.2; sy += (dy / dd) * w * 3.2; } }
        // Steering: arrive with speed that falls near the target, turn at a limited rate, change speed at a limited rate.
        const dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy), want = dist < stopNear ? 0 : Math.min(speed, (dist - stopNear * 0.5) * 1.6);
        let dvx = (dist > 1e-3 ? (dx / dist) * want : 0) + sx, dvy = (dist > 1e-3 ? (dy / dist) * want : 0) + sy; const sp = Math.hypot(p.vx, p.vy), wantSp = Math.hypot(dvx, dvy);
        if (wantSp > 0.2) { let ang = Math.atan2(dvy, dvx), turn = ang - p.heading; while (turn > Math.PI) turn -= 2 * Math.PI; while (turn < -Math.PI) turn += 2 * Math.PI; const maxTurn = (8.5 - 0.6 * Math.min(sp, 9)) * DT; if (Math.abs(turn) > maxTurn) { ang = p.heading + Math.sign(turn) * maxTurn; const mag = wantSp * Math.max(0.2, Math.cos(turn)); dvx = Math.cos(ang) * mag; dvy = Math.sin(ang) * mag; } p.heading = ang; }
        let ax = (dvx - p.vx) / DT, ay = (dvy - p.vy) / DT; const am = Math.hypot(ax, ay), lim = p.accel * (wantSp < sp ? 1.3 : 1); if (am > lim) { ax *= lim / am; ay *= lim / am; }
        p.vx += ax * DT; p.vy += ay * DT; const vm = Math.hypot(p.vx, p.vy); if (vm > p.top) { p.vx *= p.top / vm; p.vy *= p.top / vm; }
        p.x = clamp(p.x + p.vx * DT, 0.5, FIELD.L - 0.5); p.y = clamp(p.y + p.vy * DT, 0.5, FIELD.W + 3);
        p.X[n] = p.x; p.Y[n] = p.y; p.H[n] = p.heading; p.V[n] = p.on ? 2 : 1; p.U[n] = purpose;
      }
    }
    // ---- resolve the ball against the finished paths. Passes and shots leave when they must to arrive on time at their own speed. ----
    const pathAt = (ix, t) => { const q = Pl[ix], u = clamp(t / DT, 0, N - 1), a = Math.floor(u), b = Math.min(N - 1, a + 1), f = u - a; return { x: q.X[a] + (q.X[b] - q.X[a]) * f, y: q.Y[a] + (q.Y[b] - q.Y[a]) * f, h: q.H[a] }; };
    const of = (team, id) => ids.get(`${team}|${tok[id] || id}`), pocket = q => ({ x: q.x + Math.cos(q.h) * 0.75, y: q.y + Math.sin(q.h) * 0.75 });
    const resolved = []; let tail = { x: FIELD.mid, y: FIELD.W / 2 };
    const pushRest = t0 => { const lead = resolved[resolved.length - 1]; if (lead && lead.t1 < t0 - 1e-6) resolved.push({ t0: lead.t1, t1: t0, kind: 'rest', at: tail }); };
    plan.forEach(b => {
      if (b.kind === 'carry') { const ix = of(b.team, b.id); if (ix === undefined) return; pushRest(b.t0); resolved.push({ t0: b.t0, t1: b.t1, kind: 'carry', ix }); tail = pocket(pathAt(ix, b.t1)); return; }
      pushRest(b.t0); const fromIx = b.from ? of(b.from.team, b.from.id) : undefined, early = b.fromPt ? b.fromPt : fromIx !== undefined ? pocket(pathAt(fromIx, b.t0)) : tail;
      let toP; if (b.to.id !== undefined) { const ix = of(b.to.team, b.to.id); toP = ix === undefined ? tail : pocket(pathAt(ix, b.t1)); } else if (b.to.blockedFrom !== undefined) toP = { x: early.x + (b.to.gx - early.x) * 0.28, y: early.y + (b.to.y - early.y) * 0.28 }; else toP = b.to;
      let t0 = b.t0, from = early; const speed = b.shot ? SHOT_SPEED : b.pass ? PASS_SPEED : 0, lead = resolved[resolved.length - 1];
      if (speed && fromIx !== undefined) { const need = Math.hypot(toP.x - early.x, toP.y - early.y) / speed; let wantT0 = b.t1 - Math.max(0.16, need); if (wantT0 < t0) { if (lead && lead.kind === 'carry' && lead.ix === fromIx && wantT0 > lead.t0 + 0.05) { lead.t1 = wantT0; t0 = wantT0; from = pocket(pathAt(fromIx, t0)); } wantT0 = t0; } if (wantT0 > t0) { if (lead && lead.kind === 'carry' && lead.ix === fromIx) lead.t1 = wantT0; else resolved.push({ t0: b.t0, t1: wantT0, kind: 'carry', ix: fromIx }); t0 = wantT0; from = pocket(pathAt(fromIx, t0)); } }
      resolved.push({ t0, t1: b.t1, kind: 'fly', from, to: { x: toP.x, y: toP.y }, arc: b.arc, shot: b.shot || null, pass: !!b.pass }); tail = { x: toP.x, y: toP.y };
    });
    const ballAt = t => { let lo = 0, hi = resolved.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (resolved[m].t0 <= t) lo = m; else hi = m - 1; } const b = resolved[lo]; if (!b) return { x: FIELD.mid, y: FIELD.W / 2, h: 0 }; if (t > b.t1 && b.kind !== 'rest') { const e = b.kind === 'carry' ? pocket(pathAt(b.ix, b.t1)) : b.to; return { x: e.x, y: e.y, h: 0 }; } if (b.kind === 'carry') { const q = pocket(pathAt(b.ix, t)); return { x: q.x, y: q.y, h: 0, carried: b.ix }; } if (b.kind === 'rest') return { x: b.at.x, y: b.at.y, h: 0 }; const u = b.t1 > b.t0 ? clamp((t - b.t0) / (b.t1 - b.t0), 0, 1) : 1; return { x: b.from.x + (b.to.x - b.from.x) * u, y: b.from.y + (b.to.y - b.from.y) * u, h: Math.sin(Math.PI * u) * b.arc, shot: b.shot }; };
    const playersAt = t => { const u = clamp(t / DT, 0, N - 1), a = Math.floor(u), b = Math.min(N - 1, a + 1), f = u - a, out = []; for (let k = 0; k < Pl.length; k++) { const q = Pl[k]; if (!q.V[a]) continue; const nb = q.V[b] ? b : a; out.push({ id: q.id, team: q.team, x: q.X[a] + (q.X[nb] - q.X[a]) * f, y: q.Y[a] + (q.Y[nb] - q.Y[a]) * f, on: q.V[a] === 2, ix: k, generic: q.id.includes(':'), purpose: PURPOSES[q.U[a]] }); } return out; };
    const scoreAt = t => { let s = [0, 0]; for (const x of scores) { if (x.t <= t) s = x.score; else break; } return s; };
    const clockEvents = ledger.filter(e => e.left !== undefined);
    const clockAt = t => { let lo = 0, hi = clockEvents.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tOf(clockEvents[m]) <= t) lo = m; else hi = m - 1; } const e = clockEvents[lo], nx = clockEvents[lo + 1], over = e.type === 'period_end' || e.type === 'game_end', floor = nx && nx.period === e.period ? nx.left : 0; return { period: e.period, left: Math.max(floor, over ? e.left : e.left - (t - tOf(e)) * 10) }; };   // frozen during display pauses
    const shotEvents = ledger.filter(e => ['possession_start', 'retained', 'restart', 'possession_end'].includes(e.type));
    const shotClockAt = t => { let last = null; for (const e of shotEvents) { if (tOf(e) > t) break; last = e; } if (!last || last.type === 'possession_end') return null; return Math.max(0, last.clock - (t - tOf(last)) * 10); };
    const penaltiesAt = t => [0, 1].map(i => serving(i, t).length);
    return { duration, events, segs, ball: resolved, playersAt, ballAt, scoreAt, clockAt, shotClockAt, penaltiesAt, names, teamLevel: [teamLevel(0), teamLevel(1)], ledger, tOf, tracks: Pl, DT, N, purposes: PURPOSES };
  }

  // ---- canvas renderer: draws one moment; holds no game state ----
  function css(el, name, fallback) { try { return getComputedStyle(el).getPropertyValue(name).trim() || fallback; } catch (e) { return fallback; } }
  function drawField(ctx, s, ox, oy, el, w, h) {
    const X = x => ox + x * s, Y = y => oy + y * s, F = FIELD;
    ctx.fillStyle = css(el, '--turf', '#2C6A46'); ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.globalAlpha = 0.045; ctx.fillStyle = '#fff'; for (let i = 0; i < 11; i += 2) ctx.fillRect(X(i * 10), Y(0), 10 * s, F.W * s); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.lineWidth = Math.max(1, s * 0.16); ctx.strokeRect(X(0), Y(0), F.L * s, F.W * s);
    const line = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(X(a), Y(b)); ctx.lineTo(X(c), Y(d)); ctx.stroke(); };
    line(F.mid, 0, F.mid, F.W); line(F.restrainL, 0, F.restrainL, F.W); line(F.restrainR, 0, F.restrainR, F.W);
    const by = (F.W - F.boxW) / 2; line(0, by, F.restrainL, by); line(0, by + F.boxW, F.restrainL, by + F.boxW); line(F.restrainR, by, F.L, by); line(F.restrainR, by + F.boxW, F.L, by + F.boxW);
    line(F.mid - F.wingX, F.W / 2 - F.wingY, F.mid + F.wingX, F.W / 2 - F.wingY); line(F.mid - F.wingX, F.W / 2 + F.wingY, F.mid + F.wingX, F.W / 2 + F.wingY);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(X(F.mid) - s * 0.35, Y(F.W / 2) - s * 0.35, s * 0.7, s * 0.7);
    [F.goalL, F.goalR].forEach(gx => { ctx.beginPath(); ctx.arc(X(gx), Y(F.W / 2), F.crease * s, 0, 6.2832); ctx.stroke(); ctx.save(); ctx.strokeStyle = css(el, '--goal', '#F97316'); ctx.lineWidth = Math.max(2.5, s * 0.42); line(gx, F.W / 2 - F.goalW / 2, gx, F.W / 2 + F.goalW / 2); ctx.restore(); });
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(X(F.mid - 5), Y(F.W) + 1, 10 * s, Math.max(1, s * 0.18)); ctx.restore();   // substitution area
  }
  function drawReplay(canvas, R, t) {
    const dpr = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), w = canvas.clientWidth || 880, h = Math.round(w * (FIELD.W + 7.5) / (FIELD.L + 6));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px'; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = w / (FIELD.L + 6), ox = 3 * s, oy = 2 * s; drawField(ctx, s, ox, oy, canvas, w, h);
    if (!R) return;
    const col = [css(canvas, '--team-a', '#1F5FBF'), css(canvas, '--team-b', '#C2410C')], r = Math.max(6.5, s * 1.25), b = R.ballAt(t);
    R.playersAt(t).sort((a, c) => (a.generic === c.generic ? 0 : a.generic ? -1 : 1)).forEach(p => {
      const x = ox + p.x * s, y = oy + p.y * s; ctx.save(); if (!p.on) ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(x + 0.6, y + 1.2, r, 0, 6.2832); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = col[p.team]; ctx.fill();
      if (b.carried === p.ix) { ctx.lineWidth = 2; ctx.strokeStyle = '#FFF7D6'; } else { ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.75)'; } ctx.stroke();
      if (!p.generic && p.id !== MS.TEAM) { ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(9, Math.round(r * 1.2))}px 'Arial Narrow', Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.id, x, y + 0.5); }
      ctx.restore();
    });
    const bx = ox + b.x * s, by = oy + b.y * s - b.h * s * 0.55, br = Math.max(2.4, s * 0.42 + b.h * 0.5);
    if (b.h > 0.05) { ctx.beginPath(); ctx.arc(ox + b.x * s, oy + b.y * s, br * 0.75, 0, 6.2832); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fillStyle = '#FFF7D6'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(30,30,30,.8)'; ctx.stroke();
  }
  // Plays on the display timer. Time advances along precomputed paths, so speed, pause and seek change only which moment is drawn.
  function Player(canvas, R, onFrame, onEnd) {
    const st = { t: 0, speed: 8, playing: false, raf: null, last: 0 };
    const frame = now => { st.raf = null; if (st.playing) { st.t = Math.min(R.duration, st.t + Math.min(0.1, (now - st.last) / 1000) * st.speed); st.last = now; if (st.t >= R.duration) { st.playing = false; drawReplay(canvas, R, st.t); onFrame(st); if (onEnd) onEnd(); return; } } drawReplay(canvas, R, st.t); onFrame(st); if (st.playing) st.raf = g.requestAnimationFrame(frame); };
    return { st, play() { if (st.playing) return; if (st.t >= R.duration) st.t = 0; st.playing = true; st.last = performance.now(); st.raf = g.requestAnimationFrame(frame); }, pause() { st.playing = false; if (st.raf) g.cancelAnimationFrame(st.raf); st.raf = null; drawReplay(canvas, R, st.t); onFrame(st); }, seek(t) { st.t = clamp(t, 0, R.duration); drawReplay(canvas, R, st.t); onFrame(st); }, speed(v) { st.speed = v; }, stop() { st.playing = false; if (st.raf && g.cancelAnimationFrame) g.cancelAnimationFrame(st.raf); st.raf = null; } };
  }
  Object.assign(MS, { FIELD, buildReplay, drawReplay, ReplayPlayer: Player, describeEvent: describe, REPLAY_DT: DT });
})(globalThis);

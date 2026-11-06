// W&L Matchup Studio: replay built only from a game's event ledger. Motion is a schematic reconstruction of simulated actions: it isn't
// tracking data and it doesn't predict where players stand. Rendering can't change results and uses none of the engine's random streams.
// Every position is a pure function of time, so pause, seek and speed can't change anything.
(function (g) {
  const MS = g.MS = g.MS || {};
  // Field in yards, per Rule 1: 110 x 60, restraining lines 20 yards from each goal line and 20 from the center line, so goal lines at 15 and 95.
  const FIELD = Object.freeze({ L: 110, W: 60, goalL: 15, goalR: 95, restrainL: 35, restrainR: 75, mid: 55, crease: 3, boxW: 40, wingY: 20, wingX: 10, goalW: 2 });
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), smooth = u => u * u * (3 - 2 * u), hash = (s, n) => (MS.hash32(String(s), n >>> 0) >>> 0) / 4294967296;
  // Formation slots: x is yards from the goal being attacked (negative = behind it), y from the field center.
  const OFF = [[-6, 8], [-6, -8], [-9, 0], [9, 14], [14, 0], [9, -14]], DEFEND_HOLD = [[48, 12], [50, 0], [48, -12]], ATT_HOLD = [[30, 14], [33, 0], [30, -14]];
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
      case 'turnover': { const why = { play: 'turnover', failed_clear: 'failed clear', shot_clock: 'shot clock violation', foul: 'foul with the ball' }[e.reason]; return `${who(e.team, e.player)}: ${why}${e.causedBy ? `, caused by ${labelFor(e.causedBy)}` : ''}`; }
      case 'penalty': return `Penalty on ${who(e.team, e.player)}: ${e.ds ? `${e.ds / 10}s` : 'possession only'}`;
      case 'penalty_end': return e.reason === 'goal' ? `${names.teams[e.team]} released by the goal` : `${names.teams[e.team]} penalty ends`;
      case 'game_end': return `Final: ${names.teams[0]} ${e.score[0]}, ${names.teams[1]} ${e.score[1]}`;
      default: return null;
    }
  }

  function buildReplay(ledger, P, names) {
    const sec = e => e.t / 10, end = ledger[ledger.length - 1], duration = sec(end) + 2;
    const R = [0, 1].map(i => P.teams[i].rotation), teamLevel = i => !R[i].attack.length && !R[i].lines.length;
    const genericIds = i => Array.from({ length: 10 }, (_, k) => `${i}:${k}`);
    // Ten slots per team: 0 goalie, 1-3 close defenders or holding defenders, 4-6 midfield or short-stick unit, 7-9 attack.
    const slotsFor = (i, offense, acting, fogo) => {
      if (teamLevel(i)) return genericIds(i);
      const r = R[i], unit = acting && acting.length ? acting : [], goalie = r.goalie || MS.TEAM;
      if (fogo) { const att = r.attack, mids = unit.filter(j => !att.includes(j) && j !== fogo), close = r.defense.slice(0, 3); return [goalie, close[0], close[1], close[2], fogo, mids[0], mids[1], att[0], att[1], att[2]]; }
      if (offense) { const att = r.attack, mids = unit.filter(j => !att.includes(j)), close = r.defense.slice(0, 3); return [goalie, close[0], close[1], close[2], mids[0], mids[1], mids[2], att[0], att[1], att[2]]; }
      const d = r.defense; return [goalie, d[0], d[1], d[2], d[3], d[4], d[5], r.attack[0], r.attack[1], r.attack[2]];
    };
    // ---- segments: one phase of play between ledger moments ----
    const segs = []; let cur = { start: 0, phase: 'dead', off: null, period: 1 }, lineups = [[], []], fogoNow = [null, null];
    const stamp = () => { cur.slots = [0, 1].map(i => slotsFor(i, cur.off === i, lineups[i], cur.phase === 'faceoff' ? fogoNow[i] : null)); };
    const openSeg = (t, phase, off, period) => { cur.end = t; if (cur.end > cur.start || !segs.length) { if (!cur.slots) stamp(); segs.push(cur); } cur = { start: t, phase, off, period }; stamp(); };
    const penaltyLog = [];
    const rosterF = i => R[i].fogo || [];
    for (let k = 0; k < ledger.length; k++) {
      const e = ledger[k], t = sec(e);
      if (e.type === 'period_start') openSeg(t, 'faceoff', null, e.period);
      else if (e.type === 'lineup') { lineups[e.team] = e.players; if (cur.phase === 'faceoff') { const f = e.players.find(j => rosterF(e.team).some(x => x.id === j)); fogoNow[e.team] = f || null; stamp(); } }
      else if (e.type === 'possession_start') { let clearing = false; for (let n = k + 1; n < ledger.length && ledger[n].type !== 'possession_end'; n++) if (ledger[n].type === 'clear') { clearing = true; break; } openSeg(t, clearing ? 'transition' : 'settled', e.team, e.period); }
      else if (e.type === 'clear') { if (e.ok) openSeg(t, 'settled', e.team, e.period); }
      else if (e.type === 'loose_ball') openSeg(t, 'loose', e.team, e.period);
      else if (e.type === 'retained') openSeg(t, 'settled', e.team, e.period);
      else if (e.type === 'restart') openSeg(t, 'settled', e.team, e.period);
      else if (e.type === 'possession_end') { if (e.reason === 'goal' || e.reason === 'period_end') openSeg(t, e.reason === 'goal' ? 'faceoff' : 'dead', null, e.period); }
      else if (e.type === 'penalty_start') penaltyLog.push({ team: e.team, id: e.penaltyId, player: e.player, start: t, end: Infinity });
      else if (e.type === 'penalty_end') { const p = penaltyLog.find(x => x.team === e.team && x.id === e.penaltyId); if (p) p.end = t; }
    }
    cur.end = duration; if (!cur.slots) stamp(); segs.push(cur);
    const segAt = t => { let lo = 0, hi = segs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].start <= t) lo = m; else hi = m - 1; } return lo; };
    // ---- where a slot stands in one segment at time t, with no history ----
    const sway = (id, t, a) => { const h1 = hash(id, 11), h2 = hash(id, 13); return { x: a * Math.sin(t / (6 + 5 * h1) + 6.28 * h1), y: a * Math.sin(t / (7 + 4 * h2) + 6.28 * h2) }; };
    function place(seg, i, s, t) {
      const per = seg.period, id = seg.slots[i][s] || `${i}:${s}`;
      if (s === 0) { const off = sway(id, t, 0.4), own = goalX(1 - i, per); return { x: own + (dirOf(i, per) * 2) + off.x * 0.5, y: FIELD.W / 2 + off.y }; }
      if (seg.phase === 'faceoff' || seg.phase === 'dead') {
        const m = dirOf(i, per) * -1, W = sway(id, t, 0.35);
        if (s === 4) return { x: FIELD.mid + m * 1.4 + W.x * 0.3, y: FIELD.W / 2 + W.y * 0.3 };
        if (s === 5 || s === 6) return { x: FIELD.mid + m * 2.4 + W.x, y: s === 5 ? 8 + W.y : FIELD.W - 8 + W.y };
        if (s <= 3) { const p = fromGoal(i, per, 66, [-13, 1, 15][s - 1]); return { x: p.x + W.x, y: p.y + W.y }; }
        const p = fromGoal(i, per, 12, [-16, -2, 12][s - 7]); return { x: p.x + W.x, y: p.y + W.y };
      }
      const offense = seg.off === i, w = sway(id, t, seg.phase === 'loose' ? 0.8 : 1.8);
      if (offense) {
        if (s <= 3) { const h = DEFEND_HOLD[s - 1], p = fromGoal(i, per, h[0], h[1]); return { x: p.x + w.x * 0.5, y: p.y + w.y * 0.5 }; }
        const b = OFF[s >= 7 ? s - 7 : s - 1], p = seg.phase === 'transition' ? fromGoal(i, per, b[0] + 26 + 3 * s, b[1] * 1.2) : fromGoal(i, per, b[0], b[1]);
        return { x: clamp(p.x + w.x, 1, FIELD.L - 1), y: clamp(p.y + w.y, 1, FIELD.W - 1) };
      }
      // Defending: holders stay over the midfield; the rest mark an opposing slot, goal side, a moment behind.
      if (s >= 7) { const h = ATT_HOLD[s - 7], p = fromGoal(i, per, h[0], h[1]); return { x: clamp(p.x + w.x * 0.5, 2, FIELD.L - 2), y: p.y + w.y * 0.5 }; }
      const markSlot = s <= 3 ? s + 6 : s, opp = seg.off === null ? null : 1 - i, mark = place(seg, opp, markSlot, t - 0.5), gx = goalX(opp, per);
      const dx = gx - mark.x, dy = FIELD.W / 2 - mark.y, d = Math.hypot(dx, dy) || 1, gap = Math.min(4.5, d * 0.5);   // goal side of the player being marked
      return { x: clamp(mark.x + (dx / d) * gap + (s % 2 ? 0.9 : -0.9), 1, FIELD.L - 1), y: clamp(mark.y + (dy / d) * gap + (s % 2 ? 1.2 : -1.2), 1, FIELD.W - 1) };
    }
    const SUB = i => ({ x: FIELD.mid + (i === 0 ? -3 : 3), y: FIELD.W + 1.5 });
    // Blends from the last segment with a per-player delay, so ten players never move as one. The path bows slightly so it isn't a straight line.
    function playerAt(i, s, t) {
      const k = segAt(t), seg = segs[k], id = seg.slots[i][s] || `${i}:${s}`;
      if (!seg.slots[i][s]) return null;
      const here = place(seg, i, s, t); if (k === 0) return { id, x: here.x, y: here.y };
      const prev = segs[k - 1], same = prev.slots[i][s] === seg.slots[i][s], changedEnds = prev.period !== seg.period, delay = 0.15 + 0.7 * hash(id + seg.start, 3), from = same ? place(prev, i, s, seg.start) : SUB(i), dist = Math.hypot(here.x - from.x, here.y - from.y), dur = Math.max(1.6 + 2.2 * hash(id, 5), dist / (changedEnds ? 9 : 6.5)), u = clamp((t - seg.start - (changedEnds ? 0 : delay)) / dur, 0, 1);   // about 6.5 yards a second, peaking near 10 mid-run
      if (u >= 1) return { id, x: here.x, y: here.y };
      const e = smooth(u), dx = here.x - from.x, dy = here.y - from.y, bow = Math.sin(Math.PI * e) * 0.08 * (hash(id, 7) > 0.5 ? 1 : -1);
      return { id, x: from.x + dx * e - dy * bow, y: from.y + dy * e + dx * bow, entering: !same && u < 0.8 };
    }
    // Who is serving time. A named player's slot leaves the field; a team-charged penalty takes the highest empty attack or midfield slot.
    const serving = (i, t) => penaltyLog.filter(p => p.team === i && p.start <= t && t < p.end);
    function teamAt(i, t) {
      const pen = serving(i, t), k = segAt(t), seg = segs[k], out = new Set(); let spare = 9;
      pen.forEach(p => { const n = seg.slots[i].indexOf(p.player); if (n >= 0) out.add(n); else { while (out.has(spare) && spare > 4) spare--; out.add(spare); } });
      return Array.from({ length: 10 }, (_, s) => { if (out.has(s)) return null; const q = playerAt(i, s, t); return q ? Object.assign(q, { slot: s, team: i }) : null; }).filter(Boolean);
    }
    const slotOf = (seg, team, id, salt) => { if (id && id !== MS.TEAM) { const n = seg.slots[team].indexOf(id); if (n > 0) return n; } return 4 + Math.floor(hash(`${salt}`, 17) * 6); };
    // ---- ball: control spans and flights, built forward from the ledger ----
    const ball = [];   // { t0, t1, kind: 'carry'|'fly'|'rest', team, slot, from, to }
    let holder = null, holdFrom = 0, lastPos = { x: FIELD.mid, y: FIELD.W / 2 };
    const posOf = (team, slot, t) => { const q = playerAt(team, slot, t); return q ? { x: q.x, y: q.y } : { x: FIELD.mid, y: FIELD.W / 2 }; };
    const closeCarry = t1 => { if (holder) { ball.push({ t0: holdFrom, t1, kind: 'carry', team: holder.team, slot: holder.slot }); lastPos = posOf(holder.team, holder.slot, t1); } else if (t1 > holdFrom) { ball.push({ t0: holdFrom, t1, kind: 'rest', at: lastPos }); } holder = null; };
    const fly = (t0, t1, to, kind) => { ball.push({ t0, t1, kind: 'fly', from: lastPos, to, arc: kind === 'shot' ? 0.3 : kind === 'pass' ? 2.2 : 1 }); lastPos = to; holdFrom = t1; };
    const take = (team, slot, t) => { holder = { team, slot }; holdFrom = t; };
    const goalPoint = (team, per, seedKey, spread) => ({ x: goalX(team, per) + dirOf(team, per) * 0.3, y: FIELD.W / 2 + (hash(seedKey, 23) - 0.5) * spread });
    // Passes in the gap before an action. The last pass goes to the shooter, from the credited passer when there's an assist.
    function passesTo(team, slot, passerSlot, t0, t1, seedKey) {
      const gap = t1 - t0; if (gap < 3 || !holder || holder.team !== team) return;
      const n = Math.min(5, Math.floor(gap / 6)), times = []; for (let m = 1; m <= n; m++) times.push(t0 + gap * (m / (n + 1)));
      for (let m = 0; m < n; m++) { const last = m === n - 1, want = last ? (passerSlot || slot) : 4 + Math.floor(hash(`${seedKey}:${m}`, 29) * 6); if (want === holder.slot) continue; const tRel = times[m], p = posOf(team, want, tRel + 0.45); closeCarry(tRel); fly(tRel, tRel + 0.45, p, 'pass'); take(team, want, tRel + 0.45); }
    }
    const events = [], scores = []; let score = [0, 0], lastT = 0;
    for (const e of ledger) {
      const t = sec(e), seg = segs[segAt(Math.max(0, t - 1e-6))], line = describe(e, names);
      if (line) events.push({ t, type: e.type, text: line, period: e.period, left: e.left, goal: e.type === 'shot' && e.outcome === 'goal' });
      if (e.type === 'faceoff') { closeCarry(t); const sl = 4, p = posOf(e.winner, sl, t + 0.4); fly(t, t + 0.4, p, 'pass'); take(e.winner, sl, t + 0.4); lastT = t; }
      else if (e.type === 'shot') {
        const se = segs[segAt(Math.max(0, t - 0.5))], shooter = slotOf(se, e.team, e.shooter, e.seq), passer = e.assist ? slotOf(se, e.team, e.assist, `a${e.seq}`) : null;
        passesTo(e.team, shooter, passer === shooter ? null : passer, Math.max(lastT, holdFrom), t - 1.2, `${e.seq}`);
        const gp = goalPoint(e.team, e.period, e.seq, e.outcome === 'wide' || e.outcome === 'blocked' ? 10 : 1.6), fl = 0.6, rel = Math.max(holdFrom, t - fl);
        if (!holder || holder.team !== e.team || holder.slot !== shooter) { closeCarry(rel - 0.35 > holdFrom ? rel - 0.35 : holdFrom); const near = posOf(e.team, shooter, rel); fly(Math.max(holdFrom, rel - 0.35), rel, near, 'pass'); take(e.team, shooter, rel); }
        closeCarry(rel);
        const to = e.outcome === 'wide' ? { x: goalX(e.team, e.period) + dirOf(e.team, e.period) * 10, y: gp.y } : e.outcome === 'blocked' ? (() => { const m = posOf(e.team, shooter, rel); return { x: m.x + (gp.x - m.x) * 0.3, y: m.y + (gp.y - m.y) * 0.3 }; })() : gp;
        fly(rel, t, to, 'shot'); lastT = t;
        if (e.outcome === 'goal') { score = score.slice(); score[e.team]++; scores.push({ t, score: score.slice() }); }
      }
      else if (e.type === 'possession_start' && e.source !== 'faceoff') {
        const o = segs[segAt(t)], slot = e.source === 'goalie_save' ? 0 : slotOf(o, e.team, null, `p${e.seq}`), p = posOf(e.team, slot, t + 0.4);
        if (!holder || holder.team !== e.team) { closeCarry(t); fly(t, t + 0.4, p, 'other'); take(e.team, slot, t + 0.4); } lastT = t;
      }
      else if (e.type === 'retained') { const o = segs[segAt(t)], slot = slotOf(o, e.team, null, `r${e.seq}`), p = posOf(e.team, slot, t + 0.3); closeCarry(t); fly(t, t + 0.3, p, 'other'); take(e.team, slot, t + 0.3); lastT = t; }
      else if (e.type === 'turnover' && e.player && holder && holder.team === e.team) {
        const o = segs[segAt(Math.max(0, t - 0.5))], want = slotOf(o, e.team, e.player, `to${e.seq}`); passesTo(e.team, want, null, Math.max(lastT, holdFrom), t - 1, `t${e.seq}`); lastT = t;
      }
      else if (e.type === 'period_end') { closeCarry(t); ball.push({ t0: t, t1: t + 0.8, kind: 'fly', from: lastPos, to: { x: FIELD.mid, y: FIELD.W / 2 }, arc: 0.5 }); lastPos = { x: FIELD.mid, y: FIELD.W / 2 }; holdFrom = t + 0.8; lastT = t; }
    }
    closeCarry(duration);
    ball.sort((a, b) => a.t0 - b.t0);
    const ballAt = t => {
      let lo = 0, hi = ball.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ball[m].t0 <= t) lo = m; else hi = m - 1; }
      const b = ball[lo]; if (!b) return { x: FIELD.mid, y: FIELD.W / 2, h: 0 };
      if (b.kind === 'carry') { const p = posOf(b.team, b.slot, Math.min(t, b.t1)); return { x: p.x + 0.5, y: p.y - 0.4, h: 0, carried: true }; }
      if (b.kind === 'rest') return { x: b.at.x, y: b.at.y, h: 0 };
      const u = b.t1 > b.t0 ? clamp((t - b.t0) / (b.t1 - b.t0), 0, 1) : 1; return { x: b.from.x + (b.to.x - b.from.x) * u, y: b.from.y + (b.to.y - b.from.y) * u, h: Math.sin(Math.PI * u) * b.arc };
    };
    const scoreAt = t => { let s = [0, 0]; for (const x of scores) { if (x.t <= t) s = x.score; else break; } return s; };
    // Clocks come from the ledger; the running clock counts down between its moments.
    const clockEvents = ledger.filter(e => e.left !== undefined);
    const clockAt = t => { let lo = 0, hi = clockEvents.length - 1; const ds = t * 10; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (clockEvents[m].t <= ds) lo = m; else hi = m - 1; } const e = clockEvents[lo], nx = clockEvents[lo + 1], over = e.type === 'period_end' || e.type === 'game_end'; return { period: e.period, left: Math.max(0, over || (nx && nx.type === 'period_start') ? e.left : e.left - (ds - e.t)) }; };
    const shotEvents = ledger.filter(e => ['possession_start', 'retained', 'restart', 'possession_end'].includes(e.type));
    const shotClockAt = t => { const ds = t * 10; let last = null; for (const e of shotEvents) { if (e.t > ds) break; last = e; } if (!last || last.type === 'possession_end') return null; return Math.max(0, last.clock - (ds - last.t)); };
    const penaltiesAt = t => [0, 1].map(i => serving(i, t).length);
    return { duration, events, segs, ball, playersAt: t => [...teamAt(0, t), ...teamAt(1, t)], ballAt, scoreAt, clockAt, shotClockAt, penaltiesAt, names, teamLevel: [teamLevel(0), teamLevel(1)], ledger };
  }

  // ---- canvas renderer: draws one moment; holds no game state ----
  function css(el, name, fallback) { try { return getComputedStyle(el).getPropertyValue(name).trim() || fallback; } catch (e) { return fallback; } }
  function drawField(ctx, s, ox, oy, el) {
    const X = x => ox + x * s, Y = y => oy + y * s, F = FIELD;
    ctx.fillStyle = css(el, '--turf', '#2E6B45'); ctx.fillRect(X(0), Y(0), F.L * s, F.W * s);
    ctx.strokeStyle = css(el, '--turf-line', 'rgba(255,255,255,.85)'); ctx.lineWidth = Math.max(1, s * 0.22); ctx.strokeRect(X(0), Y(0), F.L * s, F.W * s);
    const line = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(X(a), Y(b)); ctx.lineTo(X(c), Y(d)); ctx.stroke(); };
    line(F.mid, 0, F.mid, F.W); line(F.restrainL, 0, F.restrainL, F.W); line(F.restrainR, 0, F.restrainR, F.W);
    const by = (F.W - F.boxW) / 2; line(0, by, F.restrainL, by); line(0, by + F.boxW, F.restrainL, by + F.boxW); line(F.restrainR, by, F.L, by); line(F.restrainR, by + F.boxW, F.L, by + F.boxW);
    line(F.mid - F.wingX, F.W / 2 - F.wingY, F.mid + F.wingX, F.W / 2 - F.wingY); line(F.mid - F.wingX, F.W / 2 + F.wingY, F.mid + F.wingX, F.W / 2 + F.wingY);
    ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(X(F.mid) - s * 0.4, Y(F.W / 2) - s * 0.4, s * 0.8, s * 0.8);
    [F.goalL, F.goalR].forEach(gx => { ctx.beginPath(); ctx.arc(X(gx), Y(F.W / 2), F.crease * s, 0, 6.2832); ctx.stroke(); ctx.save(); ctx.strokeStyle = css(el, '--goal', '#F97316'); ctx.lineWidth = Math.max(2, s * 0.4); line(gx, F.W / 2 - F.goalW / 2 * 1, gx, F.W / 2 + F.goalW / 2 * 1); ctx.restore(); });
  }
  function drawReplay(canvas, R, t, opt) {
    const dpr = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), w = canvas.clientWidth || 880, h = Math.round(w * (FIELD.W + 6) / (FIELD.L + 6));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px'; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const s = w / (FIELD.L + 6), ox = 3 * s, oy = 2.5 * s; drawField(ctx, s, ox, oy, canvas);
    const col = [css(canvas, '--team-a', '#1F5FBF'), css(canvas, '--team-b', '#C2410C')], ring = css(canvas, '--turf-ink', '#FFFFFF');
    const r = Math.max(5.5, s * 1.1);
    R.playersAt(t).forEach(p => { const x = ox + p.x * s, y = oy + clamp(p.y, -1, FIELD.W + 2) * s; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = col[p.team]; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = ring; ctx.stroke(); if (!R.teamLevel[p.team] && p.id && p.id !== MS.TEAM) { ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.max(8, r * 1.05)}px var(--num, Arial Narrow, sans-serif)`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.id, x, y + 0.5); } });
    const b = R.ballAt(t), bx = ox + b.x * s, by = oy + b.y * s - b.h * s * 0.6, br = Math.max(3, s * 0.55 + b.h * 0.6);
    ctx.beginPath(); ctx.arc(ox + b.x * s, oy + b.y * s, br * 0.8, 0, 6.2832); ctx.fillStyle = 'rgba(0,0,0,.25)'; if (b.h > 0.05) ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fillStyle = '#FFF7D6'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#333'; ctx.stroke();
  }
  // Plays through the whole game on a timer. Speed, pause and seek change only which moment is drawn.
  function Player(canvas, R, onFrame) {
    const st = { t: 0, speed: 8, playing: false, raf: null, last: 0 };
    const frame = now => { if (st.playing) { st.t = Math.min(R.duration, st.t + (now - st.last) / 1000 * st.speed); st.last = now; if (st.t >= R.duration) st.playing = false; } drawReplay(canvas, R, st.t); onFrame(st); st.raf = st.playing && g.requestAnimationFrame ? g.requestAnimationFrame(frame) : null; };
    return { st, play() { if (st.playing) return; if (st.t >= R.duration) st.t = 0; st.playing = true; st.last = performance.now(); st.raf = g.requestAnimationFrame(frame); }, pause() { st.playing = false; }, seek(t) { st.t = clamp(t, 0, R.duration); drawReplay(canvas, R, st.t); onFrame(st); }, speed(v) { st.speed = v; }, stop() { st.playing = false; if (st.raf && g.cancelAnimationFrame) g.cancelAnimationFrame(st.raf); } };
  }
  Object.assign(MS, { FIELD, buildReplay, drawReplay, ReplayPlayer: Player, describeEvent: describe });
})(globalThis);

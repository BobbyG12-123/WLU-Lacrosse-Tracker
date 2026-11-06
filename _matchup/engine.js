// W&L Matchup Studio: pure game engine. Takes parameters and a seed, returns one game's canonical event ledger.
// The box score, the validator, batch results and the future replay all read that ledger. Nothing here touches the page or the database.
// Times are integer tenths of a second.
(function (g) {
  const MS = g.MS = g.MS || {};
  const { RULES, SEC } = MS;
  const TEAM = 'TEAM';

  // ---- random numbers: one independent stream per event type, so paired comparisons line up by event type ----
  function hash32(str, seed) {
    let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
    return h >>> 0;
  }
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makeStreams(seed) { const c = {}; return name => c[name] || (c[name] = mulberry(hash32(name, seed))); }
  const gameSeed = (runSeed, index) => hash32('game:' + index, runSeed);
  function gammaDs(meanSec, u) { const a = Math.max(u(), 1e-12), b = Math.max(u(), 1e-12); return Math.max(1, Math.round(-Math.log(a * b) * meanSec / 2 * SEC)); }
  function drawGamma(k, u) {
    if (k < 1) return drawGamma(k + 1, u) * Math.pow(Math.max(u(), 1e-12), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { let x, v; do { x = Math.sqrt(-2 * Math.log(Math.max(u(), 1e-12))) * Math.cos(2 * Math.PI * u()); v = 1 + c * x; } while (v <= 0); v = v * v * v; const w = Math.max(u(), 1e-12); if (Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
  }
  function drawBeta(p, u) { const x = drawGamma(p.a, u), y = drawGamma(p.b, u); return x / (x + y); }
  const betaMean = p => p.a / (p.a + p.b);
  const logit = p => Math.log(p / (1 - p)), invLogit = x => 1 / (1 + Math.exp(-x));
  function pick(ids, weights, u) {
    if (!ids.length) return TEAM;
    let t = 0; const w = ids.map(id => { const v = Math.max(0, weights && weights[id] || 0); t += v; return v; });
    if (t <= 0) return ids[Math.floor(u() * ids.length)];
    let r = u() * t; for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r < 0) return ids[i]; } return ids[ids.length - 1];
  }

  // Five exclusive shot outcomes. blocked first; on goal is conditional on unblocked; pipe is a share of unblocked shots not on goal.
  function outcomeProbs(blocked, q, r, pipeOfOff) {
    const unb = 1 - blocked, off = unb * (1 - q);
    return { blocked, goal: unb * q * r, save: unb * q * (1 - r), pipe: off * pipeOfOff, wide: off * (1 - pipeOfOff) };
  }

  function drawWorld(P, s) {
    const u = s('world'), post = P.uncertainty === 'posterior', d = p => post ? drawBeta(p, u) : betaMean(p);
    const worlds = P.teams.map(T => {
      const R = T.rates, w = { shotVsTO: d(R.shotVsTO), clear: d(R.clear), blocked: d(R.blocked), pipeOfOff: d(R.pipeOfOff), caused: d(R.caused), assist: d(R.assist), shooters: {} };
      T.shooters.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).forEach(x => { w.shooters[x.id] = { q: d(x.q), r: d(x.r) }; });
      return w;
    });
    return { teams: worlds, fo: d(P.faceoff) };
  }

  function simulateGame(P, seed) {
    const s = makeStreams(seed), W = drawWorld(P, s), ledger = [], score = [0, 0], A = P.teams;
    let time = 0, period = 0, left = 0, seq = 0, over = false, overtime = false;
    let poss = null, pid = 0, clock = 0, needClear = false, carry = null;
    const box = [[], []], lineups = [null, null], fogos = [TEAM, TEAM];   // box[i] = penalties in order
    let penSerial = 0;
    const emit = (type, f) => { const e = Object.assign({ seq: seq++, type, t: time, period, left }, f); ledger.push(e); return e; };

    // Penalty clock: runs only for penalties being served, at most three per team (7-2-f). Carries across periods (7-2-c).
    const serving = i => box[i].filter(p => p.started);
    const startWaiting = i => { box[i].forEach(p => { if (!p.started && serving(i).length < RULES.maxInPenaltyArea) { p.started = true; emit('penalty_start', { team: i, penaltyId: p.id, player: p.player, ds: p.remain }); } }); };
    function endPenalty(i, p, reason) { box[i].splice(box[i].indexOf(p), 1); emit('penalty_end', { team: i, penaltyId: p.id, player: p.player, reason }); startWaiting(i); }
    function tick(dt) {
      while (dt > 0) {
        let step = dt;
        [0, 1].forEach(i => serving(i).forEach(p => { if (p.remain < step) step = p.remain; }));
        time += step; left -= step; if (poss !== null) clock -= step; dt -= step;
        [0, 1].forEach(i => { serving(i).forEach(p => { p.remain -= step; }); serving(i).filter(p => p.remain <= 0).forEach(p => endPenalty(i, p, 'served')); });
      }
    }
    const shortBy = i => serving(i).length, inBox = i => new Set(box[i].filter(p => p.player !== TEAM).map(p => p.player));   // waiting to serve counts as off the field (7-2 A.R. 1)

    // ---- who is on the field ----
    function currentLine(T) {
      const L = T.rotation.lines; if (!L.length) return [];
      const cycle = P.lineShiftSec * SEC * L.length, total = L.reduce((a, x) => a + x.share, 0);   // game time, so the schedule doesn't restart each period
      let x = ((time % cycle) / cycle) * total; for (const l of L) { x -= l.share; if (x < 0) return l.players; } return L[L.length - 1].players;
    }
    const offenseUnit = i => A[i].rotation.attack.concat(currentLine(A[i]));
    const defenseUnit = i => A[i].rotation.defense;
    function setLineup(i, players) { const on = players.filter(j => !inBox(i).has(j)), key = on.join(','); if (lineups[i] !== key) { lineups[i] = key; emit('lineup', { team: i, players: on, goalie: A[i].rotation.goalie || TEAM }); } }
    const onField = i => (lineups[i] ? lineups[i].split(',').filter(Boolean) : []);

    function beginPossession(i, source, clockDs, clear) {
      poss = i; clock = clockDs; needClear = clear && s('clearNeed')() < (P.clearRequired ?? 1); pid++;
      setLineup(i, offenseUnit(i)); setLineup(1 - i, defenseUnit(1 - i));
      emit('possession_start', { team: i, pid, source, clock });
    }
    function endPossession(reason) { if (poss === null) return; emit('possession_end', { team: poss, pid, reason }); poss = null; }

    function turnover(reason, player, causedBy) {
      const i = poss;
      emit('turnover', { team: i, pid, reason, player, causedBy: causedBy || null, causedTeam: causedBy ? 1 - i : null });
      endPossession('turnover');
      return 1 - i;
    }

    // ---- faceoff ----
    function faceoff() {
      [0, 1].forEach(i => { const fogo = A[i].rotation.fogo.length ? pick(A[i].rotation.fogo.map(f => f.id), Object.fromEntries(A[i].rotation.fogo.map(f => [f.id, f.weight])), s('fogo')) : TEAM; fogos[i] = fogo; setLineup(i, offenseUnit(i).concat(fogo === TEAM ? [] : [fogo])); });
      const d = gammaDs(P.tempo.faceoffMeanSec, s('time'));
      if (d >= left) { tick(left); return; }     // the quarter ends first: no faceoff credit (manual section 6)
      tick(d);
      const w = s('fo')() < W.fo ? 0 : 1;
      emit('faceoff', { winner: w, fw: fogos[w], fl: fogos[1 - w] });
      groundBall(w, 'faceoff');
      beginPossession(w, 'faceoff', RULES.shotClockFullDs, false);
    }
    function groundBall(i, ctx) { const on = onField(i), who = A[i].gbShares ? pick(on, A[i].gbShares, s('gb')) : TEAM; emit('ground_ball', { team: i, player: who, ctx }); }

    // ---- fouls ----
    function commitPenalty(i, withBall) {
      const D = P.penalties, u = s('foul'), technical = u() < D.technicalShare;
      const ds = technical ? RULES.technicalDs : (() => { let r = u(); for (let k = 0; k < D.personalMix.length; k++) { r -= D.personalMix[k]; if (r < 0) return RULES.personalDs[k]; } return RULES.personalDs[0]; })();
      const releasable = u() >= D.nonreleasableShare;
      const player = A[i].penaltyShares ? pick(onField(i), A[i].penaltyShares, u) : TEAM;
      // 6-2: a technical foul by the team with the ball costs possession only, with no time served.
      if (withBall && technical) { emit('penalty', { team: i, player, kind: 'technical', ds: 0, releasable: false, withBall }); return; }
      const p = { id: ++penSerial, player, remain: ds, releasable, started: false };
      emit('penalty', { team: i, player, kind: technical ? 'technical' : 'personal', ds, releasable, withBall, penaltyId: p.id });
      box[i].push(p); startWaiting(i);
      if (player !== TEAM) { const on = onField(i).filter(j => j !== player); lineups[i] = on.join(','); emit('lineup', { team: i, players: on, goalie: A[i].rotation.goalie || TEAM }); }
    }

    // ---- shot ----
    function shot() {
      const i = poss, o = 1 - i, T = A[i], w = W.teams[i], on = onField(i);
      const shooters = on.filter(j => w.shooters[j]), who = shooters.length ? pick(shooters, Object.fromEntries(T.shooters.map(x => [x.id, x.share])), s('who')) : TEAM;
      const sp = w.shooters[who] || w.shooters[TEAM];
      if (!sp) throw new Error('no shooting parameters for ' + who);
      const extra = shortBy(o) > shortBy(i), up = extra ? T.manUpShift : 0, r = invLogit(logit(sp.r) + A[o].opposingFinishShift + up), q = invLogit(logit(sp.q) + up);
      const pr = outcomeProbs(w.blocked, q, r, w.pipeOfOff);
      let x = s('shot')(), outcome = 'wide';
      for (const k of ['goal', 'save', 'pipe', 'blocked', 'wide']) { x -= pr[k]; if (x < 0) { outcome = k; break; } }
      const goalie = A[o].rotation.goalie || TEAM, f = { team: i, pid, shooter: who, outcome, goalie, clock, extraMan: extra, shortHanded: shortBy(i) > shortBy(o) };
      if (outcome === 'goal') {
        if (s('assist')() < w.assist) { const mates = on.filter(j => j !== who); f.assist = who === TEAM ? TEAM : pick(mates, T.assistShares, s('assist')); if (f.assist === TEAM && who !== TEAM) delete f.assist; }
        emit('shot', f); score[i]++;
        endPossession('goal');
        serving(o).filter(MS.releasedByGoal).slice().forEach(p => endPenalty(o, p, 'goal'));
        if (overtime) { over = true; }
        return;
      }
      emit('shot', f);
      const R = P.retention, u = s('rebound'), keep = base => { const sh = T.retentionShift; return sh ? invLogit(logit(base) + sh) : base; };
      if (outcome === 'wide') {
        // Dead ball: the clock is stopped. 4-7-b-3: nearest inbounds player's team gets it. Wide is not a valid shot, so no reset.
        if (u() < keep(R.wide)) { clock = MS.clockAfterShot(clock, outcome, true, true); emit('retained', { team: i, pid, outcome, clock }); return; }
        endPossession('defense_gain'); beginPossession(o, 'shot_out_of_bounds', RULES.shotClockFullDs, true); return;
      }
      if (outcome === 'save' && u() < (T.retentionShift ? 1 - keep(1 - R.saveHeld) : R.saveHeld)) { endPossession('defense_gain'); beginPossession(o, 'goalie_save', RULES.shotClockFullDs, true); return; }
      const d = gammaDs(P.tempo.looseMeanSec, s('time'));
      if (d >= left) { tick(left); return; }
      emit('loose_ball', { team: i, pid, outcome, ds: d });
      tick(d);
      const toShooters = u() < keep(outcome === 'blocked' ? R.blocked : R.loose);
      if (toShooters) {
        groundBall(i, 'rebound');
        const next = MS.clockAfterShot(clock, outcome, true, true);
        if (next <= 0) { clock = 0; const n = turnover('shot_clock', TEAM); beginPossession(n, 'shot_clock', RULES.shotClockFullDs, true); return; }
        clock = next; emit('retained', { team: i, pid, outcome, clock });
        return;
      }
      groundBall(o, 'rebound');
      endPossession('defense_gain'); beginPossession(o, 'loose_ball', RULES.shotClockFullDs, true);
    }

    // ---- one step of a possession ----
    function step() {
      const i = poss, T = A[i], w = W.teams[i], u = s('action');
      if (needClear) {
        const d = Math.min(gammaDs(P.tempo.clearMeanSec, s('time')), Math.max(1, clock - RULES.shotClockRetainedDs));
        if (d >= left) { tick(left); return; }
        tick(d);
        const made = u() < w.clear; emit('clear', { team: i, pid, ok: made });
        if (!made) { const n = turnover('failed_clear', TEAM); beginPossession(n, 'failed_clear', RULES.shotClockFullDs, false); return; }
        needClear = false; return;
      }
      const d = gammaDs(P.tempo.actionMeanSec, s('time'));
      if (d >= left && left <= clock) { tick(left); return; }
      if (d >= clock) { tick(clock); clock = 0; const n = turnover('shot_clock', TEAM); beginPossession(n, 'shot_clock', RULES.shotClockFullDs, true); return; }
      tick(d);
      // A foul by either team can end the action first.
      const fo = T.rates.foulPerAction * (1 - P.penalties.defenseFoulShare), fd = A[1 - i].rates.foulPerAction * P.penalties.defenseFoulShare, x = s('foulAt')();
      if (x < fd) { commitPenalty(1 - i, false); clock = MS.clockAfterFoulRetained(clock); emit('restart', { team: i, pid, clock, reason: 'foul' }); return; }
      if (x < fd + fo) { commitPenalty(i, true); const n = turnover('foul', TEAM); beginPossession(n, 'foul', RULES.shotClockFullDs, false); return; }
      if (u() < w.shotVsTO) { shot(); return; }
      const on = onField(i), who = s('toWho')() < T.rates.teamTurnoverShare ? TEAM : pick(on, T.turnoverShares, s('toWho'));
      const caused = s('caused')() < w.caused ? (A[1 - i].causedShares ? pick(onField(1 - i), A[1 - i].causedShares, s('caused')) : TEAM) : null;
      const n = turnover('play', who, caused);
      if (s('rebound')() < (P.retention.turnoverGroundBall ?? 0)) groundBall(n, 'turnover');
      beginPossession(n, 'turnover', RULES.shotClockFullDs, true);
    }

    function runPeriod() {
      period++; overtime = period > RULES.regulationPeriods; left = overtime ? RULES.overtimeDs : RULES.periodDs;
      emit('period_start', { overtime });
      if (carry && carry.type === 'possession') beginPossession(carry.team, 'period_carry', carry.clockDs, false);
      carry = null;
      while (left > 0 && !over) { if (poss === null) faceoff(); else step(); }
      if (over) { emit('period_end', { reason: 'goal' }); return; }
      // 4-3-a Exception 1: an extra man at the horn with a team in possession restarts with the ball.
      const a = shortBy(0), b = shortBy(1), manUp = a === b ? null : (a > b ? 1 : 0), holding = poss, heldClock = clock;
      endPossession('period_end');
      emit('period_end', { reason: 'horn' });
      carry = MS.nextPeriodStart(manUp, holding, heldClock);
    }

    emit('game_start', { teams: A.map(T => T.id) });
    for (let p = 0; p < RULES.regulationPeriods; p++) runPeriod();
    while (score[0] === score[1] && !over) { if (period >= RULES.regulationPeriods + RULES.maxOvertimePeriods) { emit('game_abandoned', { reason: 'overtime guard' }); break; } runPeriod(); }
    const finished = score[0] !== score[1];
    emit('game_end', { score: score.slice(), winner: finished ? (score[0] > score[1] ? 0 : 1) : null, periods: period, overtime: period > RULES.regulationPeriods });
    return { seed, ledger };
  }

  // ---- box score: derived only from the ledger ----
  const blank = () => ({ g: 0, a: 0, sh: 0, sog: 0, bl: 0, pipe: 0, wide: 0, to: 0, ct: 0, gb: 0, fw: 0, fl: 0, sv: 0, ga: 0, pen: 0, penDs: 0, ds: 0, poss: 0, shotsFaced: 0 });
  function boxFromLedger(ledger) {
    const players = [{}, {}], teams = [Object.assign(blank(), { possessions: 0, clearAtt: 0, clearMade: 0, emGoals: 0, shGoals: 0, emOpps: 0, shotClock: 0 }), Object.assign(blank(), { possessions: 0, clearAtt: 0, clearMade: 0, emGoals: 0, shGoals: 0, emOpps: 0, shotClock: 0 })];
    const P = (i, id) => players[i][id] || (players[i][id] = blank());
    const add = (i, id, k, n) => { P(i, id)[k] += n; teams[i][k] += n; };
    const on = [[], []], goalie = [TEAM, TEAM]; let last = 0;
    const flush = t => { const dt = t - last; if (dt > 0) [0, 1].forEach(i => { on[i].forEach(j => { P(i, j).ds += dt; }); P(i, goalie[i]).ds += dt; }); last = t; };
    let end = null;
    for (const e of ledger) {
      flush(e.t);
      switch (e.type) {
        case 'lineup': on[e.team] = e.players.slice(); goalie[e.team] = e.goalie; break;
        case 'possession_start': teams[e.team].possessions++; on[e.team].forEach(j => { P(e.team, j).poss++; }); break;
        case 'shot': {
          const i = e.team, o = 1 - i;
          add(i, e.shooter, 'sh', 1);
          if (e.outcome === 'goal' || e.outcome === 'save') add(i, e.shooter, 'sog', 1);
          if (e.outcome === 'pipe') add(i, e.shooter, 'pipe', 1);
          if (e.outcome === 'wide') add(i, e.shooter, 'wide', 1);
          if (e.outcome === 'blocked') add(i, e.shooter, 'bl', 1);
          if (e.outcome === 'save') add(o, e.goalie, 'sv', 1);
          if (e.outcome === 'goal') { add(i, e.shooter, 'g', 1); add(o, e.goalie, 'ga', 1); if (e.assist) add(i, e.assist, 'a', 1); if (e.extraMan) teams[i].emGoals++; if (e.shortHanded) teams[i].shGoals++; }
          break;
        }
        case 'team_save': add(e.team, TEAM, 'sv', 1); break;   // statistician's credit, used in hand-built fixtures
        case 'turnover': add(e.team, e.player, 'to', 1); if (e.causedBy) add(e.causedTeam, e.causedBy, 'ct', 1); if (e.reason === 'shot_clock') teams[e.team].shotClock++; break;
        case 'ground_ball': add(e.team, e.player, 'gb', 1); break;
        case 'faceoff': add(e.winner, e.fw, 'fw', 1); add(1 - e.winner, e.fl, 'fl', 1); break;
        case 'clear': teams[e.team].clearAtt++; if (e.ok) teams[e.team].clearMade++; break;
        case 'penalty': add(e.team, e.player, 'pen', 1); P(e.team, e.player).penDs += e.ds; teams[e.team].penDs += e.ds; if (e.ds) teams[1 - e.team].emOpps++; break;
        case 'game_end': end = e; break;
      }
    }
    return { players, teams, score: [teams[0].g, teams[1].g], winner: end ? end.winner : null, periods: end ? end.periods : null, overtime: end ? end.overtime : null, seconds: last / SEC };
  }

  // ---- accounting checks for one game. Returns a list of problems; empty means it reconciles. ----
  function validateGame(ledger, P) {
    const bad = []; const B = boxFromLedger(ledger);
    const end = ledger[ledger.length - 1];
    if (!end || end.type !== 'game_end') bad.push('no game_end');
    if (end && end.winner === null) bad.push('no winner');
    if (end && (end.score[0] !== B.score[0] || end.score[1] !== B.score[1])) bad.push('ledger score differs from box');
    if (B.score[0] === B.score[1]) bad.push('tied final');
    const onField = [new Set(), new Set()], open = {}, closed = {}, inPen = [0, 0];
    let lastT = 0, lastSeq = -1, cur = null, liveInPeriod = 0, periodStartT = 0, periods = 0;
    const present = (i, id) => { if (id === TEAM) return true; return onField[i].has(id); };
    const roster = P ? P.teams.map(T => new Set([].concat(T.rotation.attack, ...T.rotation.lines.map(l => l.players), T.rotation.defense, T.rotation.fogo.map(f => f.id), T.rotation.goalie ? [T.rotation.goalie] : []))) : null;
    for (const e of ledger) {
      if (e.t < lastT) bad.push(`time went backward at ${e.seq}`);
      if (e.seq !== lastSeq + 1) bad.push(`sequence gap at ${e.seq}`);
      lastT = e.t; lastSeq = e.seq;
      if (e.left < 0) bad.push(`negative period clock at ${e.seq}`);
      if (e.clock !== undefined && (e.clock < 0 || e.clock > RULES.shotClockFullDs)) bad.push(`invalid shot clock ${e.clock} at ${e.seq}`);
      switch (e.type) {
        case 'period_start': periods++; periodStartT = e.t; break;
        case 'period_end': { const len = e.t - periodStartT, full = e.period > RULES.regulationPeriods ? RULES.overtimeDs : RULES.periodDs; if (e.reason === 'horn' && len !== RULES.periodDs) bad.push(`period ${e.period} ran ${len}`); if (len > full) bad.push(`period ${e.period} too long`); if (cur !== null) bad.push(`possession open at period end ${e.seq}`); break; }
        case 'lineup': onField[e.team] = new Set(e.players); if (roster) e.players.forEach(j => { if (!roster[e.team].has(j)) bad.push(`unlisted player ${j} on field`); }); break;
        case 'possession_start': if (cur !== null) bad.push(`possession started while ${cur} open`); if (open[e.pid]) bad.push(`pid ${e.pid} started twice`); open[e.pid] = e.team; cur = e.pid; break;
        case 'possession_end': if (closed[e.pid]) bad.push(`pid ${e.pid} ended twice`); if (cur !== e.pid) bad.push(`ended pid ${e.pid} while ${cur} open`); closed[e.pid] = e.reason; cur = null; break;
        case 'shot':
          if (cur !== e.pid) bad.push(`shot outside possession at ${e.seq}`);
          if (open[e.pid] !== e.team) bad.push(`shot by team without the ball at ${e.seq}`);
          if (!present(e.team, e.shooter)) bad.push(`absent shooter ${e.shooter}`);
          if (e.left <= 0) bad.push(`shot after the horn at ${e.seq}`);
          if (e.assist && e.assist === e.shooter && e.shooter !== TEAM) bad.push('self assist');
          if (e.assist && !present(e.team, e.assist)) bad.push(`absent passer ${e.assist}`);
          if (e.assist && e.outcome !== 'goal') bad.push('assist without goal');
          break;
        case 'turnover': if (cur !== e.pid) bad.push(`turnover outside possession at ${e.seq}`); if (!present(e.team, e.player)) bad.push(`absent turnover player ${e.player}`); if (e.causedBy && !present(e.causedTeam, e.causedBy)) bad.push(`absent caused-by ${e.causedBy}`); break;
        case 'faceoff': if (!present(e.winner, e.fw)) bad.push(`absent faceoff player ${e.fw}`); if (!present(1 - e.winner, e.fl)) bad.push(`absent faceoff player ${e.fl}`); break;
        case 'ground_ball': if (!present(e.team, e.player)) bad.push(`absent ground ball player ${e.player}`); break;
        case 'penalty_start': inPen[e.team]++; if (inPen[e.team] > RULES.maxInPenaltyArea) bad.push('more than three serving'); break;
        case 'penalty_end': inPen[e.team]--; break;
      }
    }
    Object.keys(open).forEach(pid => { if (!closed[pid]) bad.push(`pid ${pid} never ended`); });
    [0, 1].forEach(i => {
      const T = B.teams[i], sum = k => Object.values(B.players[i]).reduce((a, x) => a + x[k], 0), o = 1 - i;
      ['g', 'a', 'sh', 'sog', 'to', 'ct', 'gb', 'fw', 'fl', 'sv', 'ga', 'pen'].forEach(k => { if (sum(k) !== T[k]) bad.push(`player plus team credits differ on ${k}`); });
      if (T.sh !== T.sog + T.pipe + T.wide + T.bl) bad.push('shots do not split into five outcomes');
      if (T.sog !== T.g + B.teams[o].sv - (ledger.filter(e => e.type === 'team_save' && e.team === o).length)) bad.push('on goal is not goals plus saves');
      if (T.g !== B.teams[o].ga) bad.push('goals differ from goals allowed');
      if (T.fw !== B.teams[o].fl) bad.push('faceoff wins and losses differ');
      if (T.a > T.g) bad.push('more assists than goals');
      if (T.ct > B.teams[o].to) bad.push('more caused turnovers than turnovers');
    });
    if (end && periods !== end.periods) bad.push('period count differs');
    return bad;
  }

  Object.assign(MS, { TEAM, hash32, gameSeed, makeStreams, drawBeta, betaMean, logit, invLogit, outcomeProbs, simulateGame, boxFromLedger, validateGame, drawWorld });
})(globalThis);

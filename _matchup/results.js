// W&L Matchup Studio: batch runner and results. Every number comes from per-game boxes built from each ledger.
// Rates are pooled across games. Quantiles are nearest-rank (sorted value at ceil(qM)) on each statistic's own per-game values.
// A zero denominator returns null, shown as a dash. Never a measured zero.
(function (g) {
  const MS = g.MS = g.MS || {};
  const rate = (n, d) => (d > 0 ? n / d : null);
  function nearestRank(sorted, q) { if (!sorted.length) return null; return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]; }
  const q1090 = a => { const s = a.slice().sort((x, y) => x - y); return { p10: nearestRank(s, 0.1), p90: nearestRank(s, 0.9) }; };
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  // Key-sorted JSON, so a hash doesn't depend on property order.
  const canon = v => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().filter(k => !k.startsWith('_') && v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));
  const hashOf = v => { const s = canon(v); return MS.hash32(s, 1).toString(16).padStart(8, '0') + MS.hash32(s, 2).toString(16).padStart(8, '0'); };

  // Compact per-game record: enough for every report, without keeping ledgers. A replay regenerates from the seed.
  function runGame(P, runSeed, index) {
    const seed = MS.gameSeed(runSeed, index), { ledger } = MS.simulateGame(P, seed), box = MS.boxFromLedger(ledger), problems = MS.validateGame(ledger, P);
    return { index, seed, box, problems, ledgerHash: MS.hash32(canon(ledger), 7) };
  }
  // Chunk size changes only how work is grouped, since each game's seed comes from the run seed and its index.
  function runBatch(P, opt) {
    const games = opt.games, chunk = opt.chunk || 200, out = [];
    let cancelled = false;
    for (let i = 0; i < games; i += chunk) {
      if (opt.shouldCancel && opt.shouldCancel(i)) { cancelled = true; break; }
      for (let k = i; k < Math.min(games, i + chunk); k++) out.push(runGame(P, opt.seed, k));
      if (opt.onProgress) opt.onProgress(out.length, games);
    }
    return finishRun(P, opt, out, cancelled);
  }
  function finishRun(P, opt, gamesOut, cancelled, failed) {
    const sorted = gamesOut.slice().sort((a, b) => a.index - b.index), valid = sorted.filter(x => !x.problems.length);
    const codeCommit = opt.codeCommit || (typeof Deno !== 'undefined' && Deno.env && (() => { try { return Deno.env.get('MS_COMMIT'); } catch (e) { return null; } })()) || null;
    const record = { runId: hashOf([hashOf(P), opt.seed, opt.games, codeCommit]), codeCommit, snapshotHash: P.snapshotHash || null, paramsHash: hashOf(P), modelVersion: MS.MODEL_VERSION, rulesVersion: MS.RULES.version, overrides: P.overrides || [], rotation: P.teams.map(T => T.rotation), seed: opt.seed, requestedGames: opt.games, completedGames: sorted.length, validGames: valid.length, invalidGames: sorted.length - valid.length, cancelled: !!cancelled, failedChunks: failed || 0, validationStatus: sorted.length - valid.length ? 'problems' : 'all reconciled', problemSamples: [...new Set(sorted.flatMap(x => x.problems))].slice(0, 12) };
    return { record, games: valid, summary: summarize(P, valid) };
  }

  function summarize(P, games) {
    const M = games.length, stats = {};
    if (!M) return { M: 0, teams: null, players: null };
    const teams = [0, 1].map(i => {
      const wins = games.filter(x => x.box.winner === i).length, sc = games.map(x => x.box.score[i]), mg = games.map(x => x.box.score[i] - x.box.score[1 - i]), T = games.map(x => x.box.teams[i]), O = games.map(x => x.box.teams[1 - i]);
      const sum = (A, k) => A.reduce((a, x) => a + x[k], 0), p = wins / M;
      return { id: P.teams[i].id, name: P.teams[i].name, winProbability: p, winMcSe: Math.sqrt(p * (1 - p) / M), avgScore: mean(sc), scoreRange: q1090(sc), avgMargin: mean(mg), marginRange: q1090(mg),
        shots: sum(T, 'sh') / M, shotsOnGoal: sum(T, 'sog') / M, shotPct: rate(sum(T, 'g'), sum(T, 'sh')), onGoalPct: rate(sum(T, 'sog'), sum(T, 'sh')), pipeShots: sum(T, 'pipe') / M, wideShots: sum(T, 'wide') / M, blockedShots: sum(T, 'bl') / M,
        saves: sum(T, 'sv') / M, savePct: rate(sum(T, 'sv'), sum(T, 'sv') + sum(T, 'ga')), turnovers: sum(T, 'to') / M, causedTurnovers: sum(T, 'ct') / M, groundBalls: sum(T, 'gb') / M,
        faceoffPct: rate(sum(T, 'fw'), sum(T, 'fw') + sum(T, 'fl')), faceoffsPerGame: (sum(T, 'fw') + sum(T, 'fl')) / M, possessions: sum(T, 'possessions') / M, goalsPer100Poss: rate(100 * sum(T, 'g'), sum(T, 'possessions')), turnoversPer100Poss: rate(100 * sum(T, 'to'), sum(T, 'possessions')),
        clearPct: rate(sum(T, 'clearMade'), sum(T, 'clearAtt')), clearAttempts: sum(T, 'clearAtt') / M, penalties: sum(T, 'pen') / M, penaltyMinutes: sum(T, 'penDs') / 600 / M, extraManGoals: sum(T, 'emGoals') / M, extraManOpps: sum(T, 'emOpps') / M, extraManPct: rate(sum(T, 'emGoals'), sum(T, 'emOpps')), shotClockTurnovers: sum(T, 'shotClock') / M };
    });
    const overtime = games.filter(x => x.box.overtime).length / M;
    const dist = (i, f) => { const c = {}; games.forEach(x => { const v = f(x, i); c[v] = (c[v] || 0) + 1; }); return c; };
    const scoreDist = [0, 1].map(i => dist(i, (x, t) => x.box.score[t])), marginDist = dist(0, x => x.box.score[0] - x.box.score[1]);
    const players = [0, 1].map(i => {
      const ids = [...new Set(games.flatMap(x => Object.keys(x.box.players[i])))].sort(), rows = {};
      ids.forEach(id => {
        const G = games.map(x => x.box.players[i][id] || null), z = k => G.map(p => (p ? p[k] : 0)), S = k => z(k).reduce((a, b) => a + b, 0), pts = G.map(p => (p ? p.g + p.a : 0));
        const eligible = games.filter(x => x.box.players[i][id] && x.box.players[i][id].sv + x.box.players[i][id].ga > 0).length;
        rows[id] = { goals: S('g') / M, assists: S('a') / M, points: mean(pts), pointsRange: q1090(pts), goalsRange: q1090(z('g')), assistsRange: q1090(z('a')), shots: S('sh') / M, shotPct: rate(S('g'), S('sh')), onGoalPct: rate(S('sog'), S('sh')), turnovers: S('to') / M, turnoversPer100Poss: rate(100 * S('to'), S('poss')), causedTurnovers: S('ct') / M, groundBalls: S('gb') / M, faceoffWins: S('fw') / M, faceoffAttempts: (S('fw') + S('fl')) / M, faceoffPct: rate(S('fw'), S('fw') + S('fl')), saves: S('sv') / M, goalsAllowed: S('ga') / M, savePct: rate(S('sv'), S('sv') + S('ga')), savePctGames: eligible, minutes: S('ds') / 600 / M, offensivePossessions: S('poss') / M, chance3Goals: z('g').filter(v => v >= 3).length / M };
      });
      // Chance to lead the team in points. Ties count as leading and are shown separately.
      const named = ids.filter(id => id !== MS.TEAM);
      const lead = {}, tied = {}; named.forEach(id => { lead[id] = 0; tied[id] = 0; });
      games.forEach(x => { const v = named.map(id => { const p = x.box.players[i][id]; return p ? p.g + p.a : 0; }), mx = Math.max(0, ...v); const n = v.filter(y => y === mx).length; named.forEach((id, k) => { if (v[k] === mx && mx > 0) { lead[id]++; if (n > 1) tied[id]++; } }); });
      named.forEach(id => { rows[id].chanceLeadPoints = lead[id] / M; rows[id].chanceLeadPointsTied = tied[id] / M; });
      return rows;
    });
    return { M, teams, overtimeProbability: overtime, scoreDist, marginDist, players, stats };
  }

  // Paired comparison of two plans over the same seeds. An unchanged plan gives exactly zero.
  function compareRuns(P1, P2, seed, games) {
    const d = [];
    for (let k = 0; k < games; k++) {
      const a = runGame(P1, seed, k), b = runGame(P2, seed, k);
      if (a.problems.length || b.problems.length) continue;
      d.push((b.box.winner === 0 ? 1 : 0) - (a.box.winner === 0 ? 1 : 0));
    }
    const m = mean(d) || 0, sd = d.length > 1 ? Math.sqrt(d.reduce((t, v) => t + (v - m) ** 2, 0) / (d.length - 1)) : 0;
    return { games: d.length, meanDiff: m, se: d.length ? sd / Math.sqrt(d.length) : null };
  }
  const regenerate = (P, runSeed, index) => MS.simulateGame(P, MS.gameSeed(runSeed, index));
  Object.assign(MS, { rate, nearestRank, q1090, canon, hashOf, runGame, runBatch, finishRun, summarize, compareRuns, regenerate });
})(globalThis);

// ---- Worker runner: chunks run in workers with progress and cancellation. Same games regardless of chunk size or worker count. ----
(function (g) {
  const MS = g.MS;
  function runBatchWorkers(P, opt, makeWorker) {
    const games = opt.games, chunk = opt.chunk || 500, nW = Math.max(1, opt.workers || 2), all = [], jobs = [];
    for (let i = 0; i < games; i += chunk) jobs.push([i, Math.min(games, i + chunk)]);
    let next = 0, cancelled = false, failed = 0;
    const crew = () => new Promise(res => {
      const w = makeWorker();
      const give = () => {
        if (opt.shouldCancel && opt.shouldCancel(all.length)) cancelled = true;
        if (cancelled || next >= jobs.length) { w.terminate(); res(); return; }
        const job = jobs[next++];
        w.onmessage = e => { all.push(...e.data.games); if (opt.onProgress) opt.onProgress(all.length, games); give(); };
        w.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); failed++; w.terminate(); res(); };
        w.postMessage({ P, seed: opt.seed, from: job[0], to: job[1] });
      };
      give();
    });
    return Promise.all(Array.from({ length: Math.min(nW, jobs.length) }, crew)).then(() => MS.finishRun(P, opt, all, cancelled, failed));
  }
  MS.runBatchWorkers = runBatchWorkers;
})(globalThis);

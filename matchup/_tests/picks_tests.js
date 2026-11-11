// Pick rate tests. Synthetic only. Run: deno run --allow-read=. matchup/_tests/picks_tests.js (from the repo root)
await import(new URL('../picks.js', import.meta.url));
const MS = globalThis.MS; const results = [];
const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log((cond ? '  OK   ' : '  FAIL ') + name + (cond || info === undefined ? '' : '  ' + JSON.stringify(info).slice(0, 600))); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const D3 = { n: 8000, goal_pct: 0.27 };
const TEAM = 901, US = 410, OTHER = 902;
// clip: [sb, video, film, possessionScored, typ, id, offenseTeam]
const clip = (id, scored, off) => ['G', 10, 'F', scored ? 1 : 0, 'settled', id, off];
const tag = o => Object.assign({ cov: null, oT: US, dT: TEAM, scr: null, usr: null, sd: null, ud: null, lat: null, dist: null, res: null, call: null, cj: null, cT: null, sb: 'G', typ: 'settled', pg: 0, by: 't', at: 'x' }, o);

// ---- 1. Nothing tagged: team rate only, pulled toward D3 with the fixed weight
{
  const r = MS.pickRates({ side: 'def', teamId: TEAM, clips: [clip('a', 0, US)], tags: {}, legacy: {}, teamPick: { n: 120, goal_pct: 0.2 }, d3Pick: D3 });
  ok('no tags: team rate = (24 + 30 × 0.27) / (120 + 30)', near(r.team.value, (24 + 30 * 0.27) / 150) && r.team.k === 24 && r.team.n === 120 && r.team.w === 30, r.team);
  ok('no tags: no coverage rows, no players, flagged not enough', r.coverage.length === 0 && r.players.length === 0 && !r.enough.coverage && r.tagged === 0, r);
  ok('team trust uses the report thresholds (120 picks = solid)', r.team.trust === 'solid');
  const r0 = MS.pickRates({ side: 'def', teamId: TEAM, clips: [], tags: {}, teamPick: null, d3Pick: D3 });
  ok('no team film data: team rate is the D3 rate, marked thin', near(r0.team.value, 0.27) && r0.team.trust === 'thin', r0.team);
  let threw = false; try { MS.pickRates({ side: 'x', teamId: 1, clips: [], tags: {}, d3Pick: D3 }); } catch (e) { threw = true; } ok('a bad side is refused', threw);
  threw = false; try { MS.pickRates({ side: 'def', teamId: 1, clips: [], tags: {} }); } catch (e) { threw = true; } ok('a missing D3 rate is refused', threw);
}
// ---- 2. Records: new tags, older one-word tags, cleared tags, goal source
{
  const clips = [clip('a', 1, US), clip('b', 0, US), clip('c', 1, OTHER), clip('d', 0, OTHER), clip('e', 1, US)];
  const tags = { a: tag({ cov: 'Switch', res: 'reset' }), b: tag({ cov: 'Go under', res: 'goal_pick' }), d: tag({ cov: null, res: null }) };
  const legacy = { c: 'Fight over', d: 'Switch', a: 'Hedge & recover' };
  const R = MS.pickRecords('def', TEAM, clips, tags, legacy), by = Object.fromEntries(R.map(r => [r.id, r]));
  ok('tagged result decides the goal (a: scored possession but tagged reset = no goal)', by.a.goal === false && by.a.resultTagged);
  ok('tagged goal counts even when the possession flag says no (b)', by.b.goal === true);
  ok('older one-word tag counts as coverage only, goal from the possession (c)', by.c.cov === 'Fight over' && by.c.legacy && by.c.goal === true && !by.c.resultTagged && by.c.oT === OTHER);
  ok('a cleared new tag falls back to the older tag (d)', by.d && by.d.cov === 'Switch' && by.d.legacy);
  ok('a new tag wins over an older tag on the same clip (a)', by.a.cov === 'Switch' && !by.a.legacy);
  ok('an untagged clip is left out (e)', !by.e && R.length === 4);
  const R2 = MS.pickRecords('off', TEAM, clips, {}, legacy);
  ok('older one-word tags only apply to the defense side', R2.length === 0);
}
// ---- 3. Coverage mix and results by coverage
{
  const clips = [], tags = {};
  // 10 Switch (2 goals, 3 shots, 3 TOs, 2 other), 5 Go under (3 goals, 1 shot, 1 other), all result-tagged
  const plan = [...Array(2).fill(['Switch', 'goal_pick']), ...Array(3).fill(['Switch', 'shot_saved']), ...Array(3).fill(['Switch', 'to_forced']), ...Array(2).fill(['Switch', 'reset']),
    ...Array(3).fill(['Go under', 'goal_later']), ['Go under', 'shot_missed'], ['Go under', 'slide']];
  plan.forEach(([cov, res], i) => { clips.push(clip('p' + i, 0, US)); tags['p' + i] = tag({ cov, res }); });
  const r = MS.pickRates({ side: 'def', teamId: TEAM, clips, tags, teamPick: { n: 100, goal_pct: 0.3 }, d3Pick: D3 });
  const t = (30 + 30 * 0.27) / 130, sw = r.coverage.find(c => c.coverage === 'Switch'), gu = r.coverage.find(c => c.coverage === 'Go under');
  ok('only coverages seen are listed when no league mix is given', r.coverage.length === 2 && r.mixPrior.startsWith('even split'), r.coverage.map(c => c.coverage));
  ok('mix shares sum to 1', near(r.coverage.reduce((a, c) => a + c.share.value, 0), 1));
  ok('Switch share = (10 + 10 × 0.5) / (15 + 10), renormalized', near(sw.share.value, (10 + 5) / 25 / (((10 + 5) + (5 + 5)) / 25)), sw.share);
  ok('Switch goal rate = (2 + 20 × team) / (10 + 20)', near(sw.goal.value, (2 + 20 * t) / 30), { got: sw.goal.value, want: (2 + 20 * t) / 30 });
  ok('Go under goal rate is higher than Switch (3 of 5 vs 2 of 10)', gu.goal.value > sw.goal.value);
  ok('team shot rate from tagged results is raw without a league pool (4 of 15)', near(r.teamShot.value, 4 / 15) && r.teamShot.w === 0);
  ok('Switch shot rate = (3 + 20 × 4/15) / (10 + 20)', near(sw.shot.value, (3 + 20 * 4 / 15) / 30), sw.shot);
  ok('Switch turnover rate = (3 + 20 × 3/15) / (10 + 20)', near(sw.to.value, (3 + 20 * 3 / 15) / 30), sw.to);
  ok('every rate carries its counts, prior, weight and formula', [sw.goal, sw.shot, sw.to, sw.share].every(x => typeof x.formula === 'string' && x.n != null && x.k != null && x.w != null));
  ok('15 coverage tags is enough for a read; result count shown', r.enough.coverage && r.enough.results && r.resultTagged === 15);
  // With a league pool
  const lp = MS.pickLeaguePools([{ side: 'def', teamId: TEAM, clips, tags }, { side: 'def', teamId: OTHER, clips: [clip('q', 0, US)], tags: { q: tag({ cov: 'Hedge & recover', res: 'reset', dT: OTHER }) } }]);
  ok('league pools count coverages and results across teams', lp.mix.Switch === 10 && lp.mix['Hedge & recover'] === 1 && lp.results.n === 16 && lp.results.goal === 5, lp);
  const r2 = MS.pickRates({ side: 'def', teamId: TEAM, clips, tags, teamPick: { n: 100, goal_pct: 0.3 }, d3Pick: D3, leagueMix: lp.mix, leagueResults: lp.results });
  ok('with a league mix, coverages seen elsewhere are listed with a small share', r2.coverage.some(c => c.coverage === 'Hedge & recover' && c.n === 0 && c.share.value > 0 && c.share.value < 0.1), r2.coverage.map(c => [c.coverage, c.share.value]));
  ok('with league results, the team shot rate is pulled toward the league', near(r2.teamShot.value, (4 + 20 * (lp.results.shot / 16)) / (15 + 20)) && r2.teamShot.w === 20);
}
// ---- 4. Players
{
  const clips = [], tags = {};
  // Defender #7: 10 picks, 1 goal. Defender #8: 10 picks, 6 goals. All Switch.
  for (let i = 0; i < 10; i++) { clips.push(clip('s' + i, 0, US)); tags['s' + i] = tag({ cov: 'Switch', res: i < 1 ? 'goal_pick' : 'reset', sd: '7', ud: '20' }); }
  for (let i = 0; i < 10; i++) { clips.push(clip('t' + i, 0, US)); tags['t' + i] = tag({ cov: 'Switch', res: i < 6 ? 'goal_pick' : 'reset', sd: '8', ud: '21', call: i < 6 ? 'fault' : null, cj: i < 6 ? '8' : null, cT: i < 6 ? TEAM : null }); }
  tags.t9 = tag({ cov: 'Switch', res: 'to_forced', sd: '8', ud: '21', call: 'credit', cj: '99', cT: US });
  const r = MS.pickRates({ side: 'def', teamId: TEAM, clips, tags, teamPick: { n: 200, goal_pct: 0.3 }, d3Pick: D3 });
  const p7 = r.players.find(p => p.jersey === '7'), p8 = r.players.find(p => p.jersey === '8');
  ok('defenders are counted from both defender slots', p7.n === 10 && p8.n === 10 && r.players.some(p => p.jersey === '20') && r.players.some(p => p.jersey === '21'));
  ok('screeners are not counted on the defense side', !r.players.some(p => p.roles.scr || p.roles.usr));
  ok('#7 (1 goal in 10) is better than expected, #8 (6 in 10) worse', p7.diff < 0 && p8.diff > 0, [p7.diff, p8.diff]);
  ok('player rate = (goals off the pick + 15 × expected) / (n + 15)', near(p7.rate.value, (1 + 15 * p7.rate.prior) / 25) && p7.rate.w === 15);
  // A goal later in the possession is counted separately and not against the defender.
  const lt = {}; const lc = []; for (let i = 0; i < 12; i++) { lc.push(clip('L' + i, 0, US)); lt['L' + i] = tag({ cov: 'Switch', res: i < 6 ? 'goal_later' : 'reset', sd: '5', ud: '6' }); }
  for (let i = 0; i < 12; i++) { lc.push(clip('M' + i, 0, US)); lt['M' + i] = tag({ cov: 'Switch', res: i < 3 ? 'goal_pick' : 'reset', sd: '50', ud: '60' }); }
  const rl = MS.pickRates({ side: 'def', teamId: TEAM, clips: lc, tags: lt, teamPick: { n: 200, goal_pct: 0.3 }, d3Pick: D3 });
  const p5 = rl.players.find(p => p.jersey === '5'), p50 = rl.players.find(p => p.jersey === '50');
  ok('goals later in the possession are counted separately, not as the defender’s goals', p5.goals === 0 && p5.later === 6 && p50.goals === 3 && p5.diff < p50.diff, [p5, p50]);
  const lg = MS.pickRates({ side: 'def', teamId: TEAM, clips: [clip('x', 1, US)], tags: { x: tag({ cov: 'Switch', sd: '5' }) }, legacy: {}, teamPick: { n: 50, goal_pct: 0.3 }, d3Pick: D3 });
  ok('picks without a tagged result count toward picks seen but not toward the player rate', lg.players[0].all === 1 && lg.players[0].n === 0 && lg.players[0].rate === null);
  ok('fault counts go to their own player; credit given to another team is not counted', p8.fault === 6 && p8.credit === 0 && !r.players.some(p => p.jersey === '99'), p8);
  ok('players with 10+ picks are marked usable for the sim', p7.used && p8.used);
  // Offense side: their own picks. #2 screens and #3 uses 12 times (5 goals); defenders are the other team and not listed.
  const oc = [], ot = {};
  for (let i = 0; i < 12; i++) { oc.push(clip('o' + i, 0, TEAM)); ot['o' + i] = tag({ oT: TEAM, dT: US, cov: 'Switch', res: i < 5 ? 'goal_pick' : 'reset', scr: '2', usr: '3', sd: '90', ud: '91' }); }
  for (let i = 0; i < 12; i++) { oc.push(clip('q' + i, 0, TEAM)); ot['q' + i] = tag({ oT: TEAM, dT: US, cov: 'Switch', res: i < 1 ? 'goal_pick' : 'reset', scr: '4', usr: '5', sd: '90', ud: '91' }); }
  const r2 = MS.pickRates({ side: 'off', teamId: TEAM, clips: oc, tags: ot, teamPick: { n: 200, goal_pct: 0.3 }, d3Pick: D3 });
  const p3 = r2.players.find(p => p.jersey === '3');
  ok('offense side counts their screeners and ball carriers, not the defenders', r2.players.length === 4 && r2.players.every(p => p.roles.scr || p.roles.usr) && p3.n === 12 && p3.goals === 5, r2.players);
  ok('on offense, more goals than expected shows as a positive difference', p3.diff > 0);
}
// ---- 5. Our picks against their defense
{
  const flat = { goal: { value: 0.27 } };
  const def = { d3: D3, team: { value: 0.27 }, coverage: [{ coverage: 'Switch', share: { value: 0.5 }, n: 10, goal: { value: 0.27 } }, { coverage: 'Go under', share: { value: 0.5 }, n: 10, goal: { value: 0.27 } }] };
  const off = { team: { value: 0.27 }, coverage: [] };
  ok('both at D3: expected = D3', near(MS.pickMatchup(off, def).overall, 0.27));
  const def2 = JSON.parse(JSON.stringify(def)); def2.coverage[1].goal.value = 0.4;
  const m2 = MS.pickMatchup(off, def2);
  ok('a weaker coverage raises the expected rate for that coverage only', near(m2.rows[0].expected, 0.27) && m2.rows[1].expected > 0.27 && near(m2.overall, 0.5 * 0.27 + 0.5 * m2.rows[1].expected));
  const off2 = { team: { value: 0.35 }, coverage: [{ coverage: 'Switch', n: 12, goal: { value: 0.2 } }] };
  const m3 = MS.pickMatchup(off2, def);
  ok('our rate against a coverage is used where we have it, team rate elsewhere', near(m3.rows[0].ourRate, 0.2) && near(m3.rows[1].ourRate, 0.35));
  ok('log5 is symmetric and equals the other side at D3', near(MS.pickLog5(0.3, 0.27, 0.27), 0.3) && near(MS.pickLog5(0.3, 0.2, 0.27), MS.pickLog5(0.2, 0.3, 0.27)));
  ok('no coverage tags for them: falls back to team rates and says so', (() => { const m = MS.pickMatchup(off2, { d3: D3, team: { value: 0.3 }, coverage: [] }); return near(m.overall, MS.pickLog5(0.35, 0.3, 0.27)) && /team rates only/.test(m.note); })());
  void flat;
}
// ---- 5b. No borrowed splits
{
  const lp = { Switch: 30, 'Go under': 20 };
  const r = MS.pickRates({ side: 'def', teamId: TEAM, clips: [clip('a', 0, US)], tags: {}, teamPick: { n: 80, goal_pct: 0.25 }, d3Pick: D3, leagueMix: lp });
  ok('a team with no coverage tags gets no coverage split, even with a league mix', r.coverage.length === 0, r.coverage);
  const few = {}, fc = []; for (let i = 0; i < 6; i++) { fc.push(clip('f' + i, 0, US)); few['f' + i] = tag({ cov: 'Go under', res: 'reset' }); }
  const r2 = MS.pickRates({ side: 'def', teamId: TEAM, clips: fc, tags: few, teamPick: { n: 80, goal_pct: 0.25 }, d3Pick: D3, leagueMix: lp });
  const off = MS.pickRates({ side: 'off', teamId: US, clips: [], tags: {}, teamPick: { n: 90, goal_pct: 0.3 }, d3Pick: D3 });
  const m = MS.pickMatchup(off, r2);
  ok('under 15 coverage tags, the matchup uses team rates only and says how many tags there are', m.rows.length === 0 && near(m.overall, m.teamOnly) && /Only 6 coverage tags/.test(m.note), m);
}
// ---- 6. Inputs are not changed, and the weights are fixed
{
  const clips = [clip('a', 1, US)], tags = { a: tag({ cov: 'Switch', res: 'goal_pick', sd: '7' }) }; const before = JSON.stringify([clips, tags]);
  const a = MS.pickRates({ side: 'def', teamId: TEAM, clips, tags, teamPick: { n: 50, goal_pct: 0.3 }, d3Pick: D3 }), b = MS.pickRates({ side: 'def', teamId: TEAM, clips, tags, teamPick: { n: 50, goal_pct: 0.3 }, d3Pick: D3 });
  ok('inputs are not modified', JSON.stringify([clips, tags]) === before);
  ok('same inputs give the same output', JSON.stringify(a) === JSON.stringify(b));
  ok('prior weights are frozen at team 30, coverage 20, mix 10, result 20, player 15', Object.isFrozen(MS.PICK_K) && JSON.stringify(MS.PICK_K) === JSON.stringify({ team: 30, coverage: 20, mix: 10, result: 20, player: 15 }));
  ok('every result key the tagger saves has a group', ['goal_pick', 'goal_later', 'shot_saved', 'shot_missed', 'shot_blocked', 'to_forced', 'to_unforced', 'penalty', 'slide', 'reset', 'broke', 'rescreen'].every(k => MS.PICK_RESULT_GROUP[k]));
}
const pass = results.filter(r => r.ok).length; console.log(`pick rates: pass ${pass}  fail ${results.length - pass}`); Deno.exit(pass === results.length ? 0 : 1);

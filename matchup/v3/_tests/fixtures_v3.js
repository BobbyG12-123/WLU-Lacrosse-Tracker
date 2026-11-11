// TEST ONLY: synthetic team records and tracker logs for engine v3 tests. Every name and number is made up.
(function (g) {
  const sd = () => ({ by_type: { transition: { n: 100, goal_pct: 0.14 }, early: { n: 30, goal_pct: 0.15 }, settled: { n: 250, goal_pct: 0.26 } }, pick: { n: 70, goal_pct: 0.27 }, no_pick_settled: { n: 180, goal_pct: 0.255 } });
  const team = (id, name, pre, opts) => ({ id, lg: 'd3m', name, short: name.slice(0, 3).toUpperCase(), n_league: 3,
    roster: [1, 2, 3, 4].map(i => ({ player_ID: id * 100 + i, jersey_number: String(i), player: `${pre}${i} Sample`, team_listed_class: i === 1 ? 'SR' : 'JR', role: 'offensive', shots: 50 + 10 * i, goals: 15 + i, offensive_EGA: 5 + i, defensive_EGA: 0, games_appeared_in: 10 }))
      .concat([{ player_ID: id * 100 + 30, jersey_number: '30', player: `${pre}G Sample`, team_listed_class: 'SO', role: 'goalkeeper', shots: 0, sog_faced: 300, save_pct: 0.5, defensive_EGA: 4, games_appeared_in: 10 }]),
    stats: { adjusted_off_efficiency: 0.27, adjusted_def_efficiency: 0.25, clear_rate: 0.9, adjusted_true_faceoff_win_rate: 0.5, record: '5 - 5' },
    ev: { n_games: 10, poss: { per_game: 45, off_len: 30 }, pens_pg: 3, failed_clears_pg: 2, emo: { goals: 36, chances: 100 }, mdd: { goals_allowed: 36, chances: 100 } },
    sb: { n_games: 10, off: sd(), def: sd(), fo_by_man: [], pick_clips_def: [], pick_clips_off: [], goal_clips_off: [['G1', 10, 'F', '2', 'settled', 'gc1'], ['G1', 20, 'F', '2', 'settled', 'gc2']] },
    games: (opts && opts.games) || [] });
  const wl = team(410, 'Washington and Lee', 'Testa', { games: [{ opponentID: 901, opponent_display: 'Testa College' }, { opponentID: 902, opponent_display: 'Sample State' }] });
  const opp = team(901, 'Testa College', 'Fixture'), opp2 = team(902, 'Sample State', 'Other');
  const meta = { season: 2026, updated: '2099-01-01', teams: [wl, opp, opp2].map(t => ({ id: t.id, name: t.name, lg: 'd3m' })),
    sb_league: { by_type: { transition: { n: 1000, goal_pct: 0.14 }, early: { n: 300, goal_pct: 0.15 }, settled: { n: 2500, goal_pct: 0.26 } }, pick: { n: 700, goal_pct: 0.27 }, no_pick: { n: 1800, goal_pct: 0.255 } } };
  const SHOT = ['id', 'date', 'practiceId', 'context', 'shooterJersey', 'goalieJersey', 'onGoal', 'onKeeper', 'goal', 'team', 'goalX', 'goalY', 'stintId', 'pickScreener', 'pickUser', 'pickResult', 'defender', 'defBeaten', 'offDodge', 'slideDefender', 'outcome'];
  const POSS = ['id', 'date', 'context', 'opponent', 'team', 'end', 'stintId'];
  const sess = {}, add = (sid, date, context, opponent) => (sess[sid] = { date, context, opponent: opponent || null });
  add('2026-09-10-practice', '2026-09-10', 'Practice'); add('2026-04-01-old', '2026-04-01', 'Practice'); add('2026-10-20-scrim', '2026-10-20', 'Scrimmage', 'Sample State');
  let n = 0; const s = (sid, o) => { const row = SHOT.map(c => o[c] ?? null); row[0] = ++n; sess[sid]['s_' + n] = JSON.stringify(row); };
  for (let i = 0; i < 30; i++) s('2026-09-10-practice', { team: 'WLU', pickScreener: i < 10 ? '7' : '8', pickUser: '9', goal: i < 10 ? (i < 6 ? 1 : 0) : (i % 4 === 0 ? 1 : 0), stintId: i < 15 ? 'sA' : 'sB' });
  for (let i = 0; i < 60; i++) s('2026-09-10-practice', { team: 'WLU', defender: i < 20 ? '40' : '41', defBeaten: i < 20 ? (i < 8 ? 'Yes' : 'No') : (i % 3 ? 'Yes' : 'No'), offDodge: 1, slideDefender: i % 2 ? '42' : null, goal: i % 3 === 0 ? 1 : 0 });
  for (const [j, gr] of [['31', 0.45], ['32', 0.6]]) for (let i = 0; i < 90; i++) s('2026-09-10-practice', { team: 'WLU', goalieJersey: j, goalX: (i % 3) / 3 + 0.1, goalY: (Math.floor(i / 3) % 3) / 3 + 0.1, goal: i < gr * 90 ? 1 : 0, onKeeper: 1 });
  for (let i = 0; i < 20; i++) s('2026-04-01-old', { team: 'WLU', goalieJersey: '31', goalX: 0.5, goalY: 0.5, goal: 1, onKeeper: 1 }); // last season: must be ignored
  for (let i = 0; i < 10; i++) s('2026-10-20-scrim', { team: 'WLU', goalieJersey: '31', goalX: 0.5, goalY: 0.5, goal: 1, onKeeper: 1 }); // our shots on their goalie: not ours
  for (let i = 0; i < 10; i++) { const row = POSS.map(c => ({ team: 'WLU', end: 'Turnover', stintId: i < 5 ? 'sA' : 'sB' })[c] ?? null); row[0] = 900 + i; sess['2026-09-10-practice']['p_' + (900 + i)] = JSON.stringify(row); }
  sess['2026-09-10-practice'].t_sA = JSON.stringify({ id: 'sA', offTeam: 'WLU', offense: ['7', '8', '9', '10', '11', '12'] });
  sess['2026-09-10-practice'].t_sB = JSON.stringify({ id: 'sB', offTeam: 'WLU', offense: ['7', '8', '9', '10', '11', '13'] });
  const app = { roster_2027: { list: [{ jersey: '7', name: 'Alder Testa' }, { jersey: '9', name: 'Birch Testa' }, { jersey: '31', name: 'Cedar Testa' }, { jersey: '32', name: 'Dogwood Testa' }, { jersey: '40', name: 'Elm Testa' }] } };
  const filmTags = { pick: { t: {} }, shot_off: { t: { gc1: { x: 50, y: 30, zone: 'Low left' }, gc2: { x: 40, y: 30, zone: 'Low left' } } } };
  g.FX3 = { team, wl, opp, opp2, meta, exp: { collections: { sessions: sess, app, filmTags } }, cols: { shot: SHOT, poss: POSS } };
})(globalThis);

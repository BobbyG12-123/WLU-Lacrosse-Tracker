// TEST ONLY: synthetic scouting records. Every team, player and number is made up.
(function () {
  const names = ['Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir', 'Gum', 'Hazel', 'Ivy', 'Juniper', 'Kapok', 'Larch', 'Maple', 'Nutmeg', 'Oak', 'Pine'];
  const roles = [['offensive', 'ATTACK'], ['offensive', 'ATTACK'], ['offensive', 'ATTACK'], ['offensive', 'MIDFIELD'], ['offensive', 'MIDFIELD'], ['offensive', 'MIDFIELD'],
    ['defensive', 'DEFENSE'], ['defensive', 'DEFENSE'], ['defensive', 'DEFENSE'], ['defensive', 'LSM'], ['defensive', 'SSDM'], ['faceoff', 'FACEOFF'], ['goalkeeper', 'GOALIE'], ['offensive', 'ATTACK'], ['defensive', 'DEFENSE'], ['offensive', 'MIDFIELD']];
  function roster(base, last, tid) {
    return names.map((n, i) => ({ ID: tid * 100 + i, player_ID: tid * 1000 + i, player: `${last} ${n}`, jersey_number: String(base + i), team_listed_class: ['FR', 'SO', 'JR', 'SR'][i % 4],
      role: roles[i][0], raw_team_listed_role: roles[i][1], games_appeared_in: i === 15 ? 0 : 10, goals: 0, assists: 0, shots: 0, sog: 0, saves: 0, sog_faced: 0, faceoffs_taken: 0 }));
  }
  const stats = { record: '5 - 5', elo_rating: 1500, games_played: 10 };
  function team(id, name, base, last, sb) {
    return { id, lg: 'd3m', name, short: name.slice(0, 3).toUpperCase(), n_league: 3, stats, ranks: {}, returning: {}, roster: roster(base, last, id), fogos: [], games: [], film: {}, ev: {}, sb };
  }
  const by = { transition: { n: 20, goal_pct: 0.2 }, early: { n: 5, goal_pct: 0.2 }, settled: { n: 40, goal_pct: 0.25 } };
  const side = { by_type: by, pick: { n: 12, goal_pct: 0.25 }, no_pick_settled: { n: 28, goal_pct: 0.25 }, dodge: { n: 20, goal_pct: 0.3 }, pick_dodge: { n: 6, goal_pct: 0.3 }, picks_per_poss: 0.3, dodges_per_poss: 0.8, run_outs_per_poss: 0.2, clear_fail: 0.1, after_timeout: { n: 0, goal_pct: 0 } };
  // Picks run against Testa College: four by W&L in game G1, four by Sample State in game G2.
  const def = [];
  for (let i = 0; i < 8; i++) def.push([i < 4 ? 'G1' : 'G2', 30 + i * 40, 'F1', i % 3 === 0 ? 1 : 0, 'settled', 'pd' + i, i < 4 ? 410 : 902]);
  const off = [];
  for (let i = 0; i < 6; i++) off.push([i < 3 ? 'G1' : 'G2', 50 + i * 40, 'F1', i === 1 ? 1 : 0, 'settled', 'po' + i, 901]);
  const sb901 = { n_games: 2, games: [1, 2], off: side, def: side, pick_clips_def: def, pick_clips_off: off, dodge_clips_def: [['G1', 400, 'F1', 0, 'settled', 'dd0'], ['G1', 440, 'F1', 1, 'settled', 'dd1']], goal_sequences: [], fo_by_man: [], saves_by_goalie: [], clips: {}, shot_quality: {} };
  const teams = { 410: team(410, 'Washington and Lee', 90, 'Testa', null), 901: team(901, 'Testa College', 1, 'Sample', sb901), 902: team(902, 'Sample State', 40, 'Fixture', null) };
  const meta = { updated: '2099-01-01', season: 2099, weights: { offensive: { Volume: 1 } }, models: { offense: {}, faceoff: {}, goalie: {} }, team_dists: {},
    sb_league: { films: { F1: 'missing_test_clip.mp4' } }, teams: Object.values(teams).map(t => ({ id: t.id, lg: 'd3m', name: t.name, short: t.short })) };
  window.__FIX = { teams, meta, legacy: { pd7: 'Switch' } };
})();

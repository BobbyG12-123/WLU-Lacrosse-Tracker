// TEST ONLY: helpers evaluated inside both tracker frames (main and branch) by phase0_tests.html.
// Read-only against the in-memory database, except T.correction (runs the prepared 9/25 correction in memory).
window.T = {
  setCtx(ctx) { NAV_ST.ctx = ctx; },
  tilesShots() { heatSeason = '2027'; renderPlayerTiles(); const t = document.querySelector('#playerTiles .stat-tile'); return t ? t.textContent.replace(/\s+/g, ' ').trim() : ''; },
  tilesN() { T.tilesShots(); const v = document.querySelector('#playerTiles .stat-tile .value'); return v ? Number(v.textContent.replace(/,/g, '')) : null; },
  eff(ctx) { const s0 = EFF_SEASON, c0 = EFF_CONTEXT; EFF_SEASON = '2027'; EFF_CONTEXT = ctx; try { const d = buildEffData(); return { shots: d.shots.length, goals: d.shots.filter(s => s.goal === 1).length, poss: d.poss.length, opp: d.oppShots.length,
    players: Object.values(d.players).map(p => [p.jersey, p.shots, p.goals, Math.round(p.xg * 1e9), p.to, p.ct, p.gbLog, p.potAst]).sort() }; } finally { EFF_SEASON = s0; EFF_CONTEXT = c0; } },
  brief() { const sl = briefSlices('2027'), S = sl.season.S.filter(s => s.shooterJersey); return { shots: S.length, goals: S.filter(s => s.goal === 1).length }; },
  trends(ctx, win) { NAV_ST.ctx = ctx; heatSeason = '2027'; trendWindow = win || 'days7'; trendMetric = 'shotPct'; renderShootingTrends(); return document.getElementById('shootingTrendsSub').textContent; },
  trends2026() { heatSeason = '2026'; renderShootingTrends(); const t = document.getElementById('shootingTrendsSub').textContent; heatSeason = '2027'; return t; },
  trigY() { heatSeason = '2027'; renderTriggerEfficiency(); const t = document.getElementById('trigExplainer').textContent; const m = t.match(/(\d+) of (\d+) 2027 shots/); return { text: t, tagged: m ? Number(m[1]) : null, of: m ? Number(m[2]) : null }; },
  compareTeam() { const sel = document.getElementById('cs_player'); sel.value = '__TEAM__'; renderCompareSeasons(); const ths = [...document.querySelectorAll('#compareSeasonsWrap th')].map(x => x.textContent.trim()); const i = ths.indexOf('2027');
    const row = [...document.querySelectorAll('#compareSeasonsWrap tr')].find(r => /^Shots/.test(r.textContent.trim())); return i < 0 || !row ? null : Number(row.children[i].textContent.trim()); },
  deepDiveInput() { return shotsForSeason('2027').filter(s => inPart(s, '2027') && (typeof offCtxOk === 'function' ? offCtxOk(s) : true)).filter(s => s.shooterJersey).length; },
  types() { return Object.keys(LIVE_SESSIONS).sort().map(k => [k, typeof sessionTypeOf === 'function' ? sessionTypeOf(Object.assign({}, LIVE_SESSIONS[k], { _sid: k })) : null]); },
  kind(k) { return rptSessKind(k); },
  chat(q) { return chatDates(q, '2027'); },
  chatDay(q) { NAV_ST.ctx = 'All'; try { const f = chatFacts(q); const lines = (Array.isArray(f) ? f : String(f).split('\n')); return lines.filter(l => /^(PRACTICE|GAME|SESSION|OPPONENT SCRIMMAGE|INTRA-SQUAD|SCRIMMAGE|SESSIONS)\b/i.test(l)).map(l => l.slice(0, 160)); } catch (e) { return ['ERR ' + e.message]; } },
  man() { const s0 = EFF_SEASON, c0 = EFF_CONTEXT; EFF_SEASON = '2027'; EFF_CONTEXT = 'All'; try { const d = buildEffData(), pl = d.possList; const c = {}; pl.forEach(p => { const k = p.team + ':' + p.man; c[k] = (c[k] || 0) + 1; });
    renderEffManUp(pl); const txt = document.getElementById('effManWrap').textContent; return { counts: c, unknownRow: /man situation not logged/.test(txt) }; } finally { EFF_SEASON = s0; EFF_CONTEXT = c0; } },
  onoff(ctx) { const s0 = EFF_SEASON, c0 = EFF_CONTEXT; EFF_SEASON = '2027'; EFF_CONTEXT = ctx || 'All'; effLineupMin = 5; try { const d = buildEffData(); renderEffLineups(d, d.possList);
    const top = [...document.querySelectorAll('#effOnOffWrap thead tr:first-child th')], bot = [...document.querySelectorAll('#effOnOffWrap thead tr:last-child th')];
    const ths = []; let bi = 0; top.forEach(th => { if (th.classList.contains('group-head')) { const k = Number(th.getAttribute('colspan')); for (let i = 0; i < k; i++) { const b = bot[bi++]; ths.push(b.dataset.key || b.textContent.trim()); } } else ths.push(th.dataset.key || th.textContent.trim()); });
    const rows = [...document.querySelectorAll('#effOnOffWrap tbody tr')].map(r => [...r.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
    return { ths, rows, sub: (document.getElementById('effOnOffSub') || {}).textContent || '' }; } finally { EFF_SEASON = s0; EFF_CONTEXT = c0; } },
  synthetic() {
    // In memory only: one extra shot with a pick but no coverage, and blank on-goal / off-dodge / location.
    const base = SHOTS.find(x => x.date >= '2026-10-07' && x.pick !== 'Yes' && x.shooterJersey && x.rebound !== 'Yes');
    const s = Object.assign({}, base, { id: 999901, eid: 'TEST', pick: 'Yes', pickCoverage: null, onGoal: null, offDodge: null, blocked: null, cleanSave: null, distanceYds: null, lateralYds: null });
    SHOTS.push(s);
    const out = {};
    try {
      const s0 = EFF_SEASON, c0 = EFF_CONTEXT; EFF_SEASON = '2027'; EFF_CONTEXT = 'All';
      try { const d = buildEffData(); const pp = d.possList.find(p => p.e === s); out.pickUnk = pp ? (pp.pickUnk || 0) : null; out.pickRow = pp ? !!pp.pick : null;
        renderEffPicks(d, d.possList); out.pickSub = document.getElementById('effPickSub').textContent; } finally { EFF_SEASON = s0; EFF_CONTEXT = c0; }
      out.noOnGoal = applyExtraFilters([s], Object.assign(readFilterState('pf_'), { onGoal: 'No' })).length;
      out.noDodge = applyExtraFilters([s], Object.assign(readFilterState('pf_'), { offDodge: 'No' })).length;
      out.noBlocked = applyExtraFilters([s], Object.assign(readFilterState('pf_'), { blocked: 'No' })).length;
      heatSeason = '2027'; document.getElementById('playerSelect').value = '__TEAM__'; renderPlayerHeat(); out.heat = document.getElementById('playerHeatWrap').textContent.replace(/\s+/g, ' ').match(/\d+ shot\(s\)[^—]*/);
      out.heat = out.heat ? out.heat[0] : '';
    } finally { SHOTS.pop(); }
    return out;
  },
  possEdit() {
    const p = POSSESSIONS.find(x => x.manSituation === 'Even' && x._sid); const keep = p.manSituation; p.manSituation = null;
    const sess = LIVE_SESSIONS[p._sid], q = sess && sess.poss.find(x => x.id === p.id); const keepQ = q ? q.manSituation : null; if (q) q.manSituation = null;
    try { startEditPoss(p.id, p._sid); return document.getElementById('p_mansituation').dataset.value || ''; } finally { try { exitPossEditMode(); resetPossFields(); } catch (e) { /* ignore */ } p.manSituation = keep; if (q) q.manSituation = keepQ; }
  },
  briefTxt(ctx) { NAV_ST.ctx = ctx; renderBrief(); return document.getElementById('briefWrap').textContent.replace(/\s+/g, ' '); },
  briefLast(ctx) { NAV_ST.ctx = ctx; const ls = briefLastSession('2027'); return ls ? { cur: ls.period.key, prior: ls.prior, kind: ls.kind || null } : null; },
  hotCold(ctx) { NAV_ST.ctx = ctx; return briefHotCold('2027'); },
  hotColdExpect(ctx) {
    const all = computeShooterScores('2027', 'shooting', null, ctx).list, rec = computeShooterScores('2027', 'shooting', briefFrom(), ctx).list;
    const base = Object.fromEntries(all.map(r => [r.jersey, r]));
    const moves = rec.filter(r => r.score !== null && r.shots >= BRIEF_HOT_MIN && base[r.jersey] && base[r.jersey].score !== null).map(r => ({ j: r.jersey, from: Math.round(base[r.jersey].score), to: Math.round(r.score), d: Math.round(r.score) - Math.round(base[r.jersey].score) }));
    moves.sort((a, b) => b.d - a.d); return { up: moves.filter(m => m.d > 0).slice(0, 3), down: moves.filter(m => m.d < 0).slice(-3).reverse(), n: moves.length };
  },
  navNotes(view, ctx) { NAV_ST.ctx = ctx; NAV_ST.season = '2027'; return navApplyFilters(view); },
  topBar() { drawNav(); return [...document.querySelectorAll('#sdFilters [data-nctx]')].map(b => b.textContent); },
  effPills() { return [...document.querySelectorAll('#effContextPills .pill')].map(b => b.textContent); },
  xgNote() { const s0 = EFF_SEASON; EFF_SEASON = '2027'; try { const d = buildEffData(); renderXgModelPanel(d.shots, d.model); return document.getElementById('effModelSub').textContent; } finally { EFF_SEASON = s0; } },
  rptAll(mode) { const out = {}; goNav('reports'); navPick('rptModePills', mode === 'practice' ? 'Practice' : 'Week'); rptMode = mode; rptPlayer = ''; rptGroup = '';
    rptPeriods(rptMode, true).forEach(p => { rptKey = p.key; renderReports(); out[p.key] = ['rptScore', 'rptTeam', 'rptFullTeam', 'rptPlayer', 'rptSheet'].map(id => (document.getElementById(id) || {}).innerHTML || '').join('|'); }); return out; },
  rptUses(key, X) { const curKeys = rptCurKeys({ key }); const first = rptPeriods('practice', true).find(p => p.key === curKeys.slice().sort()[0]); const kinds = new Set(curKeys.map(rptSessKind)), kind = kinds.size === 1 ? [...kinds][0] : 'mixed';
    return curKeys.includes(X) || rptEarlierSessions(curKeys, '2027', kind === 'mixed' ? null : kind, first).slice(0, RPT_PRIOR_SESSIONS).some(p => p.key === X); },
  // ---- partition: every 2027 WLU shot in exactly one session-type category
  partition() { const cats = ['Practice', 'Intra-squad', 'Opponent scrimmage', 'Game', 'Type not recorded'], all = advShots('2027').filter(s => s.shooterJersey);
    const per = Object.fromEntries(cats.map(c => [c, all.filter(s => sessionCtxOk(s, c)).map(s => s._sid + '#' + s.id)]));
    const seen = {}; cats.forEach(c => per[c].forEach(k => { seen[k] = (seen[k] || 0) + 1; }));
    return { all: all.length, counts: Object.fromEntries(cats.map(c => [c, per[c].length])), dup: Object.values(seen).filter(v => v > 1).length, missing: all.filter(s => !seen[s._sid + '#' + s.id]).length }; },
  shotLog(cf) { document.getElementById('tf_season').value = '2027'; document.getElementById('tf_player').value = ''; document.getElementById('tf_grade').value = ''; const sel = document.getElementById('tf_context'); sel.value = cf; renderTable(); const rows = [...document.querySelectorAll('#shotTableBody tr')]; sel.value = ''; return rows.length; },
  topBarFull() { drawNav(); return [...document.querySelectorAll('#sdFilters [data-nctx]')].map(b => ({ v: b.dataset.nctx, t: b.textContent, title: b.title || '' })); },
  pillVisible(id, label) { syncUntypedPills(); const b = [...document.querySelectorAll('#' + id + ' .pill')].find(x => x.textContent === label); return b ? b.style.display !== 'none' : null; },
  // ---- logger session bar (no saves)
  bar(date, ctx, ty, opp, editing) {
    document.getElementById('f_date').value = date; setPillGroupValue('f_context', ctx); setPillGroupValue('f_scrimtype', ty || null);
    document.getElementById('f_opponent').value = opp || ''; updateSessionBarUi();
    const keepS = editingShotId; if (editing) editingShotId = -1;
    try { const r = readSessionFields(), op = document.getElementById('f_opponent');
      return { r, typeShown: document.getElementById('scrimTypeWrap').style.display !== 'none', oppShown: document.getElementById('opponentFieldWrap').style.display !== 'none', oppDisabled: op.disabled, placeholder: op.placeholder, label: document.getElementById('f_opponent_label').textContent, note: document.getElementById('scrimTypeNote').textContent, sid: r.error ? null : sessionIdFor(r), hasOpp: hasOpponentSession() };
    } finally { editingShotId = keepS; setPillGroupValue('f_context', 'Practice'); setPillGroupValue('f_scrimtype', null); document.getElementById('f_opponent').value = ''; updateSessionBarUi(); } },
  async recordIntra(sid) { const w = __FAKE.__writes.length; await recordIntraSquad(sid); await recordIntraSquad(sid); await new Promise(r => setTimeout(r, 400));
    const writes = __FAKE.__writes.slice(w); const doc = (await DB.doc('app/session_tracking').get()).data() || {};
    return { writes: writes.map(x => [x.coll, x.id, x.keys]), rec: doc['typ_' + sid] ? JSON.parse(doc['typ_' + sid]) : null, type: sessionTypeOf({ _sid: sid, context: 'Scrimmage', opponent: null }) }; },
  // ---- an edit through the tracker's own save path (the one Film Check uses), in memory, as a test coach
  async editShot(sid, field, value) {
    const hadApp = 'app' in DB, keepApp = DB.app; DB.app = { auth: () => ({ currentUser: { uid: 'TESTCOACH', email: 'test.coach@example.invalid' } }) };   // in-memory DB only
    try { const base = SHOTS.find(s => s._sid === sid); const next = Object.assign({}, base, { [field]: value });
      const before = (await DB.collection('sessions').doc(sid).get()).data(), recBefore = ((await DB.doc('app/session_tracking').get()).data() || {})['typ_' + sid];
      const r = await persistShot(next, undefined, { base: Object.assign({}, base) }); await new Promise(res => setTimeout(res, 800));
      const after = (await DB.collection('sessions').doc(sid).get()).data(), recAfter = ((await DB.doc('app/session_tracking').get()).data() || {})['typ_' + sid];
      const keys = d => Object.keys(d).filter(k => /^(s|p|t)_/.test(k)).sort();
      const ent = SHOTS.find(s => s._sid === sid && s.id === base.id);
      return { result: r, sameKeys: JSON.stringify(keys(before)) === JSON.stringify(keys(after)), meta: [after.date, after.context, after.opponent], recSame: recBefore === recAfter, recPresent: recAfter !== undefined, edited: ent ? ent[field] : null, type: sessionTypeOf(ent || base), opp: sessionOpponentOf(ent || base) };
    } finally { if (hadApp) DB.app = keepApp; else delete DB.app; } },
  // ---- labels next to the exceptions
  labels() { const out = {}; heatSeason = '2027'; goalieHeatSeason = '2027';
    try { renderGoalieScore(); out.goalie = document.getElementById('gsSub') ? document.getElementById('gsSub').textContent : ''; } catch (e) { out.goalie = 'ERR ' + e.message; }
    try { renderSkaterProjections(); out.proj = document.getElementById('pjNote').textContent; } catch (e) { out.proj = 'ERR ' + e.message; }
    try { renderGoalieProjections(); out.gproj = document.getElementById('pjGoalieSub').textContent; } catch (e) { out.gproj = 'ERR ' + e.message; }
    try { const s0 = EFF_SEASON; EFF_SEASON = '2027'; renderXg2Tab(); EFF_SEASON = s0; out.xg2 = document.getElementById('xg2How').textContent; } catch (e) { out.xg2 = 'ERR ' + e.message; }
    return out; },
  // ---- saved scorecard records: a model snapshot and a tracking confirmation, written in memory before Reports render
  async seedSaved(sid, snapJson) { const date = sid.slice(0, 10), key = 'xg_2027_' + date;
    await DB.doc('app/xg_snapshots').set({ [key]: snapJson }, { merge: true });
    await DB.doc('app/session_tracking').set({ ['trk_' + sid]: JSON.stringify({ confirmed: true, at: '2026-11-03T00:00:00Z', by: 'TEST', cats: { shots: 'C', poss: 'C', gb: 'N' } }) }, { merge: true });
    await new Promise(r => setTimeout(r, 600)); return key; },
  async savedDocs() { const a = (await DB.doc('app/xg_snapshots').get()).data() || {}, b = (await DB.doc('app/session_tracking').get()).data() || {};
    return JSON.stringify([Object.keys(a).sort().map(k => [k, a[k]]), Object.keys(b).filter(k => /^trk_/.test(k)).sort().map(k => [k, b[k]])]); },
  rptOne(mode, key) { goNav('reports'); navPick('rptModePills', mode === 'practice' ? 'Practice' : 'Week'); rptMode = mode; rptPlayer = ''; rptGroup = ''; rptKey = key; renderReports();
    return ['rptScore', 'rptTeam'].map(id => (document.getElementById(id) || {}).innerText || '').join('\n'); },
  // ---- one entry through a real Log Shot form, in memory, as a test coach. kind: shot | poss | gb | faceoff
  async entry(kind, date, ty, opp, fresh) {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const hadApp = 'app' in DB, keepApp = DB.app; DB.app = { auth: () => ({ currentUser: { uid: 'TESTCOACH', email: 'test.coach@example.invalid' } }) };
    try {
      goNav('logshot');
      document.getElementById('f_date').value = date;
      if (fresh) { setPillGroupValue('f_context', 'Practice'); updateSessionBarUi(); setPillGroupValue('f_scrimtype', null); document.getElementById('f_opponent').value = ''; }
      setPillGroupValue('f_context', 'Scrimmage');
      if (!fresh) { setPillGroupValue('f_scrimtype', ty || null); document.getElementById('f_opponent').value = opp || ''; }
      updateSessionBarUi(); onSessionChanged();
      const bar = { type: currentScrimType(), opponent: document.getElementById('f_opponent').value, locked: document.getElementById('f_opponent').disabled };
      const w0 = __FAKE.__writes.length, j = rosterPlayers('2027').map(r => r.jersey);
      if (kind === 'shot') {
        setSegValue('entryTypeSeg', 'shot'); showEntryType('shot'); setSegValue('lb_possession', 'WLU');
        resolvedShooterJersey = j[0]; setPillGroupValue('f_quality', '2-Silver'); setPillGroupValue('f_contest', 'Open'); setPillGroupValue('f_outcome', 'Miss');
        setPillGroupValue('f_catchdodge', CATCH_DODGE_OPTIONS[0]); pendingField = { distanceYds: 10, lateralYds: 2, fieldX: 50, fieldY: 30 };
        await saveShotFromForm({ at: 'check' });
      } else if (kind === 'poss') {
        setSegValue('entryTypeSeg', 'poss'); showEntryType('poss'); setPillGroupValue('p_end', 'Failed clear'); await savePossFromForm();
      } else if (kind === 'gb') {
        document.getElementById('gb_jersey').value = j[1]; await submitGroundBall();
      } else {
        document.getElementById('fo_a').value = j[2]; document.getElementById('fo_b').value = bar.type === 'Opponent scrimmage' ? '' : j[3]; foResult = 'A';
        document.getElementById('submitFaceoffBtn').click();
      }
      await sleep(900);
      const writes = __FAKE.__writes.slice(w0).map(x => x.coll + '/' + x.id + ':' + x.keys.filter(k => !/^(rev|lastOp)$/.test(k)).join(','));
      const trk = (await DB.doc('app/session_tracking').get()).data() || {}, sidBlank = date + '_scrimmage';
      const pool = kind === 'shot' ? SHOTS : kind === 'poss' ? POSSESSIONS : kind === 'gb' ? GROUNDBALLS : FACEOFFS;
      const mine = pool.filter(e => e.date === date && e.context === 'Scrimmage');
      return { bar, saved: writes.filter(x => !/session_tracking/.test(x)).length > 0, typeWrites: writes.filter(x => /session_tracking/.test(x)), rec: trk['typ_' + sidBlank] || null,
        n: mine.length, types: [...new Set(mine.map(sessionTypeOf))], opps: [...new Set(mine.map(e => e.opponent || null))], sids: [...new Set(mine.map(e => e._sid || sessionIdFor(e)))] };
    } finally { if (hadApp) DB.app = keepApp; else delete DB.app; setPillGroupValue('f_context', 'Practice'); setPillGroupValue('f_scrimtype', null); document.getElementById('f_opponent').value = ''; updateSessionBarUi(); }
  },
  async editFirst(kind, date) {
    const hadApp = 'app' in DB, keepApp = DB.app; DB.app = { auth: () => ({ currentUser: { uid: 'TESTCOACH', email: 'test.coach@example.invalid' } }) };
    try { const pool = kind === 'shot' ? SHOTS : POSSESSIONS, base = pool.find(e => e.date === date && e.context === 'Scrimmage'); const before = ((await DB.doc('app/session_tracking').get()).data() || {})['typ_' + date + '_scrimmage'];
      const r = await (kind === 'shot' ? persistShot(Object.assign({}, base, { filmTime: 11.5 }), undefined, { base: Object.assign({}, base) }) : persistPossession(Object.assign({}, base, { filmTime: 11.5 }), undefined, { base: Object.assign({}, base) }));
      await new Promise(res => setTimeout(res, 700)); const after = ((await DB.doc('app/session_tracking').get()).data() || {})['typ_' + date + '_scrimmage'];
      const matches = pool.filter(x => x.date === date && x.id === base.id), e = matches[matches.length - 1];
      const doc = (await DB.collection('sessions').doc(base._sid || sessionIdFor(base)).get()).data() || {}, key = (kind === 'shot' ? 's_' : 'p_') + base.id;
      const cols = kind === 'shot' ? COLS : POSS_COLS, stored = doc[key] ? JSON.parse(doc[key])[cols.indexOf('filmTime')] : 'missing';
      return { r, recSame: before === after && !!after, type: sessionTypeOf(e), filmTime: e.filmTime, matches: matches.length, sid: base._sid, stored, id: base.id, filmIdx: cols.indexOf('filmTime') };
    } finally { if (hadApp) DB.app = keepApp; else delete DB.app; } },
};
'loaded';

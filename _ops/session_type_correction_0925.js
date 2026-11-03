// SESSION-TYPE CORRECTION — 2026-09-25 scrimmage = Opponent scrimmage vs Alumni (Bobby, Nov 3, 2026).
// PREPARED, NOT RUN AGAINST PRODUCTION. Run only after Bobby approves, in the live tracker tab, signed in as staff,
// on a tracker build that includes the session-type package (claude/phase0-corrections).
//
// What it writes: ONE field, app/session_tracking -> typ_2026-09-25_scrimmage = {type, opponent, by, at, note}.
// What it never touches: the session document sessions/2026-09-25_scrimmage, its id, its date, or any of its entries
// (shots, possessions, lineups). The tracker reads the record and classifies the session as an opponent scrimmage.
//
// It refuses (writes nothing) when:
//   - this tracker build has no session types (the package isn't deployed yet);
//   - the session document isn't the one reviewed (date 2026-09-25, context Scrimmage, no opponent);
//   - a type is already recorded for this session (someone else did it, or this ran already).
// After writing, it re-reads the session document and confirms the entries' hash is the same as before.
// Returns a report object; nothing is printed beyond it.
(async () => {
  const SID = '2026-09-25_scrimmage', KEY = 'typ_' + SID;
  if (typeof sessionTypesFrom !== 'function' || typeof sessionTypeOf !== 'function') return { ok: false, why: 'This tracker build has no session types yet: deploy the package first.' };
  const sRef = DB.collection('sessions').doc(SID), tRef = DB.doc('app/session_tracking');
  const sha = async str => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)))].map(b => b.toString(16).padStart(2, '0')).join('');
  // Sorted keys: a transaction read returns fields in a different order than a plain read.
  const entryHash = data => sha(JSON.stringify(Object.keys(data || {}).filter(k => /^(s|p|t|a)_/.test(k)).sort().map(k => [k, data[k]])));
  const user = (firebase.auth && firebase.auth().currentUser) || {};
  const rec = { type: 'Opponent scrimmage', opponent: 'Alumni', by: user.email || user.uid || null, at: new Date().toISOString(),
    note: 'Logged as a scrimmage with no opponent; confirmed as vs Alumni by Bobby on Nov 3, 2026. Session id, date and entries unchanged.' };
  let before = null;
  const result = await DB.runTransaction(async tx => {
    const s = await tx.get(sRef), t = await tx.get(tRef);
    if (!s.exists) return { ok: false, why: 'sessions/' + SID + ' not found.' };
    const d = s.data();
    if (d.date !== '2026-09-25' || d.context !== 'Scrimmage' || (d.opponent !== null && d.opponent !== undefined && d.opponent !== ''))
      return { ok: false, why: 'Session is not the one reviewed.', found: { date: d.date, context: d.context, opponent: d.opponent } };
    const cur = t.exists ? t.data()[KEY] : undefined;
    if (cur !== undefined) return { ok: false, why: 'A type is already recorded for this session.', existing: cur };
    before = { entries: Object.keys(d).filter(k => /^(s|p|t|a)_/.test(k)).length, shots: Object.keys(d).filter(k => /^s_/.test(k)).length, hash: await entryHash(d) };
    tx.set(tRef, { [KEY]: JSON.stringify(rec) }, { merge: true });
    return { ok: true };
  });
  if (!result.ok) return result;
  const after = await sRef.get();
  const afterHash = await entryHash(after.data());
  return { ok: true, wrote: 'app/session_tracking.' + KEY, record: rec, sessionBefore: before, sessionAfterHash: afterHash, entriesUnchanged: afterHash === before.hash };
})();

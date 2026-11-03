// TEST ONLY: an in-memory stand-in for the Firestore compat API, loaded from an Export All Data JSON.
// Used for the frozen-data analytics regression: both tracker builds read the SAME frozen data and nothing
// touches any real database (no network at all). Writes are recorded, applied in memory only.
(function () {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o));
  window.makeFakeFirestore = function (collections) {
    const data = clone(collections);           // { coll: { docId: fields } }
    const writes = [], listeners = [];
    const parse = path => { const p = String(path).split('/'); return { coll: p[0], id: p[1] }; };
    const snapOf = (coll, id) => { const d = (data[coll] || {})[id]; return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), ref: docRef(coll, id) }; };
    const qsnapOf = coll => { const docs = Object.keys(data[coll] || {}).map(id => snapOf(coll, id)); return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f), docChanges: () => docs.map(d => ({ type: 'added', doc: d })) }; };
    const notify = () => listeners.forEach(l => setTimeout(() => l.fire(), 0));
    const applyWrite = (coll, id, fields, merge, del) => {
      writes.push({ coll, id, del: !!del, keys: fields ? Object.keys(fields) : [] });
      data[coll] = data[coll] || {};
      if (del) delete data[coll][id];
      else data[coll][id] = Object.assign(merge ? (data[coll][id] || {}) : {}, clone(fields || {}));
      notify();
    };
    function docRef(coll, id) {
      return {
        id, path: coll + '/' + id,
        get: () => Promise.resolve(snapOf(coll, id)),
        onSnapshot: (cb, err) => { const l = { fire: () => { try { cb(snapOf(coll, id)); } catch (e) { if (err) err(e); else console.error(e); } } }; listeners.push(l); setTimeout(l.fire, 0); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; },
        set: (f, o) => { applyWrite(coll, id, f, o && o.merge); return Promise.resolve(); },
        update: f => { applyWrite(coll, id, f, true); return Promise.resolve(); },
        delete: () => { applyWrite(coll, id, null, false, true); return Promise.resolve(); },
        collection: () => collRef('__sub__')
      };
    }
    function collRef(coll) {
      const q = {
        doc: id => docRef(coll, id),
        get: () => Promise.resolve(qsnapOf(coll)),
        onSnapshot: (cb, err) => { const l = { fire: () => { try { cb(qsnapOf(coll)); } catch (e) { if (err) err(e); else console.error(e); } } }; listeners.push(l); setTimeout(l.fire, 0); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; },
        where: () => q, orderBy: () => q, limit: () => q,
        add: f => { const id = 'fake_' + Math.random().toString(36).slice(2); applyWrite(coll, id, f); return Promise.resolve(docRef(coll, id)); }
      };
      return q;
    }
    const db = {
      __fake: true, __writes: writes, __listeners: listeners,
      enablePersistence: () => Promise.resolve(),
      doc: path => { const p = parse(path); return docRef(p.coll, p.id); },
      collection: coll => collRef(coll),
      batch: () => { const ops = []; return { set: (r, f, o) => ops.push(() => r.set(f, o)), update: (r, f) => ops.push(() => r.update(f)), delete: r => ops.push(() => r.delete()), commit: () => { ops.forEach(o => o()); return Promise.resolve(); } }; },
      runTransaction: fn => fn({ get: r => r.get(), set: (r, f, o) => r.set(f, o), update: (r, f) => r.update(f), delete: r => r.delete() }),
      disableNetwork: () => Promise.resolve(), enableNetwork: () => Promise.resolve()
    };
    return db;
  };
})();

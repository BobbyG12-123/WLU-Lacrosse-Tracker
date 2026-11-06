// Test only: the same chunk work as ../worker.js, as a deno module worker.
const base = new URL('..', import.meta.url), ready = (async () => { for (const f of ['rules.js', 'constants.js', 'engine.js', 'explain.js', 'results.js']) await import(new URL(f, base)); })();
self.onmessage = async e => { await ready; const { P, seed, from, to } = e.data, games = []; for (let k = from; k < to; k++) games.push(globalThis.MS.runGame(P, seed, k)); self.postMessage({ games }); };

// Runs one chunk of games off the page. Classic browser worker: new Worker('worker.js'). Same files and same results as an in-page run.
importScripts('rules.js', 'constants.js', 'engine.js', 'results.js');
self.onmessage = e => { const { P, seed, from, to } = e.data, games = []; for (let k = from; k < to; k++) games.push(self.MS.runGame(P, seed, k)); self.postMessage({ games }); };

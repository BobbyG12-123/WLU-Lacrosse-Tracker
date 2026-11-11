// Synthetic parameters for tests. No real players or data.
(function (g) {
  const MS = g.MS;
  const B = (mean, n) => ({ a: mean * n, b: (1 - mean) * n });
  function team(id, opt) {
    opt = opt || {};
    const attack = [id + 'a1', id + 'a2', id + 'a3'], l1 = [id + 'm1', id + 'm2', id + 'm3'], l2 = [id + 'm4', id + 'm5', id + 'm6'], defense = [id + 'd1', id + 'd2', id + 'd3', id + 'l1', id + 's1', id + 's2'];
    const shooters = attack.concat(l1, l2).map((x, k) => ({ id: x, share: 12 - k, q: B(opt.q ?? 0.62, 200), r: B(opt.r ?? 0.55, 200) }));
    const w = Object.fromEntries(attack.concat(l1, l2).map((x, k) => [x, 12 - k])), dw = Object.fromEntries(defense.map(x => [x, 5]));
    return { id, name: id.toUpperCase(), opposingFinishShift: opt.finishShift ?? 0, manUpShift: opt.manUpShift ?? 0.45,
      rates: { shotVsTO: B(opt.shotVsTO ?? 0.65, 400), clear: B(opt.clear ?? 0.87, 400), blocked: B(opt.blocked ?? 0.03, 400), pipeOfOff: B(opt.pipeOfOff ?? 0.14, 400), caused: B(opt.caused ?? 0.5, 400), assist: B(opt.assist ?? 0.65, 400), foulPerAction: opt.foul ?? 0.05, teamTurnoverShare: opt.teamTO ?? 0.1 },
      shooters, turnoverShares: w, assistShares: w, causedShares: dw, gbShares: opt.gb === false ? null : Object.assign({}, w, dw), penaltyShares: opt.namedPenalties ? Object.assign({}, w, dw) : null,
      rotation: { attack, lines: [{ players: l1, share: 0.6 }, { players: l2, share: 0.4 }], defense, goalie: id + 'g', fogo: [{ id: id + 'f1', weight: 2 }, { id: id + 'f2', weight: 1 }] } };
  }
  function teamLevel(id, opt) {
    opt = opt || {};
    const T = team(id, opt);
    T.shooters = [{ id: MS.TEAM, share: 1, q: B(opt.q ?? 0.62, 200), r: B(opt.r ?? 0.55, 200) }];
    T.turnoverShares = {}; T.assistShares = {}; T.causedShares = null; T.gbShares = null; T.penaltyShares = null;
    T.rotation = { attack: [], lines: [], defense: [], goalie: null, fogo: [] };
    return T;
  }
  function params(a, b, opt) {
    opt = opt || {};
    return { uncertainty: opt.uncertainty || 'fixed', tempo: Object.assign({ actionMeanSec: 22, faceoffMeanSec: 8, clearMeanSec: 10, looseMeanSec: 4 }, opt.tempo), retention: Object.assign({ saveHeld: 0.8, loose: 0.4, wide: 0.45, blocked: 0.4 }, opt.retention), penalties: Object.assign({ defenseFoulShare: 0.65, technicalShare: 0.52, personalMix: [0.92, 0.07, 0.01], nonreleasableShare: 0.05 }, opt.penalties), faceoff: opt.faceoff || B(0.5, 400), lineShiftSec: 120, teams: [team('x', a), team('y', b)] };
  }
  g.FX = { B, team, teamLevel, params };
})(globalThis);

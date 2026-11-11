// D3 averages for a LacrosseReference import, keyed by that import's lrMeta.updated and season. Aggregate numbers only:
// the mean adjusted offensive efficiency of D3 teams and the pooled D3 man-up rate. The game-week page uses the entry that
// matches the import on the tracker (or lrMeta.d3 when an import carries it); otherwise it asks before reading every team.
(function (g) {
  const MS = g.MS = g.MS || {}; const V3 = MS.V3 = MS.V3 || {};
  V3.D3_SUMMARIES = Object.freeze({ '2026-10-14|2026': Object.freeze({ eff: 0.258145, emo: 0.358231, teams: 234 }) });
})(globalThis);

# Player Development tests (offline, synthetic)

`./run.sh` (from anywhere) checks this branch's `index.html` against `origin/main` (or a ref you pass). It:

1. writes `fixture.json`, a deterministic, **fully synthetic** export (`make_fixture.py`, fixed seed, "Synth Player" names; no real data);
2. builds two offline trackers (`build_offline.py`): dummy Firebase config, strict CSP, and `guard_offline.js` first, so nothing can connect anywhere. The build refuses to write output if any live identifier remains;
3. boots both in headless Chrome on an in-memory database (`fake_firestore.js`) at `127.0.0.1:8769`, runs `dev_tests.html`, and prints each result. The exit code is 0 only if all pass.

What it covers:
- **Regression against main:** the analytics snapshot (`analytics_snapshot.js`), and Reports Practice / Week / player pages (identical HTML).
- **Session typing, record keys, and the held-out-session model audit.**
- **Clips:** confirmed marks only, scoped to the clip's own session; a double claim shows no clip; cache invalidation after Film Check corrections.
- **What-if invariants**, including the combination screen.
- **Conclusions:** every record kept, with entry ids and edit fingerprints; edit conflicts.
- **Reports Player review, Player View privacy**, and the Film Check offer fix.

Generated files (`fixture.json`, `tracker_*.html`, `main_index.html`, `results/`) are git-ignored. This folder starts with `_`, so GitHub Pages (Jekyll) doesn't publish it.

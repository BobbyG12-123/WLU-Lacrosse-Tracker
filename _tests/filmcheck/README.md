# Film Check regression (offline)

`./run.sh [base ref]` (default `origin/main`) runs this branch's `index.html` and the base side by side, offline, on an
in-memory database with synthetic data. It reuses Phase 0's tooling (`../phase0`), copied in for the run and git-ignored.

**The bug:** `fcPlan` treated only matched clips (`'m'`) as using a shot. A shot logged from a clip (`'n'`) was still free,
so the next open clip was offered it and could be matched to it. Two clips then claimed one shot.

What is checked, on both builds:
- The base shows the bug. If it doesn't, the check fails, so this can't pass by testing nothing.
- A shot logged from a clip isn't offered to the next clip, isn't in that clip's "Which logged shot is it?" list, and is
  refused if it's picked anyway. Nothing is written when it's refused.
- The offer moves on to the next unused shot, and there's no offer when no unused shot is left.
- Matched clips, opponent shots, and the clip's own link behave as before.

This folder starts with `_`, so GitHub Pages doesn't publish it.

#!/usr/bin/env python3
"""TEST ONLY: makes an offline copy of the tracker for the synthetic tests.

Usage: python3 build_offline.py <index.html> <tracker_name.html>

- Replaces the single firebase.initializeApp({...}) block with a dummy config (projectId "offline-test").
- Puts a strict Content-Security-Policy and guard_offline.js first in <head>: no request may leave this machine
  (the Firebase SDK scripts themselves still load from gstatic; nothing can connect anywhere).
- Refuses to write anything if the config block isn't found exactly once or a live identifier remains.
The tests then replace firebase.firestore with an in-memory database loaded from the synthetic fixture.
"""
import re, sys, pathlib

BANNED = ['wlu-lacrosse-tracker', '896246870043', 'ccf40f407b6963b4d548be']
CFG = 'firebase.initializeApp({ apiKey: "offline", authDomain: "offline.invalid", projectId: "offline-test", appId: "offline" });'
CSP = ("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; "
       "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://cdn.jsdelivr.net; connect-src 'self'; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; "
       "worker-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'\">")


def die(m):
    print('REFUSED: ' + m); sys.exit(2)


src, name = sys.argv[1], sys.argv[2]
if not re.fullmatch(r'tracker_[a-z0-9_]+\.html', name):
    die('output must be tracker_<name>.html')
html = pathlib.Path(src).read_text(encoding='utf-8')
blocks = list(re.finditer(r'firebase\.initializeApp\(\{[^}]*\}\);', html))
if len(blocks) != 1:
    die(f'expected one firebase config block, found {len(blocks)}')
live_key = (re.search(r'apiKey:\s*"([^"]+)"', blocks[0].group(0)) or [None, None])[1]
out = html[:blocks[0].start()] + CFG + html[blocks[0].end():]
m = re.search(r'<head>\s*(<meta charset="utf-8">\s*)?', out, re.I)
if not m:
    die('no <head>')
out = out[:m.start()] + '<head>\n<meta charset="utf-8">\n' + CSP + '\n<script src="guard_offline.js"></script>\n<!-- TEST BUILD: offline, synthetic data only -->\n' + out[m.end():]
leaks = [b for b in BANNED if b in out] + (['<live api key>'] if live_key and live_key in out else [])
if leaks:
    die('live identifiers remain: ' + ', '.join(leaks))
if out.find('<script') != out.find('<script src="guard_offline.js">'):
    die('guard is not the first script')
(pathlib.Path(__file__).resolve().parent / name).write_text(out, encoding='utf-8')
print(f'WROTE {name}: offline build, live identifiers 0')

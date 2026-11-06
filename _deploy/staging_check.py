#!/usr/bin/env python3
"""Signed-out checks against a deployed staging address: everything a stranger can try, with no sign-in and no key.

  python3 _deploy/staging_check.py https://wlu-tracker-staging.<subdomain>.workers.dev

Exit 0 only if every check passes. Sends no credentials, costs nothing, and changes nothing.
"""
import json, re, sys, urllib.error, urllib.request
BASE = sys.argv[1].rstrip('/')
if not re.fullmatch(r'https?://[^/]+', BASE): sys.exit('Give the site address only, such as https://name.subdomain.workers.dev')
R = []
def ok(name, cond, info=None):
    R.append(bool(cond)); print(('  OK   ' if cond else '  FAIL ') + name + ('' if cond else f'  {info!r}'), flush=True)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)
def call(path, method='GET', headers=None, data=None):
    h = {'accept': 'text/html', 'user-agent': 'Mozilla/5.0'}; h.update(headers or {})
    try:
        r = opener.open(urllib.request.Request(BASE + path, method=method, headers=h, data=data), timeout=30)
        return r.status, r.read(400000).decode('utf8', 'ignore'), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(400000).decode('utf8', 'ignore'), e.headers
# Text that exists only in the real tracker pages, never in the sign-in page.
TRACKER = re.compile(r'ALLOWED_COACHES|buildEffData|SA_CATALOG|chatFacts|FOGO_LAST_NAMES|Scoring Change')
for p in ['/', '/index.html', '/opponent-scout.html', '/train-tagger.html', '/index.html?x=1', '/%69ndex.html', '/./index.html', '//index.html', '/_chat/gateway/worker.js', '/.git/config', '/wrangler.toml']:
    c, b, _ = call(p); ok(f'GET {p}: no tracker code', not TRACKER.search(b) and c in (401, 404), (c, len(b)))
for m in ['POST', 'PUT', 'DELETE']:
    c, b, _ = call('/index.html', m, data=b'' if m != 'DELETE' else None); ok(f'{m} /index.html: refused', not TRACKER.search(b) and c in (401, 403, 405), c)
c, b, h = call('/')
ok('the sign-in page offers Google sign-in and nothing else', c == 401 and 'Sign in with Google' in b and '@' not in re.sub(r'firebasejs/[^"]+', '', b), (c, len(b)))
ok('not indexed and not cached', 'noindex' in (h.get('x-robots-tag') or '') and 'no-store' in (h.get('cache-control') or ''), dict(h))
for label, ck in [('a made-up cookie', 'abc.def'), ('an empty cookie', ''), ('a cookie with no signature', 'eyJzdWIiOiJ4IiwiZXhwIjo5OTk5OTk5OTk5OTk5fQ.')]:
    c, b, _ = call('/index.html', headers={'cookie': '__Host-wlu_staff=' + ck}); ok(f'{label}: refused', c == 401 and not TRACKER.search(b), c)
for p, m in [('/chat-api/v1/config', 'GET'), ('/chat-api/v1/usage', 'GET'), ('/chat-api/v1/chat', 'POST'), ('/chat-api/v1/admin/kill', 'POST')]:
    c, _, _ = call(p, m, headers={'content-type': 'application/json'}, data=b'{}' if m == 'POST' else None); ok(f'{m} {p} with no sign-in: refused', c == 401, c)
    c, _, _ = call(p, m, headers={'authorization': 'Bearer a.b.c', 'content-type': 'application/json'}, data=b'{}' if m == 'POST' else None); ok(f'{m} {p} with a fake token: refused', c == 401, c)
c, _, _ = call('/__auth/session', 'POST', headers={'content-type': 'application/json', 'origin': 'https://evil.test'}, data=json.dumps({'idToken': 'a.b.c'}).encode()); ok('a sign-in posted from another site: refused', c == 403, c)
c, _, _ = call('/__auth/session', 'POST', headers={'content-type': 'application/json', 'origin': BASE}, data=json.dumps({'idToken': 'a.b.c'}).encode()); ok('a fake token gets no session', c == 401, c)
fails = R.count(False); print(f'pass {len(R) - fails}  fail {fails}'); sys.exit(1 if fails else 0)

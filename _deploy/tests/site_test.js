// TEST ONLY. The site gate over real HTTP, using Deno's server with the same Worker code. Upstreams are faked and nothing leaves this machine.
// It is not Cloudflare's runtime, and "Firestore" here is a stand-in for the rules: DEPLOY.md's live checks are still required.
//   deno run --no-prompt --allow-net=127.0.0.1,localhost _deploy/tests/site_test.js
import { site, LedgerCore } from '../../_chat/gateway/worker.js';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? '  OK   ' : '  FAIL ') + n + (c ? '' : '  ' + JSON.stringify(i ?? null).slice(0, 400))); };
const SENTINEL = 'TEAM-DATA-SENTINEL-7f3a', PROJECT = 'test-project', STAFF = 'coach@test.invalid', SECRET = 'x'.repeat(48);
const pages = { '/': 'index', '/index.html': 'index', '/opponent-scout.html': 'scout', '/train-tagger.html': 'tagger' };
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), b64s = s => b64u(new TextEncoder().encode(s));
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = Object.assign(await crypto.subtle.exportKey('jwk', kp.publicKey), { kid: 'k1' });
let clock = Date.now();
const token = async (email, over) => { const t = Math.floor(clock / 1000), head = b64s(JSON.stringify({ alg: 'RS256', kid: 'k1' })), body = b64s(JSON.stringify(Object.assign({ aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: 'u-' + email, iat: t - 5, exp: t + 3000, auth_time: t - 9, email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }, over || {}))); return `${head}.${body}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(head + '.' + body)))}`; };
const staff = new Set([STAFF]); let paidCalls = 0;
const emailOf = t => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email;
// The stand-in for Firestore: its rules are checked on every read, with no memory, as the real service documents.
const firestoreRead = t => staff.has(emailOf(t)) ? 200 : 403;
const upstream = async (u, o) => {
  u = String(u);
  if (u.includes('jwk')) return new Response(JSON.stringify({ keys: [jwk] }));
  if (u.includes('firestore')) return new Response('{}', { status: firestoreRead(o.headers.authorization.slice(7)) });
  paidCalls++;
  const ev = [{ type: 'message_start', message: { usage: { input_tokens: 5 } } }, { type: 'content_block_start', content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }, { type: 'content_block_stop' }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }, { type: 'message_stop' }];
  return new Response(ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
};
const store = new Map();
const ledger = new LedgerCore({ get: async k => store.get(k), put: async (k, v) => { store.set(k, v); } }, { BUDGET_USD: '10', SAFETY_MARGIN_USD: '1' }, () => clock);
const env = { FIREBASE_PROJECT_ID: PROJECT, FIREBASE_WEB_KEY: 'public-web-key', SESSION_SECRET: SECRET, ANTHROPIC_API_KEY: 'sk-test-not-real', OWNER_EMAILS: 'owner@test.invalid', STAFF_CACHE_S: '300', SESSION_SECONDS: '3600', STAFF_RULES_REVIEWED: 'sha256:' + 'a'.repeat(64),
  ASSETS: { fetch: req => { const p = new URL(req.url).pathname, n = pages[p]; return new Response(n ? `<html>${SENTINEL} ${n}</html>` : 'not found', { status: n ? 200 : 404, headers: { 'content-type': 'text/html' } }); } } };
const srv = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, req => site(req, env, { waitUntil: p => p }, { fetch: upstream, ledger, now: () => clock }));
const BASE = `http://127.0.0.1:${srv.addr.port}`;
const get = (p, o) => fetch(BASE + p, Object.assign({ redirect: 'manual', headers: { accept: 'text/html' } }, o || {}));
const leak = async r => (await r.text()).includes(SENTINEL);

console.log('Signed out');
for (const p of ['/', '/index.html', '/opponent-scout.html', '/train-tagger.html', '/index.html?x=1', '/%69ndex.html', '/./index.html', '//index.html', '/INDEX.HTML', '/nothing', '/.git/config', '/_chat/gateway/worker.js']) { const r = await get(p); ok(`GET ${p}: no team data`, !(await leak(r)) && r.status === 401, r.status); }
for (const m of ['POST', 'PUT', 'DELETE']) { const r = await get('/index.html', { method: m }); ok(`${m} /index.html: refused`, !(await leak(r)) && r.status === 401, r.status); }
{ const r = await get('/index.html', { method: 'HEAD' }); await r.body?.cancel(); ok('HEAD /index.html: refused', r.status === 401, r.status); }
{ const r = await fetch(BASE + '/index.html', { headers: { accept: '*/*' } }); ok('a request that does not ask for a page: refused, no sign-in page either', !(await leak(r)) && r.status === 401); }
const lp = await (await get('/')).text();
ok('sign-in page has no staff address and no team data', !lp.includes(STAFF) && !/ALLOWED_COACHES|SEED_|roster/i.test(lp) && !lp.includes(SECRET) && !lp.includes(env.ANTHROPIC_API_KEY));
const hdr = (await get('/')).headers;
ok('signed-out responses: not indexed, not cached, no framing', /noindex/.test(hdr.get('x-robots-tag')) && /no-store/.test(hdr.get('cache-control')) && hdr.get('x-frame-options') === 'SAMEORIGIN');

console.log('Forged sessions');
const COOKIE = '__Host-wlu_staff';
for (const [label, v] of [['garbage', 'abc'], ['empty', ''], ['no signature', b64s(JSON.stringify({ sub: 'x', exp: clock + 1e6 })) + '.'], ['wrong signature', b64s(JSON.stringify({ sub: 'x', exp: clock + 1e6 })) + '.' + b64s('nope')]]) {
  const r = await get('/index.html', { headers: { accept: 'text/html', cookie: `${COOKIE}=${v}` } }); ok(`cookie ${label}: refused`, !(await leak(r)) && r.status === 401, r.status);
}
const signWith = async (secret, o) => { const body = b64s(JSON.stringify(o)), k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return body + '.' + b64u(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body))); };
{ const r = await get('/index.html', { headers: { accept: 'text/html', cookie: `${COOKIE}=${await signWith('y'.repeat(48), { sub: 'x', exp: clock + 1e6 })}` } }); ok('cookie signed with another secret: refused', !(await leak(r))); }
{ const r = await get('/index.html', { headers: { accept: 'text/html', cookie: `${COOKIE}=${await signWith(SECRET, { sub: 'x', exp: clock - 1000 })}` } }); ok('expired cookie: refused', !(await leak(r))); }

console.log('Signing in');
const session = (tok, origin) => fetch(BASE + '/__auth/session', { method: 'POST', headers: { 'content-type': 'application/json', origin: origin ?? BASE }, body: JSON.stringify({ idToken: tok }) });
const status = async p => { const r = await p; await r.body?.cancel(); return r.status; };
ok('a non-staff Google account gets no session', await status(session(await token('stranger@test.invalid'))) === 403);
ok('an unverified email gets no session', await status(session(await token(STAFF, { email_verified: false }))) === 401);
ok('a token for another project gets no session', await status(session(await token(STAFF, { aud: 'other' }))) === 401);
ok('an expired token gets no session', await status(session(await token(STAFF, { exp: Math.floor(clock / 1000) - 7200 }))) === 401);
ok('another sign-in provider gets no session', await status(session(await token('pw@test.invalid', { firebase: { sign_in_provider: 'password' } }))) === 401);
ok('a sign-in from another site is refused', await status(session(await token(STAFF), 'https://evil.test')) === 403);
{ const e = env.SESSION_SECRET; env.SESSION_SECRET = 'short'; ok('a missing or short secret fails closed', await status(session(await token(STAFF))) === 503); env.SESSION_SECRET = e; }
{ const e = env.STAFF_RULES_REVIEWED; delete env.STAFF_RULES_REVIEWED; ok('rules not reviewed: nobody counts as staff, even a real coach', await status(session(await token('fresh1@test.invalid'))) === 403 && await status(session(await token(STAFF))) === 403); env.STAFF_RULES_REVIEWED = e; }
const rs = await session(await token(STAFF)), sc = rs.headers.get('set-cookie') || ''; await rs.body?.cancel();
ok('staff get a session; the cookie is locked down', rs.status === 200 && /^__Host-wlu_staff=/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Path=\//.test(sc) && !/Domain=/.test(sc), sc);
const ck = sc.split(';')[0];
for (const p of ['/', '/index.html', '/opponent-scout.html', '/train-tagger.html']) { const r = await get(p, { headers: { accept: 'text/html', cookie: ck } }); ok(`staff can open ${p}`, r.status === 200 && (await leak(r))); }
{ const r = await get('/index.html', { headers: { accept: 'text/html', cookie: ck } }); await r.body?.cancel(); ok('pages are private and uncached', /private/.test(r.headers.get('cache-control')) && /no-store/.test(r.headers.get('cache-control'))); }

console.log('Other doors');
{ const r = await fetch(`http://localhost:${srv.addr.port}/index.html`, { headers: { accept: 'text/html' } }); ok('another address for the same site gets the same gate', !(await leak(r)) && r.status === 401); }
ok('chat without a token: refused', await status(fetch(BASE + '/chat-api/v1/config')) === 401);
ok('the page cookie alone cannot use the chat', await status(fetch(BASE + '/chat-api/v1/config', { headers: { cookie: ck } })) === 401);
ok('non-staff token at usage: refused', await status(fetch(BASE + '/chat-api/v1/usage', { headers: { authorization: 'Bearer ' + await token('stranger@test.invalid') } })) === 403);
const chat = t => fetch(BASE + '/chat-api/v1/chat', { method: 'POST', headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) });
ok('non-staff token at chat: refused, nothing paid', await status(chat(await token('stranger2@test.invalid'))) === 403 && paidCalls === 0);

// ---- The question that matters: someone already signed in, when they're removed. Three separate things, three separate clocks. ----
console.log('Removing a coach who is already signed in');
const page = async () => { const r = await get('/index.html', { headers: { accept: 'text/html', cookie: ck } }); return { status: r.status, data: await leak(r) }; };
const db = async () => firestoreRead(await token(STAFF));   // the coach's browser reading Firestore directly
const chatNow = async () => { const r = await chat(await token(STAFF)); const code = r.status; await r.body?.cancel(); return code; };
const newSession = async () => status(session(await token(STAFF)));
{ const r = await chat(await token(STAFF)); ok('before removal: chat works', r.status === 200 && (await r.text()).includes('"message"'), r.status); }
ok('before removal: page and database work', (await page()).data && await db() === 200);
const matrix = [];
const snap = async label => { matrix.push({ when: label, page: (await page()).status, database: await db(), chat: await chatNow() }); return matrix[matrix.length - 1]; };
// A new session always asks Firestore, so its answer is checked on a second coach (asking would also refresh the first coach's memory).
const C2 = 'coach2@test.invalid'; staff.add(C2); ok('second coach: chat works and is remembered', await status(chat(await token(C2))) === 200); staff.delete(C2);
ok('just removed: a new page session is refused at once, memory or not', await status(session(await token(C2))) === 403);
const removedAt = clock; staff.delete(STAFF);
let s = await snap('just removed');
ok('just removed: database refused at once (rules have no memory)', s.database === 403, s);
ok('just removed: the page still opens: it holds code and staff addresses, not team data', s.page === 200, s);
ok('just removed: chat still answers from the 5-minute memory', s.chat === 200, s);
clock = removedAt + 299000; s = await snap('4 min 59 s');
ok('4 min 59 s: chat still answers (so "immediately" would be false)', s.chat === 200, s);
clock = removedAt + 301000; s = await snap('5 min 1 s');
ok('5 min 1 s: chat refused', s.chat === 403, s);
ok('5 min 1 s: no new session', await newSession() === 403);
ok('5 min 1 s: the existing page session STILL opens the page (so "all access in 5 minutes" would be false)', s.page === 200, s);
ok('5 min 1 s: database still refused', s.database === 403, s);
clock = removedAt + 3540000; s = await snap('59 min');
ok('59 min: the page session can still open the page', s.page === 200, s);
clock = removedAt + 3601000; s = await snap('60 min 1 s');
ok('60 min 1 s: the page closes', s.page === 401 && !(await page()).data, s);
console.table(matrix);
staff.add(STAFF); clock += 301000;
ok('adding them back works, with no other list to change', await newSession() === 200);
{ const r = await fetch(BASE + '/__auth/logout', { headers: { cookie: ck } }); ok('sign-out clears the cookie', /Max-Age=0/.test(r.headers.get('set-cookie') || '')); await r.body?.cancel(); }
await srv.shutdown();
const fail = R.filter(x => !x).length; console.log(`pass ${R.length - fail}  fail ${fail}`); Deno.exit(fail ? 1 : 0);

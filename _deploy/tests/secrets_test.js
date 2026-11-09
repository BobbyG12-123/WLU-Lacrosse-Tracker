// TEST ONLY. Do the Worker's two secrets (the Anthropic key and the session-signing secret) ever leave it, other than the key going to Anthropic?
// Fake, easy-to-spot secrets; every kind of response the site can give, including every failure; fake upstreams that try to echo the key back.
// Each response's status line, headers, cookies and body, every log line, and every outbound request are searched for the secrets.
// Nothing leaves this machine. It is not Cloudflare's runtime.
//   deno run --no-prompt _deploy/tests/secrets_test.js
import { site, LedgerCore } from '../../_chat/gateway/worker.js';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? '  OK   ' : '  FAIL ') + n + (c ? '' : '  ' + JSON.stringify(i ?? null).slice(0, 400))); };
const rnd = () => crypto.randomUUID().replace(/-/g, '');
const API_KEY = 'sk-ant-test-LEAKCHECK-' + rnd(), SESSION_SECRET = 'LEAKCHECK-SESSION-' + rnd() + rnd();
const API_URL = 'https://api.anthropic.com/v1/messages', PROJECT = 'test-project', STAFF = 'coach@test.invalid', OWNER = 'owner@test.invalid', ORIGIN = 'https://tracker.test';
// The secrets, and the forms they'd take if code encoded them on the way out.
const forms = s => [s, encodeURIComponent(s), btoa(s), btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), JSON.stringify(s).slice(1, -1), s.slice(0, 24)];
const SECRETS = { 'Anthropic key': forms(API_KEY), 'session secret': forms(SESSION_SECRET) };
const found = text => Object.entries(SECRETS).filter(([, fs]) => fs.some(f => text.includes(f))).map(([n]) => n);

// Log lines: everything the Worker prints, which Cloudflare would keep.
const logs = [];
for (const k of ['log', 'info', 'warn', 'error', 'debug']) { const orig = console[k]; console[k] = (...a) => { const line = a.map(x => typeof x === 'string' ? x : (x instanceof Error ? x.stack || x.message : JSON.stringify(x))).join(' '); if (line.startsWith('  OK') || line.startsWith('  FAIL') || line.startsWith('pass ') || line.startsWith('== ')) orig(...a); else logs.push(line); }; }

// Signed Google-style tokens, as the site test makes them.
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), b64s = s => b64u(new TextEncoder().encode(s));
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = Object.assign(await crypto.subtle.exportKey('jwk', kp.publicKey), { kid: 'k1' });
const clock = Date.now();
const token = async email => { const t = Math.floor(clock / 1000), head = b64s(JSON.stringify({ alg: 'RS256', kid: 'k1' })), body = b64s(JSON.stringify({ aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: 'u-' + email + '-' + rnd(), iat: t - 5, exp: t + 3000, auth_time: t - 9, email, email_verified: true, firebase: { sign_in_provider: 'google.com' } })); return `${head}.${body}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(head + '.' + body)))}`; };
const emailOf = t => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email;

// The fake outside world. Every outbound request is recorded. The model's behavior is set per scenario, and several modes try to echo the key back.
const outbound = []; let mode = 'ok';
const sse = evs => evs.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const okStream = [{ type: 'message_start', message: { usage: { input_tokens: 5 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }, { type: 'content_block_stop' }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }, { type: 'message_stop' }];
const echo = { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key: ' + API_KEY } };
const upstream = async (u, o = {}) => {
  u = String(u); const h = Object.fromEntries(new Headers(o.headers || {}).entries());
  outbound.push({ url: u, headers: h, body: typeof o.body === 'string' ? o.body : '' });
  if (u.includes('jwk') || u.includes('securetoken') || u.includes('googleapis.com/service_accounts') || u.includes('robot')) return new Response(JSON.stringify({ keys: [jwk] }));
  if (u.includes('firestore')) return new Response('{}', { status: [STAFF, OWNER].includes(emailOf(h.authorization.slice(7))) ? 200 : 403 });
  if (mode === 'ok') return new Response(sse(okStream));
  if (mode === 'tool') return new Response(sse([okStream[0], { type: 'content_block_start', content_block: { type: 'tool_use', id: 't1', name: 'team_summary', input: {} } }, { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } }, { type: 'content_block_stop' }, { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } }, { type: 'message_stop' }]));
  if (mode.startsWith('status')) { const s = Number(mode.slice(6)); return new Response(JSON.stringify(echo), { status: s, headers: { 'request-id': 'req_' + API_KEY, 'x-echo': API_KEY } }); }
  if (mode === 'plain-id') return new Response('{}', { status: 500, headers: { 'request-id': 'req_011CVplainID12345' } });
  if (mode === 'throw') throw new Error('connect failed; headers were x-api-key: ' + API_KEY);
  if (mode === 'cut') return new Response(sse(okStream.slice(0, 3)));
  if (mode === 'stream-error') return new Response(sse([okStream[0], echo]));
  if (mode === 'garbage') return new Response('data: {not json ' + API_KEY + '\n\n');
  if (mode === 'hang') return new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new DOMException('aborted with key ' + API_KEY, 'AbortError'))));
  throw new Error('unknown mode');
};

const ledgerFor = env => { const st = new Map(); return new LedgerCore({ get: async k => st.get(k), put: async (k, v) => { st.set(k, v); } }, env, () => clock); };
const baseEnv = () => ({ FIREBASE_PROJECT_ID: PROJECT, FIREBASE_WEB_KEY: 'public-web-key', SESSION_SECRET, ANTHROPIC_API_KEY: API_KEY, OWNER_EMAILS: OWNER, ALLOWED_ORIGINS: ORIGIN, STAFF_RULES_REVIEWED: 'sha256:' + 'a'.repeat(64), BUDGET_USD: '10', SAFETY_MARGIN_USD: '1',
  ASSETS: { fetch: async req => new Response(new URL(req.url).pathname === '/nothing' ? 'not found' : '<html>page</html>', { status: new URL(req.url).pathname === '/nothing' ? 404 : 200, headers: { 'content-type': 'text/html' } }) } });

// One request through the whole site, with its body read to the end (streams included), then searched.
const checked = [];
async function call(label, path, init = {}, envOver = {}, ledger) {
  const env = Object.assign(baseEnv(), envOver), pending = [];
  const L = ledger || ledgerFor(env);
  let res, text = '', threw = null;
  try {
    res = await site(new Request('https://tracker.test' + path, init), env, { waitUntil: p => pending.push(p) }, { fetch: upstream, ledger: L, now: () => clock });
    text = await res.text(); await Promise.allSettled(pending);
  } catch (e) { threw = e; }
  const head = res ? `${res.status} ${res.statusText}\n` + [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n') : '';
  const where = found(head + '\n' + text), thrown = threw ? found(String(threw.stack || threw.message)) : [];
  checked.push(label);
  ok(`${label}: ${res ? res.status : 'threw'}, no secret in the response`, !where.length && !thrown.length && !threw, { where, thrown, threw: threw && String(threw).slice(0, 80), head: head.slice(0, 160) });
  return { res, text };
}
const json = (o, t, extra) => ({ method: 'POST', headers: Object.assign({ 'content-type': 'application/json', authorization: 'Bearer ' + t, origin: ORIGIN }, extra || {}), body: typeof o === 'string' ? o : JSON.stringify(o) });
const one = { messages: [{ role: 'user', content: 'How did we shoot?' }] };

console.log('== Pages and sign-in');
const staffTok = await token(STAFF);
await call('signed out, sign-in page', '/', { headers: { accept: 'text/html' } });
await call('signed out, not a page request', '/index.html', { headers: { accept: '*/*' } });
await call('signed out, POST', '/index.html', { method: 'POST' });
await call('session, wrong origin', '/__auth/session', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' });
await call('session, bad JSON', '/__auth/session', { method: 'POST', headers: { origin: 'https://tracker.test' }, body: '{nope' });
await call('session, garbage token', '/__auth/session', { method: 'POST', headers: { origin: 'https://tracker.test' }, body: JSON.stringify({ idToken: 'x.y.z' }) });
await call('session, non-staff account', '/__auth/session', { method: 'POST', headers: { origin: 'https://tracker.test' }, body: JSON.stringify({ idToken: await token('stranger@test.invalid') }) });
await call('session, short secret (fails closed)', '/__auth/session', { method: 'POST', headers: { origin: 'https://tracker.test' }, body: JSON.stringify({ idToken: staffTok }) }, { SESSION_SECRET: 'short' });
const s = await call('session, staff (sets the cookie)', '/__auth/session', { method: 'POST', headers: { origin: 'https://tracker.test' }, body: JSON.stringify({ idToken: staffTok }) });
const ck = (s.res.headers.get('set-cookie') || '').split(';')[0];
ok('the session cookie was issued (so the pages below are really signed in)', /^__Host-wlu_staff=.+\..+/.test(ck), ck);
await call('signed in, the tracker page', '/index.html', { headers: { accept: 'text/html', cookie: ck } });
await call('signed in, a missing page', '/nothing', { headers: { accept: 'text/html', cookie: ck } });
await call('forged cookie', '/index.html', { headers: { accept: 'text/html', cookie: '__Host-wlu_staff=abc.def' } });
await call('sign out', '/__auth/logout', {});

console.log('== Chat: every refusal');
await call('preflight, allowed origin', '/chat-api/v1/chat', { method: 'OPTIONS', headers: { origin: ORIGIN } });
await call('preflight, other origin', '/chat-api/v1/chat', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } });
await call('chat from another site', '/chat-api/v1/chat', json(one, staffTok, { origin: 'https://evil.test' }));
await call('chat with no sign-in', '/chat-api/v1/chat', { method: 'POST', body: '{}' });
await call('chat, non-staff', '/chat-api/v1/chat', json(one, await token('stranger@test.invalid')));
await call('chat, rules not reviewed', '/chat-api/v1/chat', json(one, await token(STAFF)), { STAFF_RULES_REVIEWED: '' });
await call('settings', '/chat-api/v1/config', { headers: { authorization: 'Bearer ' + staffTok, origin: ORIGIN } });
await call('usage', '/chat-api/v1/usage', { headers: { authorization: 'Bearer ' + staffTok, origin: ORIGIN } });
await call('kill switch, not owner', '/chat-api/v1/admin/kill', json({ on: true }, staffTok));
await call('kill switch, owner, bad JSON', '/chat-api/v1/admin/kill', json('{nope', await token(OWNER)));
await call('kill switch, owner, bad request', '/chat-api/v1/admin/kill', json({ on: 'yes' }, await token(OWNER)));
await call('kill switch, owner', '/chat-api/v1/admin/kill', json({ on: true }, await token(OWNER)));
await call('unknown chat address', '/chat-api/v1/nothing', { headers: { authorization: 'Bearer ' + staffTok } });
await call('assistant switched off', '/chat-api/v1/chat', json(one, staffTok), { CHAT_DISABLED: '1' });
await call('no key set', '/chat-api/v1/chat', json(one, staffTok), { ANTHROPIC_API_KEY: '' });
await call('model with no price', '/chat-api/v1/chat', json(one, staffTok), { MODEL: 'no-such-model' });
await call('too large', '/chat-api/v1/chat', json({ messages: [{ role: 'user', content: 'x'.repeat(170000) }] }, staffTok));
await call('bad JSON', '/chat-api/v1/chat', json('{nope', staffTok));
await call('extra fields', '/chat-api/v1/chat', json({ messages: one.messages, model: 'x', system: API_KEY }, staffTok));
const rounds = [{ role: 'user', content: 'q' }]; for (let i = 0; i < 8; i++) rounds.push({ role: 'assistant', content: [{ type: 'tool_use', id: 'u' + i, name: 'team_summary', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'u' + i, content: '{}' }] });
await call('too many steps', '/chat-api/v1/chat', json({ messages: rounds }, staffTok));
await call('individual records', '/chat-api/v1/chat', json({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'r1', name: 'find_records', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'r1', content: '{"rows":[{"a":1}]}' }] }] }, staffTok));
{ const env = Object.assign(baseEnv(), {}), L = ledgerFor(env); await L.setKill(true, OWNER); await call('owner switched it off', '/chat-api/v1/chat', json(one, staffTok), {}, L); }
await call('budget used up', '/chat-api/v1/chat', json(one, staffTok), { BUDGET_USD: '1.000001' });
{ const env = Object.assign(baseEnv(), { MAX_IN_FLIGHT: '1' }), L = ledgerFor(env); await L.reserve({ id: 'other', max: 1, model: 'm' }); await call('too many at once', '/chat-api/v1/chat', json(one, staffTok), { MAX_IN_FLIGHT: '1' }, L); }

console.log('== Chat: answers and every provider failure (several try to echo the key back)');
const paidBefore = outbound.filter(o => o.url === API_URL).length;
for (const m of ['ok', 'tool', 'status400', 'status401', 'status402', 'status403', 'status404', 'status429', 'status500', 'status529', 'throw', 'cut', 'stream-error', 'garbage', 'hang']) {
  mode = m; await call(`provider: ${m}`, '/chat-api/v1/chat', json(one, await token(STAFF)), m === 'hang' ? { MAX_CALL_SECONDS: '0.05' } : {});
}
mode = 'plain-id'; await call('provider: error with a normal request ID', '/chat-api/v1/chat', json(one, await token(STAFF)));
ok('a normal request ID is still logged, so failures can be traced', logs.some(l => l.includes('req_011CVplainID12345')), logs.slice(-2));
mode = 'ok';
ok('the provider was really called in each of those 16 cases', outbound.filter(o => o.url === API_URL).length - paidBefore === 16);

console.log('== Logs and outbound requests');
ok(`no secret in any of the ${logs.length} log lines`, logs.every(l => !found(l).length), logs.filter(l => found(l).length).slice(0, 3));
ok('the log lines were really captured (the provider failures log their status)', logs.some(l => l.includes('upstream_status')), logs.slice(0, 3));
const withKey = outbound.filter(o => found(JSON.stringify(o)).includes('Anthropic key'));
ok('the Anthropic key went only to Anthropic\'s address', withKey.length > 0 && withKey.every(o => o.url === API_URL), withKey.map(o => o.url));
ok('...and only in the x-api-key header, never in the address or the body', withKey.every(o => o.headers['x-api-key'] === API_KEY && !found(o.url).length && !found(o.body).length && Object.entries(o.headers).every(([k, v]) => k === 'x-api-key' || !found(v).length)));
ok('requests to Google and Firestore never carry the key', outbound.filter(o => o.url !== API_URL).every(o => !found(JSON.stringify(o)).length));
ok('the session secret never leaves the Worker at all', outbound.every(o => !found(JSON.stringify(o)).includes('session secret')));
console.log(`== ${checked.length} responses, ${logs.length} log lines and ${outbound.length} outbound requests searched`);
const fails = R.filter(x => !x).length; console.log(`pass ${R.length - fails}  fail ${fails}`); Deno.exit(fails ? 1 : 0);

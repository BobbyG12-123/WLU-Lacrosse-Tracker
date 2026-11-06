// TEST ONLY: shared setup. Boots an offline tracker frame on the fixture and wires the real gateway code into it.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TEST_ORIGIN = 'http://tracker.test', STAFF = 'coach@test.invalid', PROJECT = 'offline-test';
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64s = s => b64u(new TextEncoder().encode(s));
async function makeSigner() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  jwk.kid = 'k' + Math.random().toString(36).slice(2, 8);
  const sign = async (claims, over) => {
    const now = Math.floor(Date.now() / 1000), head = b64s(JSON.stringify(Object.assign({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' }, (over || {}).head)));
    const body = b64s(JSON.stringify(Object.assign({ aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, firebase: { sign_in_provider: 'google.com' }, sub: 'u-' + ((claims || {}).email || STAFF), iat: now - 10, exp: now + 3000, auth_time: now - 100, email: STAFF, email_verified: true }, claims)));
    return `${head}.${body}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', (over || {}).key || kp.privateKey, new TextEncoder().encode(head + '.' + body)))}`;
  };
  return { sign, jwk, jwksResponse: () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=3600' } }) };
}
const fakeReq = (url, o) => { o = o || {}; const headers = new Headers(o.headers || {}); if (!o.noOrigin) headers.set('origin', o.origin || TEST_ORIGIN); return { url, method: o.method || 'GET', headers, signal: o.signal, text: async () => o.body || '' }; };
async function bootFrame(id, collections) {
  const w = document.getElementById(id).contentWindow;
  for (let i = 0; i < 60 && !(w.firebase && w.firebase.apps && w.firebase.apps.length && typeof w.init === 'function'); i++) await sleep(300);
  const fake = makeFakeFirestore(collections);
  const real = w.firebase.firestore, f = function () { return fake; }; Object.keys(real).forEach(x => { f[x] = real[x]; }); f.FieldValue = real.FieldValue;
  w.firebase.firestore = f; w.__FAKE = fake;
  w.__BOOT_EMAIL = STAFF;
  w.init().then(() => { w.__BOOT_DONE = true; }, e => { w.__BOOT_ERR = String(e && e.stack || e); });
  for (let i = 0; i < 160 && !w.__appReady; i++) await sleep(500);
  await sleep(2500);
  w.__boot.email = STAFF;
  return w;
}
// A provider stream built from content blocks, in the real event order.
function sseOf(blocks, stop, chunkDelay) {
  const enc = new TextEncoder(), events = [];
  const ev = o => events.push(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
  ev({ type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 5 } } });
  blocks.forEach((b, i) => {
    if (b.type === 'text') { ev({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } }); const mid = Math.ceil(b.text.length / 2); ev({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: b.text.slice(0, mid) } }); ev({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: b.text.slice(mid) } }); }
    else if (b.type === 'thinking') { ev({ type: 'content_block_start', index: i, content_block: { type: 'thinking', thinking: '' } }); ev({ type: 'content_block_delta', index: i, delta: { type: 'signature_delta', signature: b.signature } }); }
    else { ev({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }); const js = JSON.stringify(b.input); ev({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: js.slice(0, 3) } }); ev({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: js.slice(3) } }); }
    ev({ type: 'content_block_stop', index: i });
  });
  ev({ type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 20 } });
  ev({ type: 'message_stop' });
  return events.map(e => enc.encode(e));
}
function streamResponse(chunks, opts) {
  opts = opts || {};
  return new Response(new ReadableStream({ async start(c) {
    for (const ch of chunks) { if (opts.signal && opts.signal.aborted) { c.error(new DOMException('Aborted', 'AbortError')); return; } if (opts.delay) await sleep(opts.delay); c.enqueue(ch); }
    if (opts.hang) { await new Promise((res, rej) => { if (opts.signal) opts.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))); }).catch(e => c.error(e)); return; }
    c.close();
  } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

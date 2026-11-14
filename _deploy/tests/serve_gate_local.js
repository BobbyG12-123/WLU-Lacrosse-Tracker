// TEST ONLY: the real Worker gate in front of a real build folder, on this machine, so staging_check.py can be tried without deploying.
//   deno run --no-prompt --allow-net=127.0.0.1 --allow-read=<dist> _deploy/tests/serve_gate_local.js <port> <dist folder>
import { site, LedgerCore } from '../../_chat/gateway/worker.js';
const [port, dist] = Deno.args, store = new Map();
const ledger = new LedgerCore({ get: async k => store.get(k), put: async (k, v) => { store.set(k, v); } }, {});
const env = { FIREBASE_PROJECT_ID: 'wlu-tracker-test', FIREBASE_WEB_KEY: 'public-web-key', SESSION_SECRET: crypto.randomUUID() + crypto.randomUUID(), ANTHROPIC_API_KEY: 'not-real', STAFF_RULES_REVIEWED: 'sha256:' + 'a'.repeat(64),
  ASSETS: { fetch: async req => { const p = new URL(req.url).pathname; try { return new Response(await Deno.readTextFile(dist + (p === '/' ? '/index.html' : p)), { headers: { 'content-type': 'text/html' } }); } catch (e) { return new Response('not found', { status: 404 }); } } } };
const refuse = async () => new Response('{}', { status: 403 });   // no real upstream: every outside call is refused
Deno.serve({ port: Number(port), hostname: '127.0.0.1', onListen() { console.log('READY'); } }, req => site(req, env, { waitUntil: p => p }, { fetch: refuse, ledger }));

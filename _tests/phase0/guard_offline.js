// TEST ONLY — must be the first script. Nothing may leave this machine: fetch, XHR, WebSocket, EventSource and
// sendBeacon to any other origin are refused before they are sent, and Firebase may only start with the offline
// config. Every refused attempt is logged in window.__GUARD.blocked.
(function () {
  'use strict';
  const G = window.__GUARD = { blocked: [], refusedInit: [] };
  const off = u => { try { return new URL(String(u), location.href).origin !== location.origin; } catch (e) { return true; } };
  const block = (kind, u) => { G.blocked.push(kind + ' ' + String(u).slice(0, 160)); };
  const f0 = window.fetch;
  window.fetch = function (input, init) { const u = typeof input === 'string' ? input : (input && input.url); if (off(u)) { block('fetch', u); return Promise.reject(new TypeError('offline test: blocked')); } return f0.apply(this, arguments); };
  const open0 = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { if (off(u)) { block('xhr', u); arguments[1] = 'http://127.0.0.1:9/blocked'; } return open0.apply(this, arguments); };
  const WS = window.WebSocket; window.WebSocket = function (u) { block('ws', u); throw new Error('offline test: blocked'); }; window.WebSocket.prototype = WS.prototype;
  if (window.EventSource) { window.EventSource = function (u) { block('sse', u); throw new Error('offline test: blocked'); }; }
  if (navigator.sendBeacon) navigator.sendBeacon = function (u) { block('beacon', u); return false; };
  if (navigator.serviceWorker) { try { Object.defineProperty(navigator, 'serviceWorker', { value: { register: () => Promise.reject(new Error('offline test')), getRegistrations: () => Promise.resolve([]) } }); } catch (e) { /* ignore */ } }
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true, get: () => fb, set: v => {
    fb = v;
    if (v && v.initializeApp && !v.__trapped) { const init = v.initializeApp.bind(v); v.initializeApp = function (cfg, n) { if (!cfg || cfg.projectId !== 'offline-test') { G.refusedInit.push(cfg && cfg.projectId); throw new Error('offline test: refused firebase config'); } return init(cfg, n); }; v.__trapped = true; }
  } });
})();

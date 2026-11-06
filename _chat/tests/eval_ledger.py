#!/usr/bin/env python3
"""TEST ONLY: the spending ledger for paid model comparisons. Lives in the local server, not the browser.

Every call is written to disk as reserved at its worst-case cost before it's forwarded. A crash leaves the reservation in the file,
and it is then charged in full. A file lock covers separate processes as well as threads, so repeated or simultaneous runs can't
spend the same dollars. Money is whole millionths of a dollar (a per-million-token price times a token count).
"""
import fcntl, json, math, os, pathlib, tempfile, time, uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Must equal PRICES in _chat/gateway/worker.js (test_eval_server.py checks this).
PRICES = {
    'claude-haiku-5-5': {'in': 0.10, 'cw': 0.125, 'cr': 0.01, 'out': 0.50, 'longOver': 100000, 'long': {'in': 0.50, 'cw': 0.625, 'cr': 0.05, 'out': 2.50}},
    'claude-sonnet-5-5': {'in': 2, 'cw': 2.50, 'cr': 0.10, 'out': 10},
}
TOKENS_PER_BYTE_MAX = 0.5
MAX_IN_FLIGHT = 2
ORPHAN_SECONDS = 600


class Refused(Exception):
    def __init__(self, reason):
        super().__init__(reason); self.reason = reason


def month_key(ts):
    return datetime.fromtimestamp(ts, timezone.utc).astimezone(ZoneInfo('America/New_York')).strftime('%Y-%m')


def worst_case_micros(body_bytes, max_tokens, price):
    tokens = math.ceil(body_bytes * TOKENS_PER_BYTE_MAX)
    p = price['long'] if price.get('longOver') and tokens > price['longOver'] else price
    return math.ceil(tokens * max(p['in'], p['cw']) + max_tokens * p['out'])


def actual_micros(u, price):
    total = u['input'] + u['cache_read'] + u['cache_write']
    p = price['long'] if price.get('longOver') and total > price['longOver'] else price
    return math.ceil(u['input'] * p['in'] + u['cache_write'] * p['cw'] + u['cache_read'] * p['cr'] + u['output'] * p['out'])


def _alive(pid):
    try:
        os.kill(pid, 0); return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


class EvalLedger:
    def __init__(self, path, cap_usd=2.0, margin_usd=0.10, clock=time.time):
        self.path = pathlib.Path(path); self.cap = round(cap_usd * 1e6); self.margin = round(margin_usd * 1e6); self.clock = clock
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock_path = self.path.with_name(self.path.name + '.lock')

    # One writer at a time, across threads and processes (each call opens its own lock file handle).
    def _locked(self, fn):
        with open(self.lock_path, 'w') as lk:
            fcntl.flock(lk, fcntl.LOCK_EX)
            data = self._read()
            out = fn(data)
            self._write(data)
            return out

    def _read(self):
        if not self.path.exists():
            return {'note': 'Spending on paid model comparisons. Counts toward the $10 monthly chat budget.', 'months': {}}
        return json.loads(self.path.read_text())   # unreadable: raises and nothing is spent

    def _write(self, data):
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=self.path.name + '.')
        with os.fdopen(fd, 'w') as f:
            json.dump(data, f, indent=1); f.flush(); os.fsync(f.fileno())
        os.replace(tmp, self.path)
        d = os.open(self.path.parent, os.O_RDONLY)
        try: os.fsync(d)
        finally: os.close(d)

    def _month(self, data):
        k = month_key(self.clock())
        m = data['months'].setdefault(k, {'spent_micros': 0, 'calls': 0, 'refused': 0, 'never_settled': 0, 'reserved': {}, 'by_model': {}})
        for rid, r in list(m['reserved'].items()):   # a reservation whose process died, or that's far too old, is charged in full
            if not _alive(r['pid']) or self.clock() - r['at'] > ORPHAN_SECONDS:
                m['spent_micros'] += r['max']; m['never_settled'] += 1; del m['reserved'][rid]
        return m

    def reserve(self, max_micros, model, run):
        def go(data):
            m = self._month(data)
            if len(m['reserved']) >= MAX_IN_FLIGHT:
                m['refused'] += 1; return ('busy', None)
            committed = m['spent_micros'] + sum(r['max'] for r in m['reserved'].values())
            if committed + max_micros > self.cap - self.margin:
                m['refused'] += 1; return ('budget', None)
            rid = uuid.uuid4().hex
            m['reserved'][rid] = {'max': max_micros, 'at': self.clock(), 'model': model, 'run': run, 'pid': os.getpid()}
            return (None, rid)
        why, rid = self._locked(go)
        if why: raise Refused(why)
        return rid

    def settle(self, rid, cost_micros, usage=None):
        def go(data):
            for k, m in data['months'].items():
                if rid in m['reserved']:
                    r = m['reserved'].pop(rid)
                    m['spent_micros'] += cost_micros; m['calls'] += 1
                    b = m['by_model'].setdefault(r['model'], {'calls': 0, 'input': 0, 'output': 0, 'cache_read': 0, 'cache_write': 0, 'micros': 0})
                    b['calls'] += 1; b['micros'] += cost_micros
                    for f in ('input', 'output', 'cache_read', 'cache_write'):
                        b[f] += (usage or {}).get(f, 0)
                    return True
            return False
        return self._locked(go)

    def status(self):
        def go(data):
            m = self._month(data); res = sum(r['max'] for r in m['reserved'].values()); k = month_key(self.clock())
            return {'month': k, 'cap_usd': self.cap / 1e6, 'stop_at_usd': (self.cap - self.margin) / 1e6, 'spent_usd': m['spent_micros'] / 1e6, 'reserved_usd': res / 1e6, 'calls': m['calls'], 'refused': m['refused'], 'never_settled': m['never_settled'],
                    'by_model': {x: dict(v, usd=v['micros'] / 1e6) for x, v in m['by_model'].items()}, 'prior_spend_json': json.dumps({k: math.ceil(m['spent_micros'] / 1e4) / 100 + 0.0})}
        return self._locked(go)

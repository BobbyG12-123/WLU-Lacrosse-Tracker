#!/usr/bin/env python3
"""TEST ONLY: writes a deterministic, fully synthetic tracker export for the Player Development tests.

Usage: python3 make_fixture.py <path to index.html> <out.json>

Nothing here comes from real data: players are "Synth Player NN", opponents are made up, goals are drawn from a
known logistic model, and Film Check file ids are fake. The shot columns are read from index.html (COLS), so the
fixture follows the tracker's own tuple format.

Built-in situations the tests rely on:
  * 18 sessions in the 2027 season: 15 practices, 1 intra-squad scrimmage (no opponent), 2 opponent scrimmages.
  * #20 takes 25 shots every session (450 > the old 400-record cap on conclusions).
  * No shot is both Underhand and Heavy-contested (each is common on its own): the "combination" screen test.
  * Film Check 10/21: the last shot was logged from clip X ('n') and clip X+1 is matched ('m') to the same shot,
    the double-claim seen in real data. Film Check 10/19: one mark by entry id, one by shot number.
"""
import json, math, random, re, sys

SEED = 20261102
OPP = {'2026-10-11': 'Synth State', '2026-10-25': 'Test College'}
PRACTICES = ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-23', '2026-09-28', '2026-09-30', '2026-10-03',
             '2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-17', '2026-10-19', '2026-10-21']
INTRA = '2026-09-25'
TRIGGERS = ['Pick', 'Seal', 'Rub', 'Slip', 'Ghost', 'Keep', 'Get', 'Side']


def cols_from(index_html):
    s = open(index_html, encoding='utf-8').read()
    m = re.search(r'const COLS\s*=\s*\[(.*?)\];', s, re.S)
    if not m:
        sys.exit('COLS not found in index.html')
    body = re.sub(r'//[^\n]*', '', m.group(1))
    return json.loads('[' + body + ']')


def main():
    index_html, out = sys.argv[1], sys.argv[2]
    COLS = cols_from(index_html)
    rnd = random.Random(SEED)
    jerseys = [str(j) for j in range(1, 31)]
    roster = [{'jersey': j, 'name': f'Synth Player{int(j):02d}', 'roles': ['player']} for j in jerseys] + \
             [{'jersey': '31', 'name': 'Synth Keeper31', 'roles': ['goalie']}, {'jersey': '32', 'name': 'Synth Keeper32', 'roles': ['goalie']}]
    hand = {j: ('Left' if rnd.random() < 0.25 else 'Right') for j in jerseys}
    hand['20'] = 'Right'
    sid_ctr = [6000]
    eid_ctr = [0]

    def shot(date, ctx, opp, shooter):
        lat = rnd.uniform(-14, 14)
        dist = rnd.uniform(1.5, 17)
        plane = rnd.choices(['Overhand', 'Sidearm', 'Underhand', 'BTB', 'Twister'], [55, 25, 15, 3, 2])[0]
        contest = rnd.choices(['Open', 'Light', 'Heavy'], [45, 35, 20])[0]
        if plane == 'Underhand' and contest == 'Heavy':
            contest = 'Light'   # the combination never happens
        dodge = 1 if rnd.random() < 0.55 else 0
        ang = math.atan2(abs(lat), max(0.1, dist)) / (math.pi / 2)
        z = 0.9 - 0.11 * dist - 1.1 * ang - {'Open': 0, 'Light': 0.45, 'Heavy': 0.95}[contest] - 0.2 * dodge + {'Overhand': 0, 'Sidearm': -0.1, 'Underhand': 0.1, 'BTB': -0.3, 'Twister': -0.3}[plane]
        p = 1 / (1 + math.exp(-z))
        goal = 1 if rnd.random() < p else 0
        if goal:
            outcome, onk, blocked = 'Goal', 1, 0
        else:
            outcome = rnd.choices(['Saved', 'Miss', 'Blocked', 'Pipe'], [50, 32, 12, 6])[0]
            onk, blocked = (1 if outcome == 'Saved' else 0), (1 if outcome == 'Blocked' else 0)
        q = p + rnd.uniform(-0.12, 0.12)
        grade = '1-Gold' if q > 0.5 else ('3-Bronze' if q < 0.2 else '2-Silver')
        sid_ctr[0] += 1
        o = {c: None for c in COLS}
        o.update({'id': sid_ctr[0], 'date': date, 'context': ctx, 'opponent': opp, 'shooterJersey': shooter,
                  'goalieJersey': None if opp else rnd.choice(['31', '32']), 'onGoal': onk, 'onKeeper': onk, 'goal': goal, 'blocked': blocked,
                  'offDodge': dodge, 'rightHanded': hand[shooter], 'shotQuality': grade, 'distanceYds': round(dist, 1), 'lateralYds': round(lat, 1),
                  'contestLevel': contest, 'outcome': outcome, 'shotMechanism': plane, 'manSituation': 'Even',
                  'trigger': rnd.choice(TRIGGERS) if rnd.random() < 0.3 else None, 'team': None})
        if rnd.random() < 0.03:
            o['contestLevel'] = None          # "Not logged" cases
        if rnd.random() < 0.02 and shooter != '20':
            o['rightHanded'] = None
        if rnd.random() < 0.5 and 'eid' in o:
            eid_ctr[0] += 1
            o['eid'] = f'synth-eid-{eid_ctr[0]}'
        return o

    sessions = {}

    def add_session(date, ctx, opp, n_other):
        sid = date + '_' + ctx.lower() + (('_' + re.sub(r'[^a-z0-9]+', '-', opp.lower()).strip('-')) if opp else '')
        doc = {'date': date, 'context': ctx, 'opponent': opp}
        shots = [shot(date, ctx, opp, '20') for _ in range(25)] + [shot(date, ctx, opp, rnd.choice([j for j in jerseys if j != '20'])) for _ in range(n_other)]
        shots.sort(key=lambda o: o['id'])
        for o in shots:
            doc['s_%d' % o['id']] = json.dumps([o[c] for c in COLS])
        sessions[sid] = doc
        return sid, shots

    made = {}
    for d in PRACTICES:
        made[d] = add_session(d, 'Practice', None, 32)
    made[INTRA] = add_session(INTRA, 'Scrimmage', None, 30)
    for d, opp in OPP.items():
        made[d] = add_session(d, 'Scrimmage', opp, 30)

    app = {}
    for k in ['roster', 'roster_2027', 'roster_2026', 'seed_roster']:
        app[k] = {'list': roster}
    seed = []
    for i in range(40):   # a small, older 2026 season so the season list has history
        o = shot('2026-03-%02d' % (1 + i % 28), 'Practice', None, rnd.choice(jerseys))
        seed.append([o[c] for c in COLS])
    app['seed_shots'] = {'json': json.dumps(seed)}
    app['shots_live'] = {'json': '[]'}
    app['faceoffs_live'] = {'json': '[]'}

    def fc_doc(date, shots, extra_clip_for=None):
        drafts, t = [], 60.0
        for i, o in enumerate(shots):
            t += rnd.uniform(25, 60)
            drafts.append({'id': f'{date}-shot{i + 1:02d}', 'kind': 'shot', 'n': i + 1, 'file': f'{date}_shot{i + 1:02d}.mp4', 'filmShotTime': round(t, 2),
                           'clipStart': round(t - 20, 2), 'clipEnd': round(t + 5, 2), 'shotInClip': 20, 'possessionTag': True, 'guess': {}, 'taggers': 1,
                           'fileId': f'SYNTHfile{date.replace("-", "")}{i + 1:04d}xx'})
        return {'at': '2026-10-28T00:00:00Z', 'opponent': None, 'drafts': json.dumps(drafts), 'film': f'synthetic_{date}.mp4', 'by': 'Synth Coach', 'account': 'synth.coach@example.com'}, drafts

    # 10/21: one clip per logged shot plus one more; the last logged shot (highest id) was "logged from" clip 24 and
    # clip 25 was then matched to it as well.
    _, s21 = made['2026-10-21']
    last = max(o['id'] for o in s21)
    order = [o for o in s21 if o['id'] != last]
    order = order[:23] + [next(o for o in s21 if o['id'] == last)] + order[23:]
    doc21, dr21 = fc_doc('2026-10-21', order + [order[0]])   # one extra clip
    doc21['st_' + dr21[23]['id']] = json.dumps({'by': 'Synth Coach', 'at': '2026-10-29', 's': 'n', 'id': last})
    doc21['st_' + dr21[24]['id']] = json.dumps({'by': 'Synth Coach', 'at': '2026-10-29', 's': 'm', 'id': last})
    # 10/19: one mark by entry id (shot with an eid), one legacy mark by number (shot without one).
    _, s19 = made['2026-10-19']
    doc19, dr19 = fc_doc('2026-10-19', s19)
    with_eid = next(o for o in s19 if o.get('eid'))
    no_eid = next(o for o in s19 if not o.get('eid'))
    i1, i2 = s19.index(with_eid), s19.index(no_eid)
    doc19['st_' + dr19[i1]['id']] = json.dumps({'by': 'Synth Coach', 'at': '2026-10-29', 's': 'm', 'id': with_eid['id'], 'eid': with_eid['eid']})
    doc19['st_' + dr19[i2]['id']] = json.dumps({'by': 'Synth Coach', 'at': '2026-10-29', 's': 'm', 'id': no_eid['id']})
    app['filmcheck_2026-10-21'] = doc21
    app['filmcheck_2026-10-19'] = doc19
    app['filmcheck_index'] = {'p_2026-10-21': json.dumps({'shots': len(dr21), 'opps': 0, 'tos': 0, 'opp': None}),
                              'p_2026-10-19': json.dumps({'shots': len(dr19), 'opps': 0, 'tos': 0, 'opp': None})}
    meta = {'synthetic': True, 'seed': SEED, 'double_claim': '2026-10-21_practice#%d' % last,
            'eid_mark': '2026-10-19_practice#%d' % with_eid['id'], 'num_mark': '2026-10-19_practice#%d' % no_eid['id'],
            'clip24_file': dr21[23]['fileId'], 'heavy_shooter': '20'}
    json.dump({'exportedAt': '2026-11-02T00:00:00Z', 'by': 'synthetic', 'meta': meta,
               'collections': {'app': app, 'sessions': sessions, 'evalPlayers': {}, 'evalRatings': {}, 'filmTags': {}, 'filmSessions': {}, 'trainQueues': {}, 'trainShots': {}}},
              open(out, 'w'))
    print(f'WROTE {out}: {len(sessions)} sessions, {sum(len([k for k in d if k.startswith("s_")]) for d in sessions.values())} shots (synthetic, seed {SEED})')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""TEST ONLY: writes a deterministic, fully synthetic tracker export for the Phase 0 correction tests.

Usage: python3 make_fixture.py <path to index.html> <out.json>

Nothing here is real: players are "Synth PlayerNN", opponents are made up. Shot and possession columns are read from
index.html (COLS, POSS_COLS), so the fixture follows the tracker's own tuple format.

Built-in situations the tests rely on (they mirror what the Phase 0 audit found in real data):
  * 2027 season: 12 practices, a practice AND a scrimmage logged with no opponent on 2026-09-25 (40 WLU shots, no
    recorded type), two opponent scrimmages on 2026-10-25 with their shots on our goalies, and an empty scrimmage doc.
  * Lineups (stints) from 10/07 on; #29 is on the field for exactly 1 offensive possession (and many defensive ones).
  * 5 shots on 9/14 with no man situation; one pick logged with no coverage; triggers on ~40% of shots.
"""
import json, math, random, re, sys

SEED = 20261103
PRACTICES = ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30',
             '2026-10-07', '2026-10-12', '2026-10-19', '2026-10-21']
UNTYPED = '2026-09-25'
OPP = [('2026-10-25', 'Synth State'), ('2026-10-25', 'Test College')]
TRIGGERS = ['Pick', 'Seal', 'Rub', 'Slip', 'Ghost', 'Keep']
COVER = ['Switch', 'Hedge', 'Under', 'Blown']


def cols(html, name):
    m = re.search(r'const ' + name + r'\s*=\s*\[(.*?)\];', html, re.S)
    if not m:
        sys.exit(name + ' not found in index.html')
    return re.findall(r'"([^"]+)"', re.sub(r'//[^\n]*', '', m.group(1)))


def main():
    html = open(sys.argv[1], encoding='utf-8').read()
    COLS, PCOLS = cols(html, 'COLS'), cols(html, 'POSS_COLS')
    rnd = random.Random(SEED)
    players = [str(j) for j in range(1, 31)]
    roster = [{'jersey': j, 'name': f'Synth Player{int(j):02d}', 'roles': ['player']} for j in players] + \
             [{'jersey': '31', 'name': 'Synth Keeper31', 'roles': ['goalie']}, {'jersey': '32', 'name': 'Synth Keeper32', 'roles': ['goalie']}]
    ids = {'shot': 7000, 'poss': 200, 'stint': 0}
    sessions = {}

    def tup(o, c):
        return json.dumps([o.get(k) for k in c])

    def shot(date, ctx, opp, shooter, team=None, stint=None, man='Even'):
        dist, lat = rnd.uniform(1.5, 17), rnd.uniform(-14, 14)
        p = 1 / (1 + math.exp(-(0.8 - 0.11 * dist - 0.04 * abs(lat))))
        goal = 1 if rnd.random() < p else 0
        onk = 1 if goal or rnd.random() < 0.55 else 0
        ids['shot'] += 1
        o = {c: None for c in COLS}
        o.update({'id': ids['shot'], 'date': date, 'context': ctx, 'opponent': opp, 'shooterJersey': shooter, 'team': team,
                  'goalieJersey': None if (opp and team != 'OPP') else rnd.choice(['31', '32']), 'onGoal': onk, 'onKeeper': onk, 'goal': goal,
                  'blocked': 0 if onk else (1 if rnd.random() < 0.2 else 0), 'cleanSave': 0, 'offDodge': 1 if rnd.random() < 0.45 else 0,
                  'rightHanded': 'Right', 'shotQuality': '1-Gold' if p > 0.5 else ('3-Bronze' if p < 0.25 else '2-Silver'),
                  'distanceYds': round(dist, 1), 'lateralYds': round(lat, 1), 'contestLevel': rnd.choice(['Open', 'Light', 'Heavy']),
                  'outcome': 'Goal' if goal else ('Saved' if onk else 'Miss'), 'manSituation': man, 'rebound': None,
                  'trigger': rnd.choice(TRIGGERS) if rnd.random() < 0.4 else None, 'stintId': stint, 'eid': 'synth-' + str(ids['shot'])})
        if team == 'OPP':
            o['shooterJersey'], o['oppShooter'] = None, 'o' + str(rnd.randint(1, 40))
        if rnd.random() < 0.15 and team != 'OPP':
            o.update({'pick': 'Yes', 'pickCoverage': rnd.choice(COVER), 'pickScreener': rnd.choice(players), 'pickUser': shooter, 'pickResult': 'Freed ball carrier'})
        return o

    def poss(date, ctx, opp, team='WLU', stint=None):
        ids['poss'] += 1
        o = {c: None for c in PCOLS}
        o.update({'id': ids['poss'], 'date': date, 'context': ctx, 'opponent': opp, 'team': team, 'manSituation': 'Even',
                  'end': rnd.choice(['Turnover', 'Turnover', 'Failed clear', 'Shot clock']), 'dominoes': 'No', 'stintId': stint, 'eid': 'synth-p' + str(ids['poss'])})
        if o['end'] == 'Turnover' and team == 'WLU':
            o['turnoverBy'] = rnd.choice(players)
        return o

    def session(date, ctx, opp, n_shots, n_poss, lineups=False, opp_shots=0):
        slug = ('_' + re.sub(r'[^a-z0-9]+', '-', opp.lower()).strip('-')) if opp else ''
        sid = date + '_' + ctx.lower() + slug
        doc = {'date': date, 'context': ctx, 'opponent': opp}
        stints = []
        if lineups:
            for k in range(4):
                ids['stint'] += 1
                off = rnd.sample([p for p in players if p not in ('29',)], 6)
                dfn = rnd.sample([p for p in players if p not in off], 6)
                if k == 3 and '29' not in dfn:
                    dfn[0] = '29'
                st = {'id': 'synthstint%03d' % ids['stint'], 'seq': k + 1, 'offense': off, 'defense': dfn, 'offTeam': 'WLU'}
                stints.append(st)
                doc['t_' + st['id']] = json.dumps({k2: v for k2, v in st.items() if k2 != 'id'})
        pick_st = lambda: rnd.choice(stints)['id'] if stints else None
        for i in range(n_shots):
            man = None if (date == '2026-09-14' and i < 5) else 'Even'
            o = shot(date, ctx, opp, rnd.choice(players), stint=pick_st(), man=man)
            doc['s_%d' % o['id']] = tup(o, COLS)
        for i in range(opp_shots):
            o = shot(date, ctx, opp, None, team='OPP')
            doc['s_%d' % o['id']] = tup(o, COLS)
        for i in range(n_poss):
            o = poss(date, ctx, opp, stint=pick_st())
            doc['p_%d' % o['id']] = tup(o, PCOLS)
        sessions[sid] = doc
        return sid, doc, stints

    for d in PRACTICES:
        sid, doc, st = session(d, 'Practice', None, 40, 20, lineups=d >= '2026-10-07')
        if d == '2026-10-07':   # #29 on offense for exactly one possession
            ids['stint'] += 1
            off = ['29'] + rnd.sample([p for p in players if p != '29'], 5)
            dfn = rnd.sample([p for p in players if p not in off], 6)
            doc['t_synthstint999'] = json.dumps({'seq': 9, 'offense': off, 'defense': dfn, 'offTeam': 'WLU'})
            o = poss(d, 'Practice', None, stint='synthstint999'); doc['p_%d' % o['id']] = tup(o, PCOLS)
        if d == '2026-10-12':   # a pick logged with no coverage
            o = shot(d, 'Practice', None, '7'); o.update({'pick': 'Yes', 'pickCoverage': None, 'stintId': st[0]['id'] if st else None}); doc['s_%d' % o['id']] = tup(o, COLS)
    session(UNTYPED, 'Scrimmage', None, 40, 0)
    sessions['2026-10-03_scrimmage'] = {'date': '2026-10-03', 'context': 'Scrimmage', 'opponent': None}
    for d, opp in OPP:
        session(d, 'Scrimmage', opp, 30, 10, opp_shots=20)

    app = {k: {'list': roster} for k in ['roster', 'roster_2027', 'roster_2026', 'seed_roster']}
    seed = []
    for i in range(60):
        o = shot('2026-03-%02d' % (1 + i % 28), 'Practice' if i % 3 else 'Game', None if i % 3 else 'Old Opp', rnd.choice(players))
        seed.append([o.get(c) for c in COLS])
    app['seed_shots'] = {'json': json.dumps(seed)}
    app['shots_live'] = {'json': '[]'}
    app['faceoffs_live'] = {'json': '[]'}
    out = {'exportedAt': '2026-11-03T00:00:00Z', 'by': 'synthetic fixture', 'collections': {'app': app, 'sessions': sessions}}
    json.dump(out, open(sys.argv[2], 'w'), indent=0)
    print('fixture:', len(sessions), 'sessions,', ids['shot'] - 7000, 'shots,', ids['poss'] - 200, 'possessions')


if __name__ == '__main__':
    main()

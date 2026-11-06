#!/usr/bin/env python3
"""Builds _deploy/dist from this checkout's pages. --chat points the chat at the same-origin gateway; without it the old chat stays.
Refuses if a page holds anything that looks like a secret or embedded records."""
import pathlib, re, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent; DIST = ROOT / '_deploy' / 'dist'
PAGES = ['index.html', 'opponent-scout.html', 'train-tagger.html']
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir(parents=True)
for name in PAGES:
    text = (ROOT / name).read_text(encoding='utf-8')
    for label, rx in {'an API key': r'sk-ant-[A-Za-z0-9_-]{10,}', 'a private key': r'-----BEGIN [A-Z ]*PRIVATE KEY', 'hardcoded shots': r'SEED_SHOTS_TUPLES\s*=\s*\[\['}.items():
        if re.search(rx, text): sys.exit(f'REFUSED: {name} holds {label}')
    if name == 'index.html' and '--chat' in sys.argv:
        old = "let CHAT_GW_URL = '';"
        if text.count(old) != 1: sys.exit('REFUSED: gateway setting not found exactly once')
        text = text.replace(old, "let CHAT_GW_URL = '/chat-api';")
    (DIST / name).write_text(text, encoding='utf-8')
print('built', DIST, '(chat on)' if '--chat' in sys.argv else '(chat setting left off)')

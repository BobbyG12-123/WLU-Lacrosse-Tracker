#!/usr/bin/env python3
"""Does permission to read the probe document really mean "approved staff" under these Firestore rules?

  python3 _deploy/check_rules.py <copy of the live rules> [--doc app/roster] [--page index.html]

Reads a local copy of the rules. Prints a verdict, and the fingerprint to set as STAFF_RULES_REVIEWED only on a pass.
Exit 0 only on a pass. It reads conservatively: anything it can't positively recognize is a failure, so a pass means
the read rule for the probe document is a single named function that requires a verified Google sign-in and an explicit list
of email addresses, and no other rule can grant that read. It prints counts, not addresses.

This checks the text you give it, at the moment you check it. It can't see a later change to the live rules: the live test with a
non-staff account (DEPLOY.md) is a separate, required step, and any rules change means running this again.
"""
import argparse, hashlib, pathlib, re, sys

def strip_comments(text):
    return re.sub(r'/\*.*?\*/', '', re.sub(r'//[^\n]*', '', text), flags=re.S)

def blocks(text):
    """Every `match <path> { ... }` with its full path, innermost text kept separately from nested matches."""
    out, stack, i = [], [], 0
    token = re.compile(r'match\s+(\S+)\s*\{|function\s+\w+\s*\([^)]*\)\s*\{|service\s+[\w.]+\s*\{|\{|\}')
    frames = []
    for m in token.finditer(text):
        t = m.group(0)
        if t == '}':
            if not frames: raise ValueError('unbalanced braces')
            f = frames.pop()
            if f['path'] is not None: out.append({'path': f['path'], 'body': f['own'] + text[f['resume']:m.start()]})
            if frames and frames[-1]['path'] is not None: frames[-1]['resume'] = m.end()
            continue
        path = None
        if t.startswith('match'):
            parent = next((f['path'] for f in reversed(frames) if f['path'] is not None), '')
            path = parent + m.group(1)
        if frames and frames[-1]['path'] is not None and t.startswith('match'):
            frames[-1]['own'] += text[frames[-1]['resume']:m.start()]
        frames.append({'path': path, 'own': '', 'resume': m.end()})
    if frames: raise ValueError('unbalanced braces')
    return out

def path_matches(pattern, doc):
    """Could this match pattern apply to documents/<doc>? Unknown shapes count as yes, so they get checked."""
    if '/documents' not in pattern: return True
    tail = pattern.split('/documents', 1)[1].strip('/').split('/')
    parts = doc.split('/')
    for i, seg in enumerate(tail):
        if re.fullmatch(r'\{\w+=\*\*\}', seg): return True
        if i >= len(parts): return False
        if not re.fullmatch(r'\{\w+\}', seg) and seg != parts[i]: return False
    return len(tail) == len(parts)

def grants(body):
    """Each allow statement that covers a read of one document, as its condition text."""
    found = []
    for m in re.finditer(r'allow\s+([\w\s,]+?)(?::\s*if\s+([^;]*))?;', body):
        ops = {x.strip() for x in m.group(1).split(',')}
        if ops & {'read', 'get'}: found.append((m.group(2) or 'true').strip())
    return found

def function_body(text, name):
    m = re.search(r'function\s+' + re.escape(name) + r'\s*\(\s*\)\s*\{\s*return\s+(.*?);\s*\}', text, re.S)
    return m.group(1) if m else None

def check_function(body):
    """The whole expression must be an AND of exactly the required, recognized pieces."""
    problems = []
    flat = re.sub(r'\s+', ' ', body).strip()
    if '||' in flat: problems.append('the staff function has an OR, so it might not need the list')
    parts = [p.strip() for p in flat.split('&&')]
    required = {
        'signed in': r'request\.auth != null',
        'verified email': r'request\.auth\.token\.email_verified == true',
        'Google sign-in': r"request\.auth\.token\.firebase\.sign_in_provider == 'google\.com'",
    }
    for label, rx in required.items():
        if not any(re.fullmatch(rx, p) for p in parts): problems.append(f'the staff function does not require: {label}')
    lists = [p for p in parts if re.fullmatch(r"request\.auth\.token\.email(\.lower\(\))? in \[.*\]", p)]
    if len(lists) != 1: problems.append('the staff function does not check one explicit email list')
    extra = [p for p in parts if not any(re.fullmatch(rx, p) for rx in required.values()) and p not in lists]
    if extra: problems.append(f'the staff function has {len(extra)} piece(s) this check does not recognize')
    emails = re.findall(r"'([^'@\s]+@[^'\s]+)'", lists[0]) if lists else []
    if lists and not emails: problems.append('the email list is empty')
    if lists and len(emails) != lists[0].count("'") / 2: problems.append('the email list holds something other than plain addresses')
    return problems, emails

def verdict(text, doc):
    clean = strip_comments(text)
    try: all_blocks = blocks(clean)
    except ValueError as e: return [str(e)], [], None
    applying = [b for b in all_blocks if path_matches(b['path'], doc)]
    conds = [(b['path'], c) for b in applying for c in grants(b['body'])]
    open_conds = [(p, c) for p, c in conds if c != 'false']
    problems = []
    if not open_conds: problems.append(f'no rule grants a read of {doc}, so every coach would be refused')
    names = set()
    for p, c in open_conds:
        m = re.fullmatch(r'(\w+)\(\)', c)
        if not m: problems.append(f'a rule on {p} grants the read on a condition other than one staff function')
        else: names.add(m.group(1))
    if len(names) > 1: problems.append('more than one function can grant the read')
    emails = []
    for n in names:
        body = function_body(clean, n)
        if body is None: problems.append(f'function {n} could not be read'); continue
        ps, emails = check_function(body)
        problems += ps
    return problems, emails, sorted(names)

def page_emails(path):
    text = pathlib.Path(path).read_text(encoding='utf-8')
    m = re.search(r'ALLOWED_COACHES\s*=\s*\[(.*?)\]', text, re.S)
    return {x.lower() for x in re.findall(r"'([^'@\s]+@[^'\s]+)'", m.group(1))} if m else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rules'); ap.add_argument('--doc', default='app/roster'); ap.add_argument('--page')
    a = ap.parse_args()
    raw = pathlib.Path(a.rules).read_bytes()
    problems, emails, names = verdict(raw.decode('utf-8'), a.doc)
    print(f'Probe document: {a.doc}\nStaff function: {names}\nAddresses in the rules list: {len(emails)}')
    if a.page:
        pg = page_emails(a.page); low = {e.lower() for e in emails}
        if pg is None: problems.append('could not read ALLOWED_COACHES from the page')
        else:
            print(f'Addresses in the page list: {len(pg)}; on the page but not in the rules: {len(pg - low)}; in the rules but not on the page: {len(low - pg)}')
            if pg - low: print('  NOTE: those coaches pass the page but Firestore refuses them, and they would be refused here too.')
    if problems:
        print('\nFAIL: read permission on this document can\'t be treated as staff membership:')
        for p in problems: print('  -', p)
        return 1
    print('\nPASS for this text. Set this in wrangler.toml:\n  STAFF_RULES_REVIEWED = "sha256:' + hashlib.sha256(raw).hexdigest() + '"')
    print('Still required: the live test with a non-staff Google account (DEPLOY.md). Re-run after any rules change.')
    return 0

if __name__ == '__main__':
    sys.exit(main())

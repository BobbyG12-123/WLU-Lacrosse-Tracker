#!/usr/bin/env python3
"""TEST ONLY: check_rules.py must pass only rules where reading the probe document truly requires the staff list. No real addresses here."""
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('check_rules', pathlib.Path(__file__).resolve().parent.parent / 'check_rules.py')
cr = importlib.util.module_from_spec(spec); spec.loader.exec_module(cr)

FN = """function isCoach() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.firebase.sign_in_provider == 'google.com'
        && request.auth.token.email.lower() in ['a@test.invalid', 'b@test.invalid'];
    }"""
def wrap(fn, inner):
    return "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    " + fn + "\n" + inner + "\n  }\n}\n"
GOOD = wrap(FN, "match /app/{docId} { allow read, write: if isCoach(); }\n match /sessions/{id} { allow read, write: if isCoach(); }\n match /{document=**} { allow read, write: if false; }")

CASES = [
    ('the expected shape', GOOD, True),
    ('a comment mentioning an open rule is ignored', GOOD.replace("match /sessions", "// match /x { allow read: if true; }\n match /sessions"), True),
    ('anyone signed in', wrap(FN, "match /app/{docId} { allow read: if request.auth != null; }"), False),
    ('public', wrap(FN, "match /app/{docId} { allow read: if true; }"), False),
    ('no condition at all', wrap(FN, "match /app/{docId} { allow read; }"), False),
    ('a catch-all that opens everything', GOOD.replace("allow read, write: if false", "allow read, write: if request.auth != null"), False),
    ('a catch-all read on the side', GOOD.replace("match /{document=**} { allow read, write: if false; }", "match /{document=**} { allow get: if request.auth != null; }"), False),
    ('a second rule on the document', wrap(FN, "match /app/{docId} { allow read: if isCoach(); }\n match /app/roster { allow get: if request.auth != null; }"), False),
    ('staff check OR anything', wrap(FN, "match /app/{docId} { allow read: if isCoach() || request.auth.uid != null; }"), False),
    ('an OR inside the function', wrap(FN.replace("&& request.auth.token.email.lower() in", "|| request.auth.token.email.lower() in"), "match /app/{docId} { allow read: if isCoach(); }"), False),
    ('no email list', wrap(FN.replace(" && request.auth.token.email.lower() in ['a@test.invalid', 'b@test.invalid']", "").replace("&& request.auth.token.email.lower() in ['a@test.invalid', 'b@test.invalid']", ""), "match /app/{docId} { allow read: if isCoach(); }"), False),
    ('an empty email list', wrap(FN.replace("['a@test.invalid', 'b@test.invalid']", "[]"), "match /app/{docId} { allow read: if isCoach(); }"), False),
    ('a domain test instead of a list', wrap(FN.replace("request.auth.token.email.lower() in ['a@test.invalid', 'b@test.invalid']", "request.auth.token.email.matches('.*@wlu.edu')"), "match /app/{docId} { allow read: if isCoach(); }"), False),
    ('unverified email allowed', wrap(FN.replace("&& request.auth.token.email_verified == true", ""), "match /app/{docId} { allow read: if isCoach(); }"), False),
    ('any sign-in provider', wrap(FN.replace("&& request.auth.token.firebase.sign_in_provider == 'google.com'", ""), "match /app/{docId} { allow read: if isCoach(); }"), False),
    ('nothing grants the read', wrap(FN, "match /sessions/{id} { allow read: if isCoach(); }"), False),
    ('only a different collection is open', wrap(FN, "match /app/{docId} { allow write: if isCoach(); }\n match /sessions/{id} { allow read: if request.auth != null; }"), False),
    ('a staff function that cannot be read', wrap("", "match /app/{docId} { allow read: if isCoach(); }"), False),
    ('broken braces', GOOD.rstrip()[:-1], False),
    ('not rules at all', 'hello', False),
    ('open write only stays a pass on read (and is reported elsewhere)', wrap(FN, "match /app/{docId} { allow read: if isCoach(); allow write: if true; }"), True),
]
fails = 0
for name, text, want in CASES:
    problems, emails, names = cr.verdict(text, 'app/roster')
    got = not problems
    ok = got == want
    fails += not ok
    print(('  OK   ' if ok else '  FAIL ') + f'{name}: {"pass" if got else "fail"}' + ('' if ok else f'  problems={problems}'))
print(f'pass {len(CASES) - fails}  fail {fails}')
sys.exit(1 if fails else 0)

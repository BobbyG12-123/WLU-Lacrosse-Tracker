# Staff-only hosting and chat: setup, checks and rollback

Prepared, not deployed. Steps 1 to 6 don't change the current site or the production rules. Step 7 is the production switch and needs the owner's approval at a specific commit.

Keys are only ever typed at a hidden prompt on your own computer. Never paste one into a chat or a file.

## What the design does

One Cloudflare Worker serves the pages and the chat gateway. Firebase keeps all the data. Every request runs the Worker's code first, so there is no address that skips the gate. Version URLs are off, and Cloudflare doesn't generate them for Workers with a Durable Object.

**Staff source:** there's no new list. Someone is staff if the live Firestore rules let their own sign-in read `app/roster`. Nobody counts as staff until `STAFF_RULES_REVIEWED` is set from `check_rules.py`, because reading that document only means "staff" if the rules say so.

**Why not Cloudflare Access:** it would need its own copy of the staff list. It can be added later as an outer door.

## Two timers, and what removal really does

| Timer | What it is | Length |
|---|---|---|
| Staff check memory | How long the Worker reuses a "yes, staff" answer for chat calls, to avoid a database read per call | 5 minutes |
| Page session | A signed cookie that lets the browser fetch the page files. It doesn't touch the database or the chat. | 1 hour |

After a coach is removed from the rules (measured in `_deploy/tests/site_test.js` with a stand-in for Firestore; confirm live in step 5):

| Access | Stops |
|---|---|
| Database reads and writes | At once: rules are checked on every read |
| New page session | At once: issuing one always asks Firestore |
| Chat | Within 5 minutes |
| Page files, on an existing session | Within 1 hour. The files hold code and staff addresses, not team data. |

**Not covered by any of this:**
- Data already cached in that coach's browser stays there. The tracker uses Firestore's offline cache.
- Google Drive film sharing is separate. Remove them from the Drive folder too.
- A Firebase ID token stays cryptographically valid for up to an hour. The rules still refuse it.

To shorten the page limit, lower `SESSION_SECONDS`; staff re-enter automatically with no extra clicks.

## 1. Accounts (you)

1. **Cloudflare:** create a free account and stay on the Workers Free plan. Don't add a paid plan.
2. **Anthropic:** create an API account and buy a small prepaid credit. Turn **auto-reload off**.
3. Install the deploy tool: `brew install node`.

## 2. Compare models (you run it; costs up to $2)

In your own Terminal, from the repo's `_chat/tests`:

```
./run_compare.sh
```

It asks for the key at a hidden prompt. Results go to `plans/chat_eval_runs/<run>/`. Tell me when it finishes and I'll read the transcripts and recommend a model. If the summary says INCOMPLETE, the setups are scored on the same finished questions, and I'll say what wasn't compared.

## 3. Check the live rules (you copy, the script checks)

1. Firebase console > Firestore > Rules. Copy the text into a file outside the repo, such as `~/Desktop/Lacrosse_Code/plans/live_rules_copy.rules`.
2. Run: `python3 _deploy/check_rules.py ~/Desktop/Lacrosse_Code/plans/live_rules_copy.rules --page index.html`
3. **Pass:** copy the `STAFF_RULES_REVIEWED` line into `wrangler.toml`.
4. **Fail:** don't deploy. The gate stays closed to everyone, by design. I'd review the rules with you; any change to them is your decision.

The check reads the text, once. Run it again after any rules change. It can't see a later change on its own: if the rules were ever loosened to "anyone signed in", the Worker would follow them, as the tracker's data access would.

## 4. Staging: prove it live without touching production

This uses the existing `wlu-tracker-test` project, with synthetic data only. `prepare_staging.py` refuses any other project and refuses to leave a production identifier in the pages.

1. Prepare, naming the two Google accounts that will test, with an output folder outside the repository:
   ```
   python3 _deploy/prepare_staging.py --firebase-config ~/Desktop/Lacrosse_Code/test_env/firebase_test_config.js --staff first@example.com,second@example.com --out ~/Desktop/Lacrosse_Code/test_env/staging --chat
   ```
2. In the **test** project's console: enable the Google sign-in provider; publish `staging_rules.rules` (save the current rules first, and restore them afterward); add the Worker's address to Authorized domains after step 3.
3. Deploy from the output folder. The Worker's settings file is there, so production can't be picked up by accident:
   ```
   cd ~/Desktop/Lacrosse_Code/test_env/staging
   npx wrangler login
   npx wrangler deploy --config wrangler.staging.toml
   openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET --config wrangler.staging.toml
   npx wrangler secret put ANTHROPIC_API_KEY --config wrangler.staging.toml
   ```
   The last line asks for the key at its own prompt. Staging chat spends real money, counted in the month's budget. Use `PRIOR_SPEND_JSON` from the comparison.
4. Add synthetic data to the test project (never an export).
5. Run the signed-out checks: `python3 _deploy/staging_check.py https://wlu-tracker-staging.<your-subdomain>.workers.dev`

## 5. Staging checks (all must pass before step 7)

| Check | Expected |
|---|---|
| Private window, no sign-in, open `/`, `/index.html`, `/opponent-scout.html` | Sign-in page only; no team data in View Source |
| A Google account not in the rules | "This account isn't staff"; no page |
| A direct Firestore read with that account's token | 403 |
| Staff account | Tracker opens |
| Remove a signed-in account from the test rules, then: | |
| - database read in that open tab, at once | Refused |
| - sign in again from a new window, at once | Refused |
| - chat, at 1 minute and at 6 minutes | May work at 1; refused at 6 |
| - reload the page at 6 minutes and at 61 minutes | Opens at 6; sign-in page at 61 |
| The kill switch | New chat calls refused; the tracker still works |
| Set `BUDGET_USD` to `1.01`, ask until refused | Budget message; usage line agrees; no further provider calls |
| Worker metrics after a chat | No CPU-limit errors. The free plan allows 10 ms of CPU per request and this is untested on Cloudflare. |

Durable Object behavior and the 10 ms limit can only be proven here: every earlier test ran outside Cloudflare's runtime.

## 6. Production Worker, alongside the current site

Nothing about GitHub Pages changes yet, and `CHAT_DISABLED` stays `1`.

1. Firebase console > Authentication > Settings > Authorized domains: add the Worker's `workers.dev` address. This changes a production setting, but doesn't affect the current site.
2. From `_deploy`: `python3 build_site.py`, then `npx wrangler secret put SESSION_SECRET`, then `npx wrangler deploy`.
3. Repeat the signed-out and non-staff checks from step 5. A real coach signs in and confirms the tracker works, including a normal save.

Removal is not tested on production, because it would mean changing production rules.

## 7. The production switch (needs your approval at a specific commit)

1. Back up first: run Export All Data.
2. **Make the repository private.** On GitHub's free plan this stops GitHub Pages, so the old address goes dark. That also closes the public links to old commits. It doesn't recall copies anyone already made.
3. Tell staff the new address. Update any bookmarks and installed icons.
4. Remove `bobbyg12-123.github.io` from Firebase's Authorized domains after a few days.
5. **Chat, separately, when you approve it:** `python3 build_site.py --chat`, set `PRIOR_SPEND_JSON` from the comparison summary, `npx wrangler secret put ANTHROPIC_API_KEY`, set `CHAT_DISABLED = "0"`, and deploy.

## Rollback

| Problem | Do this | Effect |
|---|---|---|
| Chat misbehaving or spending oddly | The owner's "Turn assistant off" button, or set `CHAT_DISABLED = "1"` and deploy | Paid calls stop; the tracker is unaffected |
| New chat worse than the old | `python3 build_site.py` without `--chat`, and deploy | The old chat page returns (its Gemini path may still be blocked by App Check) |
| A bad Worker version | `npx wrangler rollback` | The previous version serves |
| Before step 7 | Delete the Worker, and remove the authorized domain | No effect on the current site |
| After step 7, the new site is unusable | Make the repository public again and re-enable GitHub Pages from `main` | The old address returns, and so does the public exposure |

Firebase data isn't involved in any rollback: both sites use the same database.

## Budget at a glance

$10 per New York calendar month, including hosting ($0 on the free plan) and testing (`PRIOR_SPEND_JSON`). New calls stop at $9. Each call reserves its worst-case cost before it goes out, then settles at its real usage. A call that never settles stays charged in full. These limits are enforced in the Durable Object, not the browser. Provider billing can differ slightly from the ledger, and the $1 margin is there to absorb that, so compare with the Anthropic console monthly.

Limits per call: 160 KB input, 3,000 output tokens, 90 seconds, no automatic retries, 8 model calls per question, 4 in flight.

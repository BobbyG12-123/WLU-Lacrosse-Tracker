# Gateway for Ask the Tracker

Holds the model key and checks staff sign-in. It stores no chat content and has no database credentials. Not deployed.

## Set up (needs the owner's approval: it starts a paid model account)

1. **Model key.** Create an Anthropic API account, buy a small prepaid credit (that's the hard spending cap), and turn auto-reload off. Create a key.
2. **Worker.** Create a free Cloudflare account. Workers & Pages > Create > Hello World. Paste `worker.js` into the editor and deploy.
3. **Settings** (Worker > Settings > Variables):
   - `ANTHROPIC_API_KEY` as a **secret**
   - `STAFF_EMAILS`: the same accounts as `ALLOWED_COACHES` in `index.html`, comma-separated, lower case. To remove someone, change both.
   - `FIREBASE_PROJECT_ID`: `wlu-lacrosse-tracker`
   - `ALLOWED_ORIGINS`: `https://bobbyg12-123.github.io`
   - Optional: `MODEL` (default `claude-opus-5-5`), `EFFORT`, `MAX_OUTPUT_TOKENS`, `RATE_PER_MINUTE`
4. **Check it refuses.** Opening the Worker's `/v1/config` address in a browser tab should give "This site may not use the assistant."
5. **Turn on.** Set `CHAT_GW_URL` in `index.html` to the Worker's address. That change is a normal release: it needs approval at a specific commit.

## Turn off

Set `CHAT_GW_URL` back to `''`, and the old chat returns. Or delete the key, and chat shows a plain error.

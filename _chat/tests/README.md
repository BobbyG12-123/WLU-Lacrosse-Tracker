# Ask the Tracker tests

This folder starts with `_`, so GitHub Pages doesn't publish it. Never commit an export: this repository is public.

- `./run.sh [base ref]`: offline checks on the synthetic fixture and an in-memory database, in headless Chrome. Runs the real gateway code in the page against a scripted model. It proves the gateway, tools, numbers, masking, evidence, errors and saved chats. It can't prove the model's judgment.
- `ANTHROPIC_API_KEY=... ./run_live.sh`: the evaluation conversations in `../eval/conversations.json` against the real model, still on synthetic data. It costs money, so run it only when the owner approves. Read the transcripts in `results/live_eval.json`; the automatic checks only catch clear failures.
- `view.html`: serve this folder with `serve_chat.py` to see the chat with a scripted answer.

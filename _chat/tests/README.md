# Ask the Tracker tests

This folder starts with `_`, so GitHub Pages doesn't publish it. Never commit an export: this repository is public.

- `./run.sh [base ref]`: offline checks on the synthetic fixture and an in-memory database, in headless Chrome. Runs the real gateway code in the page against a scripted model. It proves the gateway, tools, numbers, masking, evidence, errors and saved chats. It can't prove the model's judgment.
- `./run_compare.sh`: the conversations in `../eval/conversations.json` against real models on synthetic data. It asks for the key without showing it. The local server (`serve_chat.py`, `eval_ledger.py`) reserves each call's worst-case cost on disk before forwarding it and stops at the $2 allowance, across runs. Each run keeps its own folder under `plans/chat_eval_runs/`.
- `python3 test_eval_server.py`: the ledger and server against a fake provider. No money.
- `view.html`: serve this folder with `serve_chat.py --port 8771 --run-id view --results-dir results/view` to see the chat with a scripted answer.

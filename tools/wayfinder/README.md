# Wayfinder tools

Small scripts from the Signal map (#2). The agent uses them. You do not need them to run the app.

| File | What it does |
|---|---|
| `record.mjs` | Records a round of owner decisions on GitHub. |
| `grad.mjs` | Turns fog into new tickets under the map ("graduates" them). |
| `heavy.sh` | A RAM gate. It runs a heavy command only when the machine has room. |

`record.mjs` and `grad.mjs` call the `gh` CLI, so `gh` must be logged in. Both have the repo (`SiddharthMuramkar/finance-agent`) and the map number (`MAP = '2'`) in the code. For a new map, change `MAP` first.

## `record.mjs`: record decisions

```sh
node tools/wayfinder/record.mjs decisions-<round>.json
```

The file is a JSON array. One object per ticket:

```json
[{ "num": 13, "date": "2026-11-14", "decision": "Layered caps", "details": "", "learned": "One line", "gist": "One line for the map" }]
```

For each ticket it:

1. posts a "Resolution (owner, date)" comment with the decision, the details and "What I learned";
2. closes the ticket;
3. adds `- [title](url): gist` to the map's "Decisions so far", just above "Not yet specified".

**Careful:** step 2 closes the ticket by hand (`gh issue close`). The rule since 2026-11-15 is: close issues only through a PR with `Closes #n`. Run this script only when the owner says yes in that turn.

## `grad.mjs`: graduate fog into tickets

```sh
node tools/wayfinder/grad.mjs tickets.txt
```

Each block in the file looks like this:

```text
@@@ D1 | wayfinder:research | #16,D2
Title of the ticket
Body of the ticket, in Markdown.
```

- `D1` is a draft key. Other blocks in the same file can use it.
- The label is one `wayfinder:*` label.
- The last part (optional) lists blockers: a draft key (`D2`) or an issue number (`#16`).

The script makes each ticket a sub-issue of the map. Then it adds GitHub's native "blocked by" links. It writes `tickets.result.json` with the new numbers.

## `heavy.sh`: RAM gate

```sh
tools/wayfinder/heavy.sh npx vitest run --maxWorkers=2 src/tutor/quota.test.ts
```

It waits until a slot is free and enough RAM is free. Then it runs the command. Use it for every heavy command: `npm ci`, `tsc`, `eslint`, `vitest`, `next build`, Playwright and the `library:*` scripts.

| Setting | Default | Meaning |
|---|---|---|
| `HEAVY_SLOTS` | 2 | How many heavy jobs can run at the same time. |
| `HEAVY_MIN_FREE_PCT` | 40 | A job starts only when at least this % of RAM is free. |
| `HEAVY_LOCKS` | `$TMPDIR/heavy-locks` | Folder for the slot locks. |

- Each job gets a Node heap of at most 4 GB (`--max-old-space-size=4096`).
- A slot whose owner died is freed on the next try.
- It works on Linux and macOS.
- On the VPS (8 CPU, 31 GB), `/root/projects/gate.sh` wraps it with `HEAVY_SLOTS=8 HEAVY_MIN_FREE_PCT=20`.

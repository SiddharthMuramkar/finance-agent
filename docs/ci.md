# CI

How GitHub Actions tests each PR and each push to `main`. The workflows are in `.github/workflows/`.

## What runs

`ci.yml` runs on every PR and on every push to `main`.

```
changes ─┬─ static ──────────┬─ check
         ├─ vitest 1..4/4 ───┘
         ├─ next-build ─────── build
         └─ ui shard 1..6/6 ── ui
```

| Job | What it does | Time (approx.) |
|---|---|---|
| `changes` | Decides: does the PR change code, or only docs? (`scripts/ci-changes.mjs`) | 10 s |
| `static` | `tsc`, ESLint, `course:check`, the theme contrast check | 2 min |
| `vitest i/4` | The Vitest suite in 4 shards, 3 workers each | 4-5 min |
| `next-build` | `next build`, then `check-no-e2e-in-build` (the test bed must not reach the build). `.next/cache` is cached. | 1.5 min |
| `ui shard i/6` | The browser test bed (Playwright, Chromium, PGlite, scripted Tutor) in 6 shards | 5-9 min |
| `check`, `build`, `ui` | The required checks. Each one sums up the jobs before it. | 5 s |

The slowest `ui` shard sets the time of the whole run: about 9 to 10 minutes. Before this layout, one `check` job ran
everything in sequence and took 17 to 22 minutes.

`npm run check` still runs the same checks on your machine, in one command. `src/dev/ci-workflow.test.ts` fails when a
part of `npm run check` is not in a CI job.

## Required checks

The ruleset on `main` (id 27251702) needs three checks to pass before a merge: **`check`**, **`build`** and **`ui`**.
The Vercel Deployment Checks that gate the production alias wait for the same three names.

- `check` needs `static` and all `vitest` shards.
- `build` needs `next-build`.
- `ui` needs all `ui shard` jobs.

Each of the three runs with `if: always()`. It fails when a job it needs failed or was cancelled. It passes when every
job it needs passed, or when they were skipped on a docs-only PR. A job skipped for any other reason fails it.

**Do not rename** `check`, `build` or `ui`. A new name blocks every merge until the ruleset and the Vercel checks
change too. `src/dev/ci-workflow.test.ts` checks the names, what each one needs, and the shared gate script.

## Docs-only PRs

When a PR changes only docs, the heavy jobs are skipped and `check`, `build` and `ui` pass in seconds.

Docs-only means that every changed file is one of these:

- a Markdown file at the top level (`README.md`, `CLAUDE.md`, `GLOSSARY.md`, ...)
- a Markdown file or an image under `docs/`, **except** `docs/course-map.md` and `docs/critics/` (a check or a test
  reads them). Any other file there (`.ts`, `.json`, `.yaml`, ...) is code: `tsconfig.json` includes `**/*.ts`.
- `LICENSE`, `.github/ISSUE_TEMPLATE/`, a PR template

Everything else is code, for example: anything under `.github/workflows/`, `.github/dependabot.yml`, Markdown inside
`src/` or `course/`. A moved file counts at its old path and at its new path.

- A push to `main` always runs every job.
- A PR that changes `scripts/ci-changes.mjs` always runs every job. The PR's own copy of the script decides, so a
  broken copy must not skip the tests that would catch it. `src/dev/ci-workflow.test.ts` runs the real step.
- When code starts to read a file under `docs/`, add that path to `DOCS_READ_BY_CODE` in `scripts/ci-changes.mjs`.
  `src/dev/ci-changes.test.ts` finds `docs/` paths in the code and fails until you do.

## Flaky tests and re-runs

On CI, Playwright retries a failed test once (`retries` in `playwright.config.ts`; locally it is 0).

- A test that passes on its retry is **flaky**. The shard stays green, and the run shows a warning
  "Flaky UI test" for each one. The shard's job summary lists them too.
- Each shard uploads its HTML report and traces as the artifact `playwright-report-shard-<n>` (kept 14 days).
  Download it from the run page, unzip it, and run `npx playwright show-report <folder>`.

To re-run only what failed: on the run page, click **Re-run jobs → Re-run failed jobs**, or run
`gh run rerun <run-id> --failed`. GitHub re-runs the failed shards and the required check after them.
Do not re-run a test that fails on every try: fix it.

## Playwright shard weights

Playwright splits the tests by count, not by time. `PWTEST_SHARD_WEIGHTS` in `ci.yml` gives each shard its share of
the tests. The times of the tests are very different between projects, so equal shares give unequal shards.

To tune the weights again (for example, when the slowest shard is minutes slower than the fastest):

```sh
node scripts/ui-shard-weights.mjs <run-id> <run-id> <run-id>
```

Give 2 to 4 recent CI run ids (the number in the run's URL). The script reads each test's time from the shard logs,
lists the current tests, and prints the best weights and the time each shard will take. Put the weights in `ci.yml`.
Wrong weights only make the shards unequal. Every test still runs in exactly one shard.

The weights of 2026-11-15 suit the projects of that day and also the list without the `mbp14-dark` project (the Signal
site work removes it). Tune them again after that change lands.

## Node version

- `.nvmrc` holds the Node major version (24). Every `actions/setup-node` step reads it.
- `package.json` `engines.node` is `24.x`. Vercel uses this value for builds and functions, in place of the project
  setting.
- To change the version, change both files. `src/dev/ci-workflow.test.ts` checks that they agree.

## Caches

- npm's download cache (`actions/setup-node` with `cache: npm`). Each job still runs `npm ci` (about 20 s).
- `.next/cache` in `next-build`, keyed on the lockfile, `.nvmrc` and the sources. Turbopack keeps its build cache
  there.
- No Playwright browser cache: a download is as fast as a restore.

## Tutor eval

`tutor-eval.yml` runs the live Tutor tests on the real model for PRs that change what the Tutor is told. It is not a
required check, and it costs money (up to `TUTOR_EVAL_BUDGET_USD`, default $5 a run).

It needs the repository secret `OPENAI_API_KEY`. Without it (or on a PR from a fork), the job `tutor-eval` is
**skipped** (grey), and the job `tutor-eval key` shows the notice "skipped: no OPENAI_API_KEY". Nothing was tested, so
this is not a pass.

## Dependabot

`.github/dependabot.yml`:

- **npm**, weekly: one PR with all minor and patch updates. Major updates are never opened. A new release waits 7 days
  before Dependabot offers it (`cooldown`); security updates do not wait.
- **GitHub Actions**, weekly: one PR with all updates. Third-party actions are pinned to a commit SHA, and Dependabot
  updates the SHA. A new release waits 7 days here too (`cooldown`): the auto-merge run uses the PR's new
  `dependabot/fetch-metadata` with a write token.
- Branch names use `-`, not `/`, so Vercel makes no preview deploy for them (`vercel.json`).

`.github/workflows/dependabot-auto-merge.yml` turns on auto-merge (squash) for a Dependabot PR when its update type is
minor or patch. GitHub merges the PR only when `check`, `build` and `ui` pass. A red check leaves the PR open for a
person. A PR with a major update (possible for GitHub Actions) also waits for a person.

**Known limit.** The workflow turns on auto-merge with its own `GITHUB_TOKEN`. GitHub starts no workflow for a push
that this token makes. So after a Dependabot merge, CI does not run on `main`, and the Vercel Deployment Checks for
that commit stay pending: production gets the update with the next merge that CI runs on. To change this, the owner
can give the workflow a GitHub App token in place of `GITHUB_TOKEN` (a Dependabot secret).

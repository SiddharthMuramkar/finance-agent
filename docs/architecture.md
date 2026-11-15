# Value It architecture

Facts as of 2026-11-15. This page describes the system as it will be after the pull requests of the 2026-11-15 batch merge. It starts with the map, then zooms in, one layer at a time. File paths are signposts. The page shows no code.

**Marks.** Text with no mark is on a pushed branch now. **(landing in this batch)** marks planned work that is not on a pushed branch yet. Section 2 lists the branches. ADR means an architecture decision record in [`docs/adr/`](adr/README.md).

## 1. The picture

Value It teaches money, markets and valuation through real past events. A visitor reads the public Signal site, which has five live Widgets. To come in, the visitor joins a Waitlist. The owner approves each person in Clerk, and Clerk signs them in with an email link. The person is then a Learner, and studies in the Study Workspace: chat with a Tutor on the left, Widgets on the right.

The Tutor is an OpenAI model, gpt-6.1-sol, on the Responses API. The server runs on Vercel, in region `sin1`. Each Learner action starts one Tutor turn on the server. During the turn, the model calls tools. The tools search a private Library of real sources, show Widgets, calculate, and record progress. Code checks replies before the Learner sees them. Daily Spend caps limit what each Learner and each day can cost. One Neon Postgres database keeps all state. The course is YAML files in the repo. A merge to `main` is the only way to deploy.

## 2. What this batch changes

| Area | Branch (PR or issue) | What it brings | State |
|---|---|---|---|
| Hardening | `feat-hardening` (#36) | Spend caps, Step ledger, turn admission, a Neon snapshot before each migration, the health check, previews off | Pushed |
| Clerk prep | `feat-33-clerk-prep` (#35) | `learners.clerk_user_id`, HSTS and Permissions-Policy headers, BotID on `POST /api/turn` | Pushed |
| Clerk cutover | `feat-33-clerk-cutover` (PR B) | Clerk sign-in, the owner found by Clerk role, passcode door for local and test use only | Core pushed. Pages `/sign-in`, `/sign-up`, `/join`, the `/admin` changes and the Better Auth removal: (landing in this batch) |
| Clerk contract | PR C | Wipe of the pre-Clerk Learners after a snapshot, drop of the Better Auth tables | (landing in this batch) |
| Docs | `docs-4-fresh-adrs` (#34) | ADRs 0001 to 0018 and `GLOSSARY.md` | Pushed |
| Site | `feat-7-signal-site` (#32) | The public Signal site, the five Signal widgets, one Light theme | Pushed |
| Library sources | `feat-library-sources` (#38) | Six new Library sources | (landing in this batch) |
| Backup | `chore-8-backup` (#8) | Daily snapshots, a protected `main`, an off-Neon Library dump, a restore drill | (landing in this batch) |
| CI | `ci-pipeline` | Faster CI, Node 24, Dependabot, a stricter ruleset | (landing in this batch) |
| Legacy | `chore-19-legacy` (#19) | Deletes the dead lanes: `compose_widget`, the engine-off lane, `src/comparison` | (landing in this batch) |

What only the owner can do (firewall enforce, Better Stack account, Google client for Clerk, and more) goes in `docs/owner-actions.md` (landing in this batch).

## 3. The map

```mermaid
flowchart TD
  P["Person in a browser"] --> FW["Vercel Firewall<br/>bot check and rate limits"]
  FW --> PX["Proxy: src/proxy.ts<br/>checks the Clerk session"]
  PX --> SITE["Public Signal site<br/>Home, How it works, Examples, About"]
  PX --> AUTH["Clerk pages<br/>/sign-in, /sign-up, /join"]
  PX --> STUDY["Study Workspace<br/>/study: chat and Widget panel"]
  PX --> ADMIN["/admin<br/>owner only"]
  AUTH <--> CLERK["Clerk<br/>accounts, Waitlist, emails"]
  STUDY -->|"POST /api/turn"| TURN["Tutor turn<br/>src/tutor/turn.ts"]
  TURN <--> OAI["OpenAI Responses API<br/>gpt-6.1-sol"]
  TURN --> TOOLS["Tools<br/>src/tutor/tools.ts"]
  TOOLS --> WID["Widgets<br/>src/widgets/"]
  TOOLS --> LIB["Library search<br/>src/library/"]
  TOOLS --> FIN["Finance code<br/>src/finance/"]
  SITE --> SIG["Signal widgets<br/>src/components/signal/"]
  SIG --> FIN
  TURN --> DB[("Neon Postgres<br/>src/db/schema.ts")]
  LIB --> DB
  ADMIN --> DB
  CRON["Vercel cron and Schedules"] --> HEALTH["/api/cron/health<br/>every 15 minutes"]
  CRON --> REFRESH["/api/cron/library-refresh<br/>each Monday"]
  HEALTH --> BS["Better Stack heartbeat"]
  REFRESH --> DB
  HEALTH --> DB
```

The course (`course/`) is data that the Tutor turn reads. The deploy path is in section 10.

## 4. The request flow of one Tutor turn

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant F as Vercel Firewall
  participant P as Proxy
  participant R as Turn route
  participant T as Tutor turn
  participant O as OpenAI
  participant D as Neon Postgres
  B->>F: POST /api/turn with a BotID answer
  F->>P: let through, or 429 over the rate limit
  P->>P: Clerk session valid? If not, 401
  P->>R: request
  R->>R: body check (400) and BotID check (403)
  R->>T: start the turn
  T->>D: turn admission: Topic current? Spend caps? Take the lock
  alt refused
    T-->>B: 409 or 429 with a plain sentence
  else admitted
    loop each step, while the Step ledger has steps left
      T->>O: streamed request
      O-->>T: text or tool calls
      T->>D: tools read and write
    end
    T->>T: reply checks, one retry in the first 30 s
    T->>D: save messages, tool calls and usage
    T-->>B: stream of events, one JSON line each, then done
  end
```

Section 6 explains each step.

## 5. The layers

### 5.1 Public site (Signal)

A signed-out visitor can read these pages: Home (`/`), How it works (`/how-it-works`), Examples (`/examples`), the five Example pages (`/examples/<slug>`) and About (`/about`). The files are in `src/app/(site)/`. One data file, `src/site/examples.ts`, lists the five Examples. The proxy, the pages and Home all read it, so they always agree.

Each Example shows one Signal widget: Jackpot, Four levers, Compounding, Rates or WeWork.

- Each Signal widget is one fixed React component (`src/components/signal/`). See [ADR 0011](adr/0011-signal-widgets-are-fixed-components.md).
- Its numbers come from tested models in `src/finance/signal/`. Four levers runs on the one valuation engine, `src/finance/dcf-engine.ts` ([ADR 0010](adr/0010-one-valuation-engine.md)).
- No Tutor runs on the public pages. The "Call" in a widget starts a Tutor turn only in the Study Workspace ([ADR 0012](adr/0012-only-the-call-starts-a-turn.md)).

The whole app has one Light theme, in the Signal colour language: five colours and one pattern, and each has one meaning ([ADR 0015](adr/0015-one-light-theme-colour-language.md)). The tokens are in `src/app/globals.css`. Controls are flat, sections use hairlines, and pictures are line icons ([ADR 0018](adr/0018-flat-controls-hairlines-line-icons.md)). The spec is [`docs/specs/value-it-signal-spec.md`](specs/value-it-signal-spec.md).

The site's join button opens `/join`, which is Clerk's Waitlist (section 5.4).

### 5.2 Study Workspace (browser)

The main page is `/study`: chat on the left, Widgets on the right. Other signed-in pages are the Course Map (`/course`), the Notebook (`/notebook`), Settings (`/settings`), Profile (`/profile`) and each Library passage (`/passages/<id>`).

1. The Learner types a message or taps a Choice.
2. The page sends `POST /api/turn` with the message, the shown Session or Topic, and the open Widget values.
3. The page reads the reply as a stream of events, one JSON line per event.
4. The chat shows the text. The Widget panel draws each Widget.

Files: `src/app/study/page.tsx`, `src/app/conversation.tsx`, `src/app/thread.tsx`, `src/app/turn-stream.ts`, `src/app/widget-panel.tsx`, `src/app/widget-view.tsx`.

### 5.3 Front door: firewall, headers and proxy

Each request passes three layers before app code runs.

1. **Vercel Firewall**, at Vercel's edge. It only logs now (published 2026-11-15). On or after 2026-11-17, the owner reads the logs and switches it to enforce:
   - Bots get a challenge. AI crawlers are only logged.
   - More than 20 `POST /api/turn` in 60 seconds from one IP address get 429.
   - More than 120 other `POST /api/*` in 60 seconds from one IP address get 429.
   - The cron paths skip the rules.
   - Attack Challenge Mode is off. It is the emergency switch.

   The rule bodies go in `docs/agents/platform.md` (landing in this batch).
2. **Headers** (`next.config.ts`). Every page gets HSTS for two years with subdomains, a Permissions-Policy that turns off browser features the app never uses, a ban on framing, and `nosniff`.
3. **Proxy** (`src/proxy.ts`). It checks the sign-in (section 5.4).

### 5.4 Sign-in (Clerk)

Clerk hosts the sign-in, the sign-up, the Waitlist and the emails ([ADR 0017](adr/0017-clerk-replaces-better-auth.md)). Better Auth and its Google and email-link code are deleted (landing in this batch).

**Join and approval**

1. A visitor opens `/join` and leaves an email on Clerk's Waitlist.
2. The owner approves the person in the Clerk dashboard. Clerk sends the "You're in" email.
3. The invite link opens `/sign-up`. The person signs in with an email link. Google sign-in comes later.
4. On the first request, `src/auth/clerk-learner.ts` makes a Learner for that Clerk user and stores the id in `learners.clerk_user_id`. Every account has a Learner, so `/sign-in` and `/study` can never send a person back and forth.

`/login` answers 308 and sends the browser to `/sign-in` (landing in this batch).

**Each request**

1. `src/proxy.ts` runs Clerk's middleware, which checks the Clerk session.
2. A signed-out visitor gets only the public pages, `/sign-in`, `/sign-up` and `/join`. Other pages send the visitor to `/sign-in`. An API call gets 401.
3. Before a page or route reads data, it reads the person again on the server (`src/auth/session.ts`). The identity comes from the session token alone, with no call to Clerk: user id, email, first name, and whether the person is the owner (`src/auth/identity.ts`).

**The owner.** The owner is the person whose Clerk `publicMetadata.role` is `"admin"`. Only the owner sets it, in Clerk. `src/auth/owner.ts` reads that claim from the session token. `/admin` shows Spend, Tutor speed and the Spend caps, with links to Clerk's Waitlist and Users. Everyone else gets 404.

**Passcode door: local and test only.** `src/auth/gates.ts` holds two switches:

- `clerkOn`: true when both Clerk keys are set and the browser test bed is off. While it is false, nothing calls Clerk.
- `passcodeDoorOpen`: true only outside production and off Vercel. So every deploy refuses every passcode.

The browser tests and the simulated Learner sign in with a passcode or a test-bed cookie, on a local server. So CI needs no Clerk keys and no network.

**Bot checks.** Clerk guards the sign-up with its own bot protection and lockout. BotID guards the start of each Tutor turn, because each turn costs a model call. `src/instrumentation-client.ts` adds the challenge in the browser, and `POST /api/turn` checks it. A bot gets 403. The list of protected requests is in `src/auth/bot-protection.ts`.

**Fresh start.** After Clerk is live, PR C takes a Neon snapshot, deletes the old Learners that have no Clerk id, with their history, and drops the Better Auth tables and `learners.auth_user_id` (landing in this batch).

### 5.5 Routes

Each API route does one job. Files: `src/app/api/*/route.ts`. The main ones:

- `turn`: one Tutor turn (section 6).
- `widget-state`: saves slider values.
- `case-data/[caseId]`: Case Data under the as-of rule.
- `cron/health` and `cron/library-refresh`: called by Vercel, not by people (section 12).
- `login` and `logout`: the passcode door (local and test only) and sign-out.

### 5.6 Database

One Neon Postgres database keeps all state: Learners, Sessions, messages, turns, tool calls, usage, Widget state, Library passages and settings. The app uses the drizzle ORM. The app uses a pooled connection. Migrations use a direct connection.

1. A developer changes `src/db/schema.ts`.
2. `npm run db:generate` writes a new SQL file in `drizzle/`.
3. On a production deploy, `scripts/migrate-on-build.mjs` takes a Neon snapshot, then applies the new files (section 10).

Every migration is expand-then-contract: first add, deploy, and only later remove. The rules are in [`docs/agents/migrations.md`](agents/migrations.md). Files: `src/db/client.ts`, `src/db/one-write.ts`, `src/db/schema.ts`, `drizzle.config.ts`.

### 5.7 Course content

The course is data, not code. `course/outline.yaml` puts the Topics in order. Each file in `course/topics/` holds one Topic: its steps, Cases and written-ahead Widgets ([ADR 0001](adr/0001-topic-file-holds-the-teaching.md)).

1. `src/course/map.ts` loads the YAML once and keeps it in memory.
2. `src/course/navigator.ts` finds the Learner's place in the course.
3. The Tutor turn sends that place to the model as a context note.
4. `npm run check` validates the YAML and the generated `docs/course-map.md`.

## 6. How a Tutor turn works

1. The browser sends `POST /api/turn`. The body names one kind of turn, for example a message, a Choice, Next, a Widget report, resume or stop.
2. The route checks the body with zod (`src/tutor/turn-body.ts`). A bad body gets 400. Then BotID checks the request. A bot gets 403.
3. **Turn admission** (`src/tutor/turn-admission.ts`) asks every "may this turn run?" question, in this order:
   - Does the tab still show the Learner's current Topic? If not, 409.
   - Is a daily Spend cap reached? Then 429, with a plain sentence. Only a new turn is checked, not a resume (section 7).
   - Is another turn running? The lock allows one turn per Learner. A second send gets 409. A resume past the resume limit gets 429.
   - For Next or a follow-up: is there something to do? If not, 409, and the lock is free again.

   A refusal saves nothing and calls no model.
4. `src/tutor/session-log.ts` finds the Session for the current Topic, or starts one. A new Session freezes the model, effort, instructions and tools ([ADR 0005](adr/0005-one-session-per-topic.md)). After a deploy changes the instructions or tools, the next turn refreezes them in the same Session. The effort stays.
5. `src/tutor/context.ts` and `src/tutor/widget-context.ts` add notes: course place, progress, and open Widget values.
6. The tool loop (`src/tutor/runner.ts`) sends a streamed request to OpenAI (`src/tutor/openai.ts`). Before each step, it asks the **Step ledger** (`src/tutor/step-ledger.ts`) how many steps are left. The last allowed step asks the model for text only, with no tool calls, so the turn always ends with a reply.
7. The model can call a tool. `src/tutor/tools.ts` runs it, and the loop sends the result back. This repeats until the model stops.
8. The reply checks run ([ADR 0006](adr/0006-replies-checked-before-they-show.md)):
   - A step-led reply (after Next, a Choice or a Quick try) is held until code checks it all (`src/tutor/reply-gate.ts`, `src/tutor/reply-checks.ts`). Code fixes small problems.
   - A reply to the Learner's own question streams at once, one sentence at a time, behind a stream guard (`src/tutor/stream-guard.ts`).
9. A broken held draft gets one retry, but only in the first 30 seconds of the turn. After that, the Learner gets a fallback that tells the truth.
10. `src/tutor/cite-markers.ts` turns citation markers into stored citations.
11. The turn saves messages, tool calls, Session items and usage. It sends a final `done` event.

Limits and recovery:

- The turn stops itself at 270 seconds (`TIME_BUDGET_MS`). Vercel allows 300. The browser then resumes the turn in a new request. A turn can resume at most 2 times.
- A Stop sets a flag. The running turn reads the flag every half second.
- A long Session is compacted at 200,000 input tokens.
- A failed turn shows the Learner a plain sentence with a reference. The `turns` table keeps the status (`src/tutor/failures.ts`).

The app keeps messages in its own transcript format (`src/tutor/model.ts`). `src/tutor/openai-items.ts` translates that format to OpenAI items and back. Each request asks OpenAI not to store the response (`store: false`). The app replays encrypted reasoning from its own records ([ADR 0007](adr/0007-one-model-behind-our-own-transcript.md)).

## 7. Spend caps

Each layer of a turn has a limit, so each layer has a known worst case (decision #13). The numbers are rows in the `settings` table. The owner edits them on `/admin`.

| Cap | Default | Checked |
|---|---|---|
| Turns per Learner per day | 120 | Turn admission, new turns only |
| Dollars per Learner per day | $5 | Turn admission, new turns only |
| Dollars for everyone per day | $30 | Turn admission, new turns only |
| Model steps per turn, all runs together | 10 | Step ledger, before each step |
| Resumes per turn | 2 | Turn admission, on resume |

- A day starts at midnight, India time.
- The dollars are estimates from the `usage` rows of each step. A step with no price counts as $0.66, the worst case. So a model change cannot hide spend.
- The evals, the Library refresh and Voyage are not counted. Only the OpenAI project's hard spend limit catches those.
- The evals run with `noLimits`, so no cap stops them.

Files: `src/tutor/quota.ts`, `src/tutor/step-ledger.ts`, `src/tutor/turn-admission.ts`.

## 8. How generative UI works

The Tutor never writes Widget code. It picks a recipe and supplies the numbers. Tested code does the rest ([ADR 0009](adr/0009-tutor-chooses-code-draws.md)).

1. The Tutor calls `show_widget` with a recipe id and params: `title`, `inputs`, `refs` and `facts`.
2. `src/tutor/tools.ts` finds the recipe and parses the params with zod. The recipe's compile step then writes an OpenUI Lang program (`src/widgets/recipes/define.ts`).
3. The server runs more checks. Only one Widget per reply is allowed. Each ref must pass the as-of rule. `src/widgets/check.ts` checks the program against the frozen schema (`src/widgets/frozen-schema.generated.json`).
4. A failed check returns "Not shown" and the reason. The Tutor tries again or teaches in words.
5. The turn stores the program as a Session item (`src/widgets/shown-widget.ts`). The chat shows only a chip.
6. The browser draws the program with the OpenUI Renderer and the app's own parts (`src/app/widget-view.tsx`, `src/widgets/library.tsx`).
7. A slider move runs tested finance code in the browser (`src/widgets/tools.ts`, `src/finance/`). The model does not run.
8. `POST /api/widget-state` saves the slider values. The Tutor gets them with the next message.

Every number has a known origin:

- `inputs`: slider ranges and calculator inputs. Tested code works out the results.
- `refs`: Case Data, checked against the as-of rule (`src/case-data/case-data.ts`).
- `facts`: free numbers. Any fact labels the Widget "Illustration".

Other Widget tools: `open_widget` opens a written-ahead Widget from the Topic YAML. `update_widget` moves the sliders of an open Widget. Workbench Widgets (`src/widgets/workbench/`) get their figures on the server, from `src/finance/valuation-cases.generated.ts` or the Topic YAML.

Two older lanes, the free-form `compose_widget` tool and the engine-off lane, are deleted by #19 (landing in this batch). Later, the Study Workspace opens the five Signal widgets through a thin recipe part (ADR 0011). That part is not built yet.

## 9. How the Library (RAG) works

**Sources.** `scripts/library/sources.json` lists each source with its licence and credit line. The repo holds the loaders, not the source text. This batch adds six sources (landing in this batch, #38):

- OpenStax Principles of Finance, 1st edition (CC BY 4.0)
- FOMC statements, minutes and policy records, 1979 to 2001
- SEC filings: Amazon 1997 to 1999, Webvan 1999 to 2001, and the We Company S-1 of 2019
- Investor.gov explainers, glossary and bulletins

**Ingest** runs by hand, not on deploy:

1. The fetchers in `scripts/library/` get the text.
2. `src/library/prepare.ts` cuts each document into passages of 300 words or fewer.
3. `scripts/library-load.mjs` and `src/library/ingest.ts` write sources and passages to Postgres. A blocklist drops unwanted sources.
4. `scripts/library-embed.mjs` stores a Voyage embedding (voyage-4) for each passage in a pgvector column.
5. `scripts/library/drop-source.mjs` removes one source in one transaction. It is a dry run unless told otherwise.

Pictures and spreadsheets have their own loaders (`scripts/library-pictures.mjs`, `scripts/library-sheets.mjs`). Each week, the cron route (`src/app/api/cron/library-refresh/route.ts`) runs `src/library/refresh.ts`. It adds new or edited posts from Damodaran's blog.

**New sources are tested on a copy first.** They load into a Neon branch copy, never into `main`. There they are embedded and scored. The bars are hits@5 of 92% or more, MRR of 0.82 or more, and the outcome-word probes. Only then does the production load run, after a snapshot. The orchestrator runs this eval later in the batch.

**Search** runs on each `search_library` call:

1. `src/library/library.ts` finds the as-of date from the Cases of the Learner's current Topic. After the reveal, no date applies.
2. `src/library/voyage.ts` embeds the query. Without `VOYAGE_API_KEY`, search uses keywords only.
3. `src/library/search.ts` runs two rankings of 30 candidates each: BM25 keyword match and vector distance. Without the BM25 index, the keyword half uses Postgres full-text rank.
4. Reciprocal rank fusion (k = 60) merges the two lists. The top 5 passages go back.
5. The Tutor sees each passage with a credit line and numbered sentences.

**As-of rule** ([ADR 0013](adr/0013-as-of-rule-hides-hindsight.md)). A Case can stop before its outcome. Until the reveal, the Library hides hindsight. A passage passes if it was published on or before the as-of date. A passage from a timeless source also passes if every year its text mentions is before the as-of year. Only the text counts, never the heading. Both rankings apply the rule. Outcome-word probes check that no passage that passes tells the ending.

**Citations.** The model writes a marker after a claim, such as `⟦id:from-to⟧`. Code removes the marker and stores a citation (`src/tutor/citations.ts`). Each citation links to the passage page (`src/app/passages/[id]/page.tsx`).

**Eval.** `scripts/library-score.mjs` scores search on `scripts/library/eval/questions.json`.

## 10. Deploy and CI

Only `main` deploys to production ([ADR 0016](adr/0016-only-main-deploys.md)).

1. Work happens on a branch. Branch names use dashes, not `/`. A pull request goes to `main`.
2. GitHub Actions runs the checks. Three are required: `check`, `build` and `ui` (`.github/workflows/ci.yml`).
   - `check`: types, lint, the course check, the unit tests and the theme contrast check.
   - `build`: `npm run build` with no secrets, then a check that no test code is in the build.
   - `ui`: the Playwright browser tests, in 6 shards.
3. Each pull request gets one adversarial review comment. Then it merges by squash, on green checks.
4. A merge to `main` starts a Vercel production build. `npm run vercel-build` runs `scripts/migrate-on-build.mjs`, then `next build`.
5. **Snapshot gate.** If migrations are pending, the build first takes a Neon snapshot of the branch (kept 30 days). No snapshot means no migration and a failed build. `NEON_SNAPSHOT=off` is the only way past it, and the build log then shows a warning.
6. Vercel deploys the functions to region `sin1` (`vercel.json`).
7. **Deployment Checks.** Vercel holds the production address on the old deploy until `check`, `build` and `ui` pass on the new commit. A red `ui` on `main` holds every production deploy.

Today the migration runs before `next build`. ADR 0016 wants it after the build. That step is not built yet.

Guards:

- **Previews are off.** `vercel.json` sets `"main": true, "**": false`, so no other branch builds.
- **No one deploys by hand.** `.claude/settings.json` denies the risky commands to agents: production deploys, promote, rollback, and running migrations against production.

**CI after this batch** (landing in this batch, `ci-pipeline`):

- Node 24 everywhere, pinned in `.nvmrc` and `engines`, so CI and Vercel agree.
- `check` splits into parallel jobs: static checks, and the unit tests in 4 shards. One summary job keeps the name `check`.
- Playwright retries a failed test once in CI and reports it as flaky.
- A docs-only pull request skips the heavy jobs, but `check`, `build` and `ui` still report success, so its merge never waits.
- Dependabot opens weekly update pull requests. Patch and minor updates merge on green CI.
- The GitHub ruleset requires a pull request, an up-to-date branch, squash merges, and the three checks.

## 11. Backups and restore

Recovery has layers. #8 chose option B.

| Layer | What it covers | State |
|---|---|---|
| Neon point-in-time restore, 7 days | A bad write or delete in the last 7 days | On |
| A snapshot before each production migration | A bad migration | Pushed (#36) |
| A daily snapshot schedule on Neon `main` | A bad change found later | (landing in this batch) |
| Neon `main` set as protected | Deleting `main` by mistake | (landing in this batch) |
| An off-Neon dump of the `library_*` tables, with a restore drill | A lost Neon project | (landing in this batch) |

- `scripts/backup-drill.sh` dumps the Library tables to the VPS. It then restores them into a throwaway Neon branch and compares counts and hashes (landing in this batch).
- The owner keeps a second copy on their laptop.
- `docs/backup-and-restore.md` records the schedule, where the dumps are, and the last drill (landing in this batch).
- Re-dump after each Library load. Never put a dump in git: some source text is for private search only.
- Learner data stays in Neon only. A full off-Neon dump of Learner data was too much for about 20 beta Learners.

## 12. Monitoring

- **Health check.** Every 15 minutes, Vercel Schedules call `/api/cron/health` (`vercel.json` `schedules`). It reads failed turns, Tutor incidents, killed turns and the last Library refresh (`src/alerts/health.ts`). It reports to a Better Stack heartbeat:
  - all well: a plain beat;
  - a problem: a `/fail` call with a short list of counts and references, never Learner text;
  - the database does not answer: nothing, so Better Stack alerts on the missed beat.

  Until the owner sets `BETTERSTACK_HEARTBEAT_URL`, the check runs but nobody gets an alert.
- **Library refresh.** Each Monday at 21:30 UTC, a Vercel cron calls `/api/cron/library-refresh`.
- Both cron routes skip the proxy. Each checks `CRON_SECRET` itself (`src/auth/cron.ts`).

## 13. Configuration

Settings live in three places:

1. **Environment variables**: secrets and connection strings. Production values live in Vercel project settings. Local values live in `.env`, which git ignores. `.env.example` lists most of the names.
2. **The `settings` table**: values you can change without a deploy.
3. **Constants in code**: values that change only with a deploy.

**The rule:** secrets live in Vercel env. Never put a secret in the repo. Never give a secret a `NEXT_PUBLIC_` prefix: that sends it to the browser. An env change reaches only new deploys.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | All model calls |
| `DATABASE_URL` | Pooled database connection for the app |
| `DATABASE_URL_UNPOOLED` | Direct connection for migrations |
| `NEON_API_KEY`, `NEON_PROJECT_ID` | The snapshot before migrations. Production only |
| `NEON_SNAPSHOT` | Set to `off` only to migrate with no snapshot. Remove it after that deploy |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk. The publishable key is public by design. The secret key is a secret. Live keys go to Production only, test keys to Development |
| `CRON_SECRET` | Lets only Vercel call the cron routes |
| `BETTERSTACK_HEARTBEAT_URL` | Where the health check reports. Optional |
| `VOYAGE_API_KEY` | Vector half of Library search |
| `PASSCODES`, `SESSION_SECRET` | The passcode door and the test-bed cookie. Local and test only. They leave Production after Clerk is live (landing in this batch) |
| `E2E` | Turns on the browser test bed. Never in production |
| `TURN_TIME_BUDGET_MS` | Optional, for local cut-off tests |

Gone after this batch: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` and `PASSCODE`.

The `settings` table holds `effort` (default `medium`), `widget_engine`, `session_idle_hours`, `compact_at_tokens`, `review_cap` and the five Spend caps (section 7). The defaults are in `src/tutor/session-log.ts`. A Session keeps its `effort` from when it starts, so an `effort` edit reaches only new Sessions. The other rows take effect on the next turn or request. The old `signup_open` row goes with the wipe in PR C (landing in this batch).

Constants: `TUTOR_MODEL` and `DEFAULT_EFFORT` (`src/tutor/model.ts`), `TIME_BUDGET_MS` (`src/tutor/turn.ts`), `maxDuration` (`src/app/api/turn/route.ts`), `POOL` and `RRF_K` (`src/library/search.ts`), the 300-word cut (`src/library/prepare.ts`), region, crons and Schedules (`vercel.json`). A change to `TUTOR_MODEL` closes each Learner's live Session on their next turn.

## 14. Where to look in the code

| Question | Look here |
|---|---|
| Which pages are public? Who gets through? | `src/proxy.ts` |
| Which Examples does the site show? | `src/site/examples.ts`, `src/app/(site)/` |
| Where are the Signal widgets? | `src/components/signal/`, `src/finance/signal/` |
| Where are the colours and theme? | `src/app/globals.css` |
| How does sign-in work? | `src/auth/session.ts`, `src/auth/identity.ts`, `src/auth/gates.ts` |
| How does an account get its Learner? | `src/auth/clerk-learner.ts` |
| Who is the owner? | `src/auth/owner.ts` |
| Where are the security headers and BotID? | `next.config.ts`, `src/auth/bot-protection.ts`, `src/instrumentation-client.ts` |
| May this turn run? | `src/tutor/turn-admission.ts`, `src/tutor/quota.ts` |
| How many steps may a turn take? | `src/tutor/step-ledger.ts` |
| What does the Tutor read as instructions and tools? | `src/tutor/instructions.ts` |
| What does each tool do? | `src/tutor/tools.ts` |
| How does a turn run? | `src/tutor/turn.ts`, `src/tutor/runner.ts` |
| How does the app call OpenAI? | `src/tutor/openai.ts`, `src/tutor/openai-items.ts` |
| Which model and effort? | `src/tutor/model.ts`, `settings` table |
| What does code check in a reply? | `src/tutor/reply-checks.ts`, `src/tutor/reply-gate.ts`, `src/tutor/stream-guard.ts` |
| Which Widget recipes exist? | `src/widgets/recipes/index.ts` |
| How does a Widget draw? | `src/app/widget-view.tsx`, `src/widgets/library.tsx` |
| Where is the finance math? | `src/finance/` |
| Which Library sources exist? | `scripts/library/sources.json` |
| How does Library search rank? | `src/library/search.ts` |
| How do citations work? | `src/tutor/cite-markers.ts`, `src/tutor/citations.ts` |
| Where is the course? | `course/outline.yaml`, `course/topics/`, `src/course/map.ts` |
| Where are the tables? | `src/db/schema.ts`, `drizzle/` |
| What runs on deploy? | `vercel.json`, `scripts/migrate-on-build.mjs`, `.github/workflows/ci.yml` |
| What does the health check read? | `src/alerts/health.ts`, `src/app/api/cron/health/route.ts` |
| Which commands are agents denied? | `.claude/settings.json` |

## 15. Decisions

Each big choice has an ADR. The index is [`docs/adr/README.md`](adr/README.md). The ones this page leans on most:

- [ADR 0007](adr/0007-one-model-behind-our-own-transcript.md): one OpenAI model, behind the app's own transcript format.
- [ADR 0009](adr/0009-tutor-chooses-code-draws.md): the Tutor chooses a recipe, and tested code draws it.
- [ADR 0011](adr/0011-signal-widgets-are-fixed-components.md): each Signal widget is one fixed React component.
- [ADR 0013](adr/0013-as-of-rule-hides-hindsight.md): the as-of rule hides hindsight.
- [ADR 0016](adr/0016-only-main-deploys.md): only `main` deploys, behind checks and a snapshot.
- [ADR 0017](adr/0017-clerk-replaces-better-auth.md): Clerk replaces Better Auth.

## 16. Words

[`GLOSSARY.md`](../GLOSSARY.md) at the repo root holds the domain words. The main ones:

- **Learner**: a person who studies in the app.
- **Owner**: the one person who runs Value It and decides who may come in.
- **Tutor**: the model, with its instructions and tools.
- **Turn**: one Learner action and the Tutor's full reply.
- **Session**: one conversation about one Topic.
- **Topic**: one lesson in the course.
- **Case**: a real company or event that a Topic studies.
- **As-of date**: the date a Case stands at, before its outcome.
- **Widget**: an interactive picture in the Widget panel.
- **Signal widget**: one of the five fixed widgets on the public site.
- **Recipe**: a tested Widget template that the Tutor fills.
- **Library**: the store of passages from real sources.
- **Passage**: one cut of 300 words or fewer from a source.
- **Spend**: the estimate of what one person's Tutor costs.

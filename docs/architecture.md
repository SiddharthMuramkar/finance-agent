# Value It architecture

Facts as of 2026-11-14. This page starts with the map, then zooms in, one layer at a time. File paths are signposts. The page shows no code.

## 1. The picture

Value It teaches finance and valuation. A Learner chats with a Tutor in the browser. The Tutor is an OpenAI model, gpt-6.1-sol, on the Responses API. The server runs on Vercel. Each Learner action starts one Tutor turn on the server. During the turn, the model calls tools. The tools search a private Library of real sources, show interactive Widgets, calculate, and record progress. Code checks replies before the Learner sees them. One Neon Postgres database keeps all state. The course is YAML files in the repo. A merge to `main` makes Vercel migrate the database, build, and deploy.

## 2. The map

```text
BROWSER  src/app/*
  Chat, left (assistant-ui)               Widget panel, right (OpenUI Renderer)
     |  POST /api/turn                       ^  one JSON event per line, streamed
     v                                       |
SIGN-IN GATE  src/proxy.ts      passcode cookie  or  Better Auth (Google, email link)
     |
     v
NEXT.JS ROUTES  src/app/api/*/route.ts
     |
     v
TUTOR TURN  src/tutor/turn.ts
  lock -> Session -> context notes -> tool loop -> reply checks -> save
     |                         ^
     v                         |
OPENAI  Responses API, gpt-6.1-sol      src/tutor/openai.ts
     |  tool calls
     v
TOOLS  src/tutor/tools.ts
  show_widget, open_widget, update_widget ---> WIDGETS  src/widgets/*
                                               recipe -> checks -> OpenUI Lang
  search_library ----------------------------> LIBRARY (RAG)  src/library/*
                                               BM25 + Voyage vectors, fused
  calculate, record_*, finish_teaching_step -> finance code, Learner memory
     |
     v
NEON POSTGRES  drizzle ORM      src/db/schema.ts, drizzle/*.sql

OTHER PARTS
  Course    course/outline.yaml, course/topics/*.yaml -> src/course/map.ts -> context notes
  Admin     /admin -> src/app/api/admin/*   (owner only)
  Deploy    GitHub CI: check, build, ui.  Merge to main -> Vercel: migrate -> build -> deploy
  Weekly    Vercel cron -> /api/cron/library-refresh -> Library
```

## 3. The layers

### 3.1 Browser

The browser shows the pages. The public pages are Home (`/`), `/about` and the login page. The main page is `/study`: chat on the left, Widgets on the right.

1. The Learner types a message or taps a Choice.
2. The page sends `POST /api/turn` with the message, the shown Session or Topic, and the open Widget values.
3. The page reads the reply as a stream of events, one JSON line per event.
4. The chat shows the text. The Widget panel draws each Widget.

Files: `src/app/study/page.tsx`, `src/app/conversation.tsx`, `src/app/thread.tsx`, `src/app/turn-stream.ts`, `src/app/widget-panel.tsx`, `src/app/widget-view.tsx`, `src/app/globals.css`.

### 3.2 Sign-in gate and routes

Each page request goes through `src/proxy.ts` first. A signed-out visitor can open only the public pages. Other pages send the visitor to the login page. A signed-out API call gets status 401.

1. The proxy reads the sign-in cookie.
2. A valid passcode cookie, or a Better Auth session cookie, lets the request through.
3. The page or route reads the Learner again on the server before it reads data (`src/auth/session.ts`).

Each API route does one job. Files: `src/app/api/turn/route.ts`, `src/app/api/widget-state/route.ts`, `src/app/api/case-data/[caseId]/route.ts`, `src/app/api/login/route.ts`.

### 3.3 Tutor, Widgets and Library

- **Tutor** (`src/tutor/`): runs one turn for each Learner action. It calls OpenAI, runs tools, checks the reply and saves each step. See section 4.
- **Widgets** (`src/widgets/`, `src/finance/`): the Tutor picks a recipe, and code draws it. See section 5.
- **Library** (`src/library/`): passages from real sources. The Tutor searches and cites them. See section 6.

### 3.4 Database

One Neon Postgres database keeps all state: Learners, Sessions, messages, turns, tool calls, Widget state, Library passages, settings and sign-in records. The app uses the drizzle ORM. The app uses a pooled connection. Migrations use a direct connection.

1. A developer changes `src/db/schema.ts`.
2. `npm run db:generate` writes a new SQL file in `drizzle/`.
3. On a production deploy, `scripts/migrate-on-build.mjs` applies the new files before the build.

Files: `src/db/client.ts`, `src/db/one-write.ts`, `src/db/schema.ts`, `drizzle.config.ts`.

### 3.5 Course content

The course is data, not code. `course/outline.yaml` puts the Topics in order. Each file in `course/topics/` holds one Topic: its steps, Cases and written-ahead Widgets.

1. `src/course/map.ts` loads the YAML once and keeps it in memory.
2. `src/course/navigator.ts` finds the Learner's place in the course.
3. The Tutor turn sends that place to the model as a context note.
4. `npm run check` validates the YAML and the generated `docs/course-map.md`.

### 3.6 Deploy

1. Work happens on a branch. A pull request goes to `main`.
2. GitHub Actions runs three checks: check, build and ui (`.github/workflows/ci.yml`). The ui check runs the browser tests in shards.
3. A merge to `main` starts a Vercel production build.
4. `npm run vercel-build` runs `scripts/migrate-on-build.mjs`, then `next build`.
5. Vercel deploys the functions to region `sin1` (`vercel.json`).

A preview build never migrates the database. Each Monday, a Vercel cron calls `/api/cron/library-refresh`.

## 4. How a Tutor turn works

1. The browser sends `POST /api/turn`. The body names one kind of turn, for example a message, a Choice, Next, a Widget report, resume or stop.
2. The route checks the body with zod (`src/tutor/turn-body.ts`). A bad body gets status 400.
3. The turn takes a lock: one turn per Learner. A second send gets status 409.
4. `src/tutor/session-log.ts` finds the Session for the current Topic, or starts one. A new Session freezes the model, effort, instructions and tools. After a deploy changes the instructions or tools, the next turn refreezes them in the same Session. The effort stays.
5. `src/tutor/context.ts` and `src/tutor/widget-context.ts` add notes: course place, progress, and open Widget values.
6. The tool loop (`src/tutor/runner.ts`) sends a streamed request to OpenAI (`src/tutor/openai.ts`).
7. The model can call a tool. `src/tutor/tools.ts` runs it, and the loop sends the result back. This repeats until the model stops.
8. The reply gate holds the draft (`src/tutor/reply-gate.ts`, `src/tutor/reply-checks.ts`). It fixes small problems and checks the rules.
9. A broken draft gets one retry, but only in the first 30 seconds of the turn. After that, the Learner gets a trimmed fallback.
10. `src/tutor/cite-markers.ts` turns citation markers into stored citations.
11. The turn saves messages, tool calls, Session items and usage. It sends a final `done` event.

Limits and recovery:

- The turn stops itself at 270 seconds (`TIME_BUDGET_MS`). Vercel allows 300. The browser then resumes the turn in a new request.
- A Stop sets a flag. The running turn reads the flag every half second.
- A long Session is compacted at 200,000 input tokens.
- A failed turn shows the Learner a plain sentence with a reference. The `turns` table keeps the status (`src/tutor/failures.ts`).

The app keeps messages in its own transcript format (`src/tutor/model.ts`). `src/tutor/openai-items.ts` translates that format to OpenAI items and back. Each request asks OpenAI not to store the response (`store: false`). The app replays encrypted reasoning from its own records.

## 5. How generative UI works

The Tutor never writes Widget code. It picks a recipe and supplies the numbers. Tested code does the rest.

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

Other Widget tools: `open_widget` opens a written-ahead Widget from the Topic YAML. `update_widget` moves the sliders of an open Widget. Workbench Widgets (`src/widgets/workbench/`) get their figures on the server, from `src/finance/valuation-cases.generated.ts` or the Topic YAML. An older free-form tool, `compose_widget`, stays in the code. New Sessions do not get it.

## 6. How the Library (RAG) works

**Ingest** runs by hand from a laptop:

1. `scripts/library/sources.json` lists the sources.
2. `scripts/library-load.mjs` and the helpers in `scripts/library/` fetch the text.
3. `src/library/prepare.ts` cuts each document into passages of 300 words or fewer.
4. `src/library/ingest.ts` writes sources and passages to Postgres. A blocklist drops unwanted sources.
5. `scripts/library-embed.mjs` stores a Voyage embedding (voyage-4) for each passage in a pgvector column.

Pictures and spreadsheets have their own loaders (`scripts/library-pictures.mjs`, `scripts/library-sheets.mjs`). Each week, the cron route (`src/app/api/cron/library-refresh/route.ts`) runs `src/library/refresh.ts`. It adds new or edited posts from Damodaran's blog. The repo holds the loaders, not the source text.

**Search** runs on each `search_library` call:

1. `src/library/library.ts` finds the as-of date from the Cases of the Learner's current Topic. After the reveal, no date applies.
2. `src/library/voyage.ts` embeds the query. Without `VOYAGE_API_KEY`, search uses keywords only.
3. `src/library/search.ts` runs two rankings of 30 candidates each: BM25 keyword match and vector distance. Without the BM25 index, the keyword half uses Postgres full-text rank.
4. Reciprocal rank fusion (k = 60) merges the two lists. The top 5 passages go back.
5. The Tutor sees each passage with a credit line and numbered sentences.

**As-of rule.** A Case can stop before its outcome. Until the reveal, the Library hides hindsight. A passage passes if it was published on or before the as-of date. A passage from a timeless source also passes if every year it mentions is before the as-of year. Both rankings apply the rule.

**Citations.** The model writes a marker after a claim, such as `⟦id:from-to⟧`. Code removes the marker and stores a citation (`src/tutor/citations.ts`). Each citation links to the passage page (`src/app/passages/[id]/page.tsx`).

**Eval.** `scripts/library-score.mjs` scores search on `scripts/library/eval/questions.json`.

## 7. Sign-in and approval

This section describes the design. Two doors lead to one Learner record.

**Passcode.** `PASSCODES` holds `name:passcode` pairs. `src/app/api/login/route.ts` checks the passcode. Then it sets a signed cookie that carries the Learner id. `src/auth/login-guard.ts` limits wrong tries.

**Better Auth.** Google sign-in and email links (sent through Resend). See `src/auth/better-auth.ts`, `src/auth/email-link.ts` and `src/app/api/auth/[...all]/route.ts`. Each door turns on only when its settings exist.

Approval flow:

1. A new person signs in with Google or an email link.
2. If an invite matches the email, the account links to that Learner (`src/auth/invites.ts`, `src/auth/google-learner.ts`).
3. If no invite matches, the person waits. Pages show a waiting state (`src/auth/session.ts`). The Sign-up switch (`signup_open`) can let everyone in without a wait.
4. The owner opens `/admin` and approves or denies. The page posts to `/api/admin/access`.
5. The approved person presses "Check again" and enters.

`/admin` is owner-only. Other people get 404 (`src/auth/owner.ts`, `src/app/api/admin/owner-post.ts`). The owner is the Better Auth account linked to the Learner named "owner". A passcode sign-in never counts as the owner. The owner adds invites on `/admin` or with `npm run invites`. `scripts/setup-sign-in.sh` walks through the setup.

## 8. Configuration

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
| `SESSION_SECRET` | Signs the passcode cookie |
| `PASSCODES` | `name:passcode` pairs (`PASSCODE` is the older single form) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Better Auth secret and site address. Google turns on with `BETTER_AUTH_SECRET` plus `GOOGLE_CLIENT_ID` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email-link sign-in |
| `VOYAGE_API_KEY` | Vector half of Library search |
| `CRON_SECRET` | Lets only Vercel cron call the refresh route |
| `TURN_TIME_BUDGET_MS` | Optional, for local cut-off tests |

The `settings` table holds `effort` (default `medium`), `widget_engine`, `session_idle_hours`, `compact_at_tokens`, `review_cap` and `signup_open`. Most defaults are in `src/tutor/session-log.ts`. The `signup_open` default (`off`) is in `src/auth/invites.ts`. A Session keeps its `effort` from when it starts, so an `effort` edit reaches only new Sessions. A Session with the Widget engine keeps it when `widget_engine` changes. The other rows take effect on the next turn or request.

Constants: `TUTOR_MODEL` and `DEFAULT_EFFORT` (`src/tutor/model.ts`), `TIME_BUDGET_MS` (`src/tutor/turn.ts`), `maxDuration` (`src/app/api/turn/route.ts`), `POOL` and `RRF_K` (`src/library/search.ts`), the 300-word cut (`src/library/prepare.ts`), region and cron (`vercel.json`). A change to `TUTOR_MODEL` closes each Learner's live Session on their next turn.

## 9. Where to look

| Question | Look here |
|---|---|
| Which pages are public? | `src/proxy.ts` |
| What does the Tutor read as instructions and tools? | `src/tutor/instructions.ts` |
| What does each tool do? | `src/tutor/tools.ts` |
| How does a turn run? | `src/tutor/turn.ts`, `src/tutor/runner.ts` |
| How does the app call OpenAI? | `src/tutor/openai.ts`, `src/tutor/openai-items.ts` |
| Which model and effort? | `src/tutor/model.ts`, `settings` table |
| What does code check in a reply? | `src/tutor/reply-checks.ts`, `src/tutor/reply-gate.ts` |
| Which Widget recipes exist? | `src/widgets/recipes/index.ts` |
| How does a Widget draw? | `src/app/widget-view.tsx`, `src/widgets/library.tsx` |
| Where is the finance math? | `src/finance/` |
| How does Library search rank? | `src/library/search.ts` |
| How do citations work? | `src/tutor/cite-markers.ts`, `src/tutor/citations.ts` |
| Where is the course? | `course/outline.yaml`, `course/topics/`, `src/course/map.ts` |
| Where are the tables? | `src/db/schema.ts`, `drizzle/` |
| How does sign-in work? | `src/auth/`, `src/app/login/page.tsx` |
| Where is the admin page? | `src/app/admin/page.tsx`, `src/auth/access.ts` |
| What runs on deploy? | `vercel.json`, `scripts/migrate-on-build.mjs`, `.github/workflows/ci.yml` |

## 10. Words

`GLOSSARY.md` at the repo root will hold the domain words. It does not exist yet. Until then, these are the main words:

- **Learner**: a person who studies in the app.
- **Tutor**: the model, with its instructions and tools.
- **Turn**: one Learner action and the Tutor's full reply.
- **Session**: one conversation about one Topic.
- **Topic**: one lesson in the course.
- **Case**: a real company or event that a Topic studies.
- **as-of date**: the date a Case stands at, before its outcome.
- **Widget**: an interactive picture in the Widget panel.
- **Recipe**: a tested Widget template that the Tutor fills.
- **Library**: the store of passages from real sources.
- **Passage**: one cut of 300 words or fewer from a source.

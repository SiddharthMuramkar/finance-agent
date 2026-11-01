# Finance Tutor Agent — Spec v1

Status: draft for review · Date: 2026-11-01 · Owner: Siddharth · Builder: Claude Code

## At a glance

- **What:** an AI tutor that teaches me finance from zero, then how startups and VCs think. India focus.
- **Why:** I learn finance by using it. I learn agent engineering by building it.
- **v1 user:** only me. The code is public-ready from day one.
- **Where I use it:** my own website (Next.js on Vercel).
- **What it does on its own:** writes a weekly progress report.
- **Core idea:** a hand-written agent loop in Python. No agent framework.

## 0. Rules for Claude Code

Start every session with: `Read SPEC.md. We are on milestone M_. Plan first.`

1. Work on the current milestone only.
2. Start each milestone in plan mode. List the files you will create or change. Wait for my OK.
3. Build in small steps. After each step, show me how to run it in the VS Code integrated terminal.
4. Explain the learn-plugin way: why before what, one rejected alternative per real decision, one key takeaway per milestone, and a "Google this" pointer.
5. Do not add a library, service or framework that this spec does not list. Ask first.
6. Before you write code against an API, check its current docs with Context7. Do not trust memory for APIs. This includes the Anthropic SDK, FastAPI on Vercel, Next.js, LangSmith and Octen.
7. Never commit secrets. Use a git-ignored `.env` locally and Vercel environment variables in production.
8. A milestone is done only when every "Done when" check passes. Then stop and wait for my review.
9. If reality forces a change, propose the edit to this file first. Then add a line to the Decisions log (section 20).

## 1. Goals and non-goals

Goals:

1. Teach me finance well: fundamentals first, plain words, every fact cited.
2. Remember what I know and where I struggle, across sessions.
3. Send me a weekly progress report.
4. Let me explain every line of the agent loop.

Non-goals for v1:

- Other users. The data model is ready for them (section 11).
- Investment advice of any kind.
- Agent frameworks: LangChain, LangGraph, Pydantic AI, eve, Claude Managed Agents.
- Vector search. Plain full-text search comes first.
- Streaming replies, email, Telegram, a mobile app.

## 2. Architecture

```
Browser (me, phone or laptop)
   │ HTTPS
   ▼
web/  Next.js on Vercel (TypeScript)
   │ server-side call + X-App-Secret
   ▼
backend/app  FastAPI on Vercel (Python)
   │ imports
   ▼
backend/agent  loop + tools + prompts
   │            │               │
   ▼            ▼               ▼
Claude API    Neon Postgres    Octen
Sonnet 5.5    memory, library, web search
              reports, runs

Vercel Cron (weekly) ──▶ GET /jobs/weekly-report
agent ──▶ LangSmith (traces)
```

Five rules:

1. `agent/` knows nothing about HTTP or Next.js. I can run it from the terminal.
2. The browser never talks to the backend. Only Next.js server code does, with the app secret.
3. Each request rebuilds its context from the database. Serverless functions keep no memory between requests.
4. Nothing runs between requests. The only triggers are my messages and the weekly cron.
5. Use the loop only when the model must choose the next step. A fixed recipe (like the weekly report) is plain code with one model call.

## 3. The agent loop

File: `backend/agent/loop.py`. Target: about 80 lines, with comments in plain English.

```python
# Pseudocode. The real file adds types and comments.
def run_turn(user_id, session_id, text):
    system = TUTOR_RULES + profile_block(user_id)
    msgs = last_messages(session_id, n=20)
    msgs.append(user_msg(text))
    for step in range(MAX_STEPS):          # 10
        r = client.messages.create(
            model=MODEL_MAIN,
            system=system,
            tools=TOOL_SCHEMAS,
            messages=msgs,
            max_tokens=1500,
        )
        msgs.append(assistant_msg(r.content))
        if r.stop_reason != "tool_use":
            break                          # Claude is done
        results = run_tools(r.content, user_id)
        msgs.append(user_msg(results))     # tool results go back
    else:
        r = None                           # hit MAX_STEPS
    save_turn(session_id, msgs)
    save_run(user_id, r, step)
    return final_reply(r)                  # checks citations
```

Rules:

- `run_tools` catches every tool error. It sends the error back as a `tool_result` with `is_error: true`. It never crashes the loop.
- Stop on any of these: Claude is done, `MAX_STEPS` is hit, or 90 seconds of wall time pass.
- If the loop stops at a limit, the reply says so in plain words.
- Use prompt caching for the static part: the tutor rules and the tool schemas.
- Trace every turn in LangSmith: one trace per turn, one span per model call and per tool call.

## 4. Tools (v1)

| Tool | Input | Returns | Notes |
|---|---|---|---|
| `search_library` | `query`, `k` (max 5) | chunks: id, source, section, text | Postgres full-text. Each chunk is about 800 tokens or less. |
| `web_search` | `query` | top 5: title, url, snippet | Octen, called with httpx. For examples and context. Never for prices. |
| `update_profile` | `new_profile` | ok, or an error if over 2,000 characters | A full rewrite. The cap forces merging, not piling up. |
| `log_progress` | `topic`, `status`, `evidence` | ok | `status` is `learned`, `shaky` or `todo`. Feeds the weekly report. |

The profile is not a tool. The loop puts it in the system prompt every turn, like Hermes's memory files.

Citations:

- Claude cites as `[c:123]` for a library chunk or `[w:2]` for a web result.
- The backend checks each cited ID against the IDs that tools returned in this turn.
- An unknown ID is marked "unverified" in the UI and counted in the `runs` table.

## 5. Teaching rules

The full text lives in `backend/agent/prompts/tutor.md`. Summary:

1. Teach from fundamentals. One idea at a time.
2. Plain words. Short sentences. Define each new term the first time it appears.
3. India first: the rupee, the RBI and Indian examples, where they fit.
4. Check understanding by asking me to explain it back or apply it to a new case. No rote recall.
5. Every fact needs a citation from a tool result. No source? Say "I'm not sure" and do not guess.
6. Education only. No investment advice. No buy, sell or hold views on any security. No price targets. No market prices from the last 30 days.
7. After each lesson, call `log_progress`. If my level or goals changed, call `update_profile`.
8. Keep replies short. Offer to go deeper.

## 6. Curriculum

File: `backend/agent/curriculum.md`. The tutor follows this order but adapts to me.

- **A. Foundations:** time value of money · compounding and discounting · inflation and real returns · risk, return and diversification
- **B. Markets and macro:** bonds (price, coupon, yield) · the yield curve · central banks, the RBI and the repo rate · GDP, inflation and the rupee
- **C. Companies:** the three financial statements · unit economics · valuation basics (DCF, multiples)
- **D. Startups and VC:** equity, dilution and cap tables · how a VC fund works (LPs, GPs, fees, carry, fund life) · the power law · term sheets (valuation, liquidation preference, pro rata, ESOP) · how startups raise money in India

## 7. Source library

- Start with 3–10 trusted sources. Examples: openly licensed textbooks (such as OpenStax), RBI and SEBI investor-education pages, and books I own (personal use only).
- Check each source's license or terms before ingesting it. Store it in `sources.license`.
- `scripts/ingest.py`: a file or URL → sections → chunks → the `chunks` table.
- Retrieval: Postgres full-text search (`tsvector`, a GIN index, ranking).
- Move to pgvector only if the evals show real misses. Not before.

## 8. Weekly progress report

- Trigger: Vercel Cron, `"30 12 * * 0"`. That is Sunday 18:00 IST, because cron uses UTC. On the Hobby plan it fires sometime within that hour.
- Endpoint: `GET /jobs/weekly-report`. Vercel sends `Authorization: Bearer <CRON_SECRET>`. Reject anything else.
- A recipe, not a loop: load the last 7 days of `progress_events` and the profile → one Sonnet call → save to `reports`.
- Content: what I learned, what is shaky, 3 things for next week, and 1 question to answer.
- Idempotent: one report per user per week (a unique key). A second call changes nothing.
- Shown on `/reports`. Email comes later.

## 9. Data model (Neon Postgres)

```
users            id, email, created_at
sessions         id, user_id, title, created_at
messages         id, session_id, user_id, role,
                 content_json, created_at
profiles         user_id (PK), text (max 2000 chars),
                 updated_at
progress_events  id, user_id, session_id, topic,
                 status, evidence, created_at
sources          id, title, author, url, license,
                 added_at                    -- shared
chunks           id, source_id, section, text,
                 tsv (GIN index)             -- shared
reports          id, user_id, week_start, body_md,
                 created_at
                 UNIQUE (user_id, week_start)
runs             id, user_id, kind, session_id, trace_id,
                 steps, stop_reason, input_tokens,
                 output_tokens, cache_read_tokens,
                 cost_usd, unverified_citations,
                 created_at
```

- Every per-user table has `user_id`. Every query filters by it.
- `sources` and `chunks` are a shared library, so they have no `user_id`.
- Access with psycopg 3 and plain SQL. Migrations with Alembic.

## 10. Interfaces

Backend (FastAPI):

```
GET  /health                 no auth
POST /chat                   {session_id?, text}
                             → {session_id, reply, citations,
                                steps, run_id}
GET  /sessions               my sessions
GET  /sessions/{id}          messages in one session
GET  /progress               profile + last 30 progress events
GET  /reports                all reports
GET  /reports/{week_start}   one report
GET  /jobs/weekly-report     cron only (Bearer CRON_SECRET)
```

All routes except `/health` and the cron route need the `X-App-Secret` header. In v1 the web server also sends `X-User-Id` for my single user.

Web (Next.js, App Router):

- `/login`: a passcode form. It sets an httpOnly cookie. Middleware protects every other page. (Newer Next.js versions may call this `proxy`. Check the docs.)
- `/`: chat. Session list, messages, citations as footnotes, and the tools used under each reply (collapsed by default).
- `/progress`: my profile and my topics by status.
- `/reports`: the weekly reports.
- Server route handlers call the backend. The app secret never reaches the browser.
- Plain UI: one column, easy to read on a phone.

## 11. Public-ready rules (v1 must follow these)

1. `user_id` on every per-user table and in every query.
2. No code assumes one user. No global "the profile".
3. `runs` stores cost per user, so a daily cap is easy to add later.
4. `sources.license` is filled for every source.
5. The education-only rules are in the prompt from day one.

## 12. Cost and safety limits

- API key: from the Console org linked to my Ultra plan. The plan gives $200 of API credits each month. Unused credits expire.
- Workspace: `finance-tutor`, with a $30/month spend limit. Use only its key.
- No purchased credits and no auto-reload. If the credits run out, calls stop. No surprise bills.
- Per turn: `MAX_STEPS = 10`, `max_tokens = 1500` per call, 90 seconds of wall time.
- Models: `claude-sonnet-5-5` for teaching and reports. `claude-haiku-5-5` later, for cheap jobs.
- Expected cost: about $10–20 a month for one learner.
- Log tokens and cost for every run in `runs`.

## 13. Stack, and why

| Part | Choice | Why | Rejected |
|---|---|---|---|
| Model | Claude Sonnet 5.5 | Paid by my plan's API credits. A strong teacher. | Haiku 5.5: cheaper, kept for later jobs |
| Agent | Anthropic Python SDK + my own loop | I must see and explain the loop | eve, Managed Agents, LangGraph, Pydantic AI: they hide the loop |
| Backend | FastAPI (Python 3.12 or newer, uv) | I know it | Next.js API routes: would move the agent into a language I'm still learning |
| Frontend | Next.js (App Router) on Vercel | I want to learn frontend and Vercel | Telegram bot: simpler, but no frontend learning |
| Database | Neon Postgres | I know it. Full-text now, pgvector later. | Pinecone: a second service to run |
| Web search | Octen | Already in my search budget | Claude's web search tool: hides the tool step, $10 per 1,000 searches |
| Scheduler | Vercel Cron | A weekly job fits the Hobby plan | An always-on server: not needed for one weekly job |
| Tracing | LangSmith | I want to learn it. Works without LangChain. | Logfire: also fine |
| Hosting | Two Vercel projects, one repo | Each part deploys on its own | Railway or Fly for the backend, if Vercel limits bite |

## 14. Repo layout

```
finance-tutor/
├── SPEC.md
├── backend/              Vercel project 1 (root: backend/)
│   ├── agent/            no web code in here
│   │   ├── loop.py
│   │   ├── tools.py
│   │   ├── memory.py
│   │   ├── library.py
│   │   ├── report.py
│   │   ├── db.py
│   │   ├── curriculum.md
│   │   └── prompts/tutor.md
│   ├── app/main.py       FastAPI, thin
│   ├── cli.py            talk to the tutor in the terminal
│   ├── scripts/ingest.py
│   ├── migrations/       Alembic
│   ├── evals/            questions + runner
│   ├── tests/            pytest
│   ├── pyproject.toml
│   └── vercel.json       the weekly cron
└── web/                  Vercel project 2 (root: web/)
```

## 15. Environment variables

- **backend:** `ANTHROPIC_API_KEY`, `MODEL_MAIN`, `DATABASE_URL`, `OCTEN_API_KEY`, `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, `APP_SECRET`, `CRON_SECRET`
- **web:** `BACKEND_URL`, `APP_SECRET`, `APP_PASSCODE`, `SESSION_SECRET`, `DEFAULT_USER_ID`

## 16. Before M0 (setup, about 30 minutes)

1. Claim the Ultra plan's API credits: claude.ai → Settings → Billing → link a Console org. The link can't be changed by me later, so pick the org I will build in.
2. In the Console, create the workspace `finance-tutor`. Set a $30/month spend limit. Create an API key there.
3. Do not buy credits. Do not turn on auto-reload.
4. Create a Neon project: a `dev` branch for local work, the default branch for production.
5. Get an Octen API key and a LangSmith API key.
6. Create the GitHub repo `finance-tutor` and add this file.

## 17. Milestones (build and learn together)

Each milestone: build it, learn it, pass every "Done when" check, then stop for review.

### M0 — The loop, in the terminal

- **Build:** `loop.py` with one tool (`web_search` via Octen), `cli.py`, LangSmith tracing, the `MAX_STEPS` stop, and a pytest test with a fake model client. I may type the loop myself, or Claude Code writes it in 3 small steps.
- **Learn:** messages, `tool_use` and `tool_result` blocks, `stop_reason`, why a loop needs a limit, traces and spans, testing with a fake client.
- **Done when:**
  - `uv run python cli.py "What is a bond yield?"` gives a cited answer.
  - The run shows in LangSmith as one trace with model spans and tool spans.
  - The fake-client test (a model that always asks for one more tool call) proves the loop stops at `MAX_STEPS`.
  - I can explain every line of `loop.py` out loud, and I pass a `/quiz` on it.

### M1 — Memory and teaching rules (still in the terminal)

- **Build:** tables `users`, `sessions`, `messages`, `profiles`, `progress_events`, `runs` on the Neon `dev` branch; tools `update_profile` and `log_progress`; `tutor.md`; `curriculum.md`; cost logging.
- **Learn:** table design, capped memory, system prompts, prompt caching.
- **Done when:**
  - I stop mid-lesson, start a new session, and the tutor knows where I stopped.
  - The profile never goes over 2,000 characters.
  - `runs` shows tokens and cost for each turn.

### M2 — Library, citations, evals

- **Build:** `sources` and `chunks` with a full-text index; `ingest.py`; `search_library`; citation checking; `evals/` with 20 questions (15 concept questions, 5 "give me a stock tip" requests); an eval runner that prints each answer, its citations, steps and cost.
- **Learn:** chunking, keyword retrieval and ranking, why citations cut hallucinations, what an eval is.
- **Done when:**
  - Every factual answer in the evals cites a real retrieved ID.
  - All 5 advice requests are refused, and the concept is taught instead.
  - Unverified citations: 0.
  - I grade the 15 concept answers by hand and write the score in the Decisions log.

### M3 — Backend on Vercel

- **Build:** `app/main.py` with the endpoints in section 10; the secret check; deploy `backend/` as a Vercel project; use the Neon default branch for production.
- **Learn:** serverless functions, why context is rebuilt on every request, environment variables, Vercel deploys and logs.
- **Done when:**
  - `curl` to `/chat` on the Vercel URL returns a reply.
  - A request without the secret gets a 401.
  - A normal turn finishes in under 90 seconds.

### M4 — The website

- **Build:** `web/` with the login, chat and progress pages; server route handlers that call the backend; deploy as the second Vercel project.
- **Learn:** React components, server and client components, route handlers, middleware, environment variables in Next.js.
- **Done when:**
  - I take a full lesson in the browser on my phone.
  - The app secret does not appear in the browser (checked in DevTools).

### M5 — Weekly report

- **Build:** `report.py` (a recipe, no loop), the cron route, the cron in `vercel.json`, the `/reports` page.
- **Learn:** workflow versus agent, cron jobs, idempotency.
- **Done when:**
  - A manual call with the secret creates this week's report.
  - A second call creates nothing new.
  - The Sunday cron runs, and the report shows on `/reports`.

## 18. Later (not v1)

- Email the weekly report.
- Streaming replies.
- Spaced review: the tutor schedules its own quizzes on my weak topics.
- A finance news explainer.
- v2: 5–20 testers. v3: public. Before going public:
  - Real auth. Pick one then: Neon Auth, Clerk or Better Auth.
  - A per-user daily cost cap. Haiku 5.5 for routine turns. Lessons generated once and shared.
  - A legal check of SEBI's education-versus-advice rules, including the 30-day price-data lag.
  - Check Vercel's plan terms. Hobby is meant for personal, non-commercial use.
  - Every source licensed for public use.
  - Rate limits against abuse.
- Revisit eve or Claude Managed Agents for v3, once I understand the loop.

## 19. Open questions (answer before the milestone starts)

- **M2:** which 3–10 sources go into the library?
- **M3:** are Vercel Hobby limits enough for the backend? (300 seconds max per function. A turn needs 90 seconds or less.)
- **M4:** is a passcode login enough for v1?
- **Later:** which email service sends the reports?

## 20. Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-01 | v1 is single-user, built public-ready | Smaller scope. No legal or cost risk yet. |
| 2026-11-01 | My own loop on the Anthropic SDK, no framework | Learn what frameworks hide |
| 2026-11-01 | My own website, Next.js on Vercel | Learn frontend while building |
| 2026-11-01 | Python backend, TypeScript frontend | Keep my Python strength. Learn Next.js on a small surface. |
| 2026-11-01 | The only proactive job is the weekly report | The right size for v1 |
| 2026-11-01 | Full-text search before vectors | Add complexity only after the evals show a need |
| 2026-11-01 | Octen for web search | Already in my budget |

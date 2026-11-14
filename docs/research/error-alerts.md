> Throwaway research branch for wayfinder ticket #12. Never merged.

# Research: Error alerts for the beta (ticket #12)

> Verified 2026-11-14 by an adversarial pass against vendor pages and the repo. All 12 key claims held in substance. The corrections are marked **[Corrected]**. The biggest change is in Option B: a failed turn does not stay `status='failed'`, so the check must look at `failure_ref`.

## Question

About 20 Learners will use the beta. What is the minimum setup that tells the owner about failures quickly? The candidates are Sentry, a Vercel log drain, an uptime check, and a small scheduled database check on failed turns, `tutor_incidents` and cron errors. What does each one cost, and what setup does it need, on Hobby and on Pro?

## Short answer

1. Stay on Hobby. Add two free parts: an **uptime check** on `https://www.value-it.xyz/` and a **scheduled database check** every 15 minutes. The check sends a **heartbeat** (a regular "I am alive" request) to a free monitor.
2. The app already writes every failed turn, incident and cron run to Postgres. **[Corrected]** But a failed turn's `status` does not stay `failed`. Retry and a Topic change overwrite it. Only `failure_ref` stays, so the check must read `failure_ref`. Vercel keeps runtime logs for only 1 hour on Hobby.
3. A turn that fails after it starts comes back as HTTP 200, and the error is inside the stream. So Vercel Alerts never see it, and Sentry sees it only if code reports it. **[Corrected]** An error before the turn starts (for example, the database is down) gives HTTP 500. Those errors leave no `turns` row.
4. A log drain and Vercel Alerts need Pro ($20/month). They still miss failed turns unless you add more work, so they are not worth it at 20 Learners.
5. Sentry's free plan is a good later step if you want stack traces from routes other than the turn.

## Words used here (STE)

- **Log**: a line of text that the code writes while it runs (`console.error`). Vercel stores it for a short time.
- **Error event**: a report of one failure, with its stack trace, that the code sends to a tool such as Sentry.
- **Alert**: a message (usually an email) that a tool sends when a rule matches.
- **Uptime check**: an outside service requests a URL every few minutes. When the request fails several times, it sends an alert.
- **Heartbeat**: your job sends a request to a URL on each run. The service sends an alert when a request does not arrive in time, or when the job reports `/fail`.
- **Log drain**: Vercel sends a copy of every log line to another service.
- **Jitter**: a random delay that Vercel adds to the start of each scheduled run.

## What the app records now (read from the repo)

| Failure | Where it is stored | Alert today |
|---|---|---|
| Failed Tutor turn | `turns` row: `status='failed'`, `error`, `failure_ref`, `provider_error`, `provider_status`, `provider_request_id`; `finished_at` stays null (`src/db/schema.ts` 471-523, written in `src/tutor/turn.ts` ~459-478). **[Corrected]** The status is not durable. Retry (`resumeTurn`, `src/tutor/turn-status.ts` 154-171) sets `status='running'`, a new `started_at` and `error=null`, and the turn then ends `finished`. A Topic change sets session-less `failed` turns to `finished` (`src/learner/memory.ts` 75-82). Only `failure_ref` stays (nothing clears it), until a second failure on the same row overwrites it. | None |
| Turn killed by the 300 s limit | Row stays `status='running'`. It changes to `cut_off` only when the same Learner sends or resumes again (`STALE_RUN_MS = 330_000`, `expireStaleRuns` in `src/tutor/turn-status.ts` 106-145). After that it looks like a normal cut-off, so the evidence is gone. | None |
| Healed replay (Tutor incident) | `tutor_incidents` row (`src/tutor/incidents.ts`) | None |
| Error that escapes the turn generator after the stream opens | Log line only (`src/app/api/turn/route.ts` ~98-102). No database row. HTTP 200. | None |
| **[Added]** Error before the turn's first event (for example, the DB fails at `startTurn`) | No row. `POST` throws (route.ts line 74), so the answer is HTTP 500 and a Vercel error log. | None (Hobby) |
| Weekly Library cron | `library_refresh_runs` row (`status` running/done/failed, `failed` jsonb). The route answers 500 on failure (`src/app/api/cron/library-refresh/route.ts`). **[Added]** A run that is killed mid-run stays `running` until the next weekly run marks it `failed` (schema comment, `src/db/schema.ts` 635-640). | None. Vercel does not retry a failed cron run. |
| Failed build or migration | `scripts/migrate-on-build.mjs` fails the production build (`npm run vercel-build`) | **Yes**: Vercel emails the deployment creator by default, on all plans. It does not send the email if you read the notification in the dashboard first. |

## Options table

| Option | What it gives | Cost on Hobby | Cost on Pro | Code / setup effort | Risk |
|---|---|---|---|---|---|
| 0. Vercel deploy-failure email (already on) | An email when a build or migration fails | $0 | $0 | None | None |
| A. Uptime check on `/` (Better Stack free: 10 monitors + 10 heartbeats, 3-min checks; or UptimeRobot free: 50 monitors, 5-min checks, "personal and commercial projects") | An email when the site is down or the DNS fails | $0 | $0 | 10 minutes in a dashboard, no code | `/` loads without the DB or OpenAI. A green check does not prove that turns work. **[Added]** Better Stack labels its free plan "Free for personal projects". See the facts below. |
| B. Scheduled DB check + heartbeat (new route, `vercel.json` `schedules`, Better Stack heartbeat) | An email for new failed turns (by `failure_ref`), new incidents, killed turns that nobody resumed yet, and a failed, stuck or missed Library run. A missed heartbeat also catches a down DB and a dead checker. | Vercel $0. On Hobby, Schedules (beta) can run at most every 15 min (15-min jitter, 5,000 runs per billing period per team). Legacy Cron Jobs can run only once a day. **[Corrected]** Neon: worst case about $6.40-8.40/month at 15 min, about $1.60-2.10/month hourly (idle hours only). | Vercel can run every 1-5 min. If the check runs every 5 min or less, the Neon compute never sleeps, which can cost up to about $19/month. | Small: 1 route + 1 query module + tests, a `schedules` entry, an exclusion in the proxy matcher, 1 env var for the heartbeat URL (owner adds it) | Schedules is in beta. On Hobby, an alert can come up to about 30 min late. No stack traces. **[Added]** A failure can show in 2-3 checks in a row (the lookback overlaps). |
| C. Sentry Developer (free) | Error events with stack traces from routes, Server Components and the browser. Also 1 uptime monitor and 1 cron monitor (the Library cron). Email alerts. | $0 (1 user, 5k errors/month). Team plan is $26/month billed yearly, only if you need more | Same. The Vercel plan does not change Sentry's price. | Medium: `@sentry/nextjs`, merge `src/instrumentation.ts`, add `instrumentation-client.ts`, wrap `next.config.ts` (OpenUI Turbopack aliases), `SENTRY_DSN` + `SENTRY_AUTH_TOKEN` env vars (owner), and a `Sentry.captureException` call in the `turn.ts` catch | Learner text can leak into events unless you scrub it. An error loop can use up 5k/month, and Sentry then drops events for the rest of the month. Adds a build step. |
| D. Vercel log drain → log tool with alert rules | Every log line in a second tool. You set an alert on "Tutor turn failed". | **Not available** (also not on a Pro trial) | **[Corrected]** $20/month platform fee (1 deploying seat and $20 usage credit included) + $0.50/GB drained (estimated < $1/month here) + the log tool's price | Small code, but a second vendor and alert rules to maintain | Matches on log text. Logs can hold Learner data. Needs Pro. |
| E. Vercel Alerts (Pro + Observability Plus) | Error-anomaly alerts on 5xx per route (can be set to 4xx), and usage anomalies | **Not available** | $20/month platform fee + $1.20 per 1M Observability Plus events. Observability Plus is on by default for teams that upgrade to Pro on or after 2026-04-03. | None | Failed turns are HTTP 200, so they are never counted. Low traffic stays under Vercel's minimum activity thresholds, so it will probably stay silent. Custom monitors (Observability Plus only) exist, but this pass did not check whether they could count failed turns. |

## Facts with sources

High-stakes facts (prices, plan limits, terms) have two sources where marked ✓✓. All pages were read on 2026-11-14 unless a date says otherwise.

**Vercel**
- Drains are available on Pro and Enterprise only. Hobby and Pro-trial teams must upgrade. They cost $0.50 per 1 GB. ✓✓ https://vercel.com/docs/drains (updated 2026-09-01); https://vercel.com/pricing (Drains Volume "—" for Hobby, "$0.50 per 1 GB" for Pro).
- Alerts need Pro or Enterprise with Observability Plus. Error anomaly compares each 5-minute error count per route with a trailing 24 h baseline, and it must pass Vercel's minimum activity checks. It starts after 24 h of Observability Plus. ✓✓ https://vercel.com/docs/alerts (updated 2026-09-09); https://vercel.com/docs/observability/observability-plus (updated 2026-07-06).
- Observability Plus costs $1.20 per 1M events. Pro teams created or upgraded on or after 2026-04-03 get it on by default. https://vercel.com/docs/observability/observability-plus (updated 2026-07-06). Only one source gives the price.
- Runtime log retention is 1 hour on Hobby and 1 day on Pro (30 days with Observability Plus, with a 14-day maximum selection window). ✓✓ https://vercel.com/docs/plans/hobby (updated 2026-11-12); observability-plus page above; https://vercel.com/pricing.
- **[Corrected]** Pro costs a $20/month platform fee. The fee includes 1 deploying seat and $20/month of usage credit. Each extra deploying seat costs $20/month. ✓✓ https://vercel.com/docs/plans/pro-plan; https://vercel.com/pricing ("$20/mo", "$20 of included usage credit", "Developer seat $20 / month").
- Hobby Cron Jobs can run once a day at most, anywhere in the scheduled hour (±59 min). A more frequent expression fails the deploy. Pro can run once a minute. Vercel does not retry a failed cron run. Delivery is best effort, and a run can also arrive twice. Cron Jobs are now a "legacy feature" that will move to Schedules. ✓✓ https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing (updated 2026-07-15); https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs (updated 2026-08-11). (The old `/docs/cron-jobs/...` URLs redirect here.)
- Schedules (beta, the successor to Cron Jobs): on Hobby the jitter is always 15 min, so a schedule can run at most every 15 min. A run starts at some point from 0 to 15 min after its scheduled time. Hobby also has a cap of 5,000 runs per billing period per team, and manual runs count. Over the cap, Vercel skips scheduled runs until the next period. A `path` target is supported in `vercel.json` `schedules`. Vercel sends `Authorization: Bearer <CRON_SECRET>` to path targets. A failed or timed-out path run is not retried, and a duplicate delivery is possible. ✓✓ https://vercel.com/docs/schedules/limits, https://vercel.com/docs/schedules/concepts, https://vercel.com/docs/schedules/configuration, https://vercel.com/docs/schedules/handle-runs; Vercel docs search (`search_vercel_documentation`).
- Deployment-failure notifications go to the deployment's creator, with web and email on by default, on all plans. If you read the web notification first, Vercel does not send the email. https://vercel.com/docs/notifications (updated 2026-09-14).
- **[Corrected]** Under the Terms of Service, a Hobby plan is only for "personal or non-commercial use" (https://vercel.com/legal/terms). The current Fair Use Guidelines page (updated 2026-11-12) no longer defines commercial use. So "any way of taking payment counts as commercial" is **unconfirmed** today. A free invite-only beta probably fits Hobby (**uncertain**). The later "Offer and pricing" step will need Pro.
- Project state read 2026-11-14 (read-only): no drains configured (`list_drains`, team acme-ef4b: empty). Production env var **names** include `CRON_SECRET` but not `RESEND_API_KEY` or `EMAIL_FROM` (from the first pass, not re-read). No values were decrypted.

**Sentry**
- The Developer plan is free: 1 user, 5k errors/month, email alerts. Team costs $26/month billed yearly. ✓✓ https://sentry.io/pricing/; https://docs.sentry.io/pricing/. The $29 monthly-billing price comes only from secondary sources (last9.io 2026-01-08, instatus.com), so it is **unconfirmed**.
- All plans include 1 cron monitor and 1 uptime monitor. Extra monitors ($0.78 cron, $1.00 uptime) can only be bought with a PAYG budget. ✓✓ https://docs.sentry.io/pricing/ ("All Sentry plans include one cron monitor and one uptime monitor. Additional monitors can only be purchased with your PAYG budget."); https://sentry.io/pricing/.
- Uptime intervals run from 1 min to 1 hour. A 2xx answer counts as up. By default an issue opens after 3 failures in a row. https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/ (via Context7, from the first pass).
- Next.js setup: `instrumentation.ts` `register()` plus `export const onRequestError = Sentry.captureRequestError` (needs `@sentry/nextjs` ≥ 8.28 and Next.js ≥ 15), and `withSentryConfig` with `SENTRY_AUTH_TOKEN` for source maps. `_experimental.vercelCronsMonitoring: true` creates cron check-ins and works with Turbopack and the App Router. It reads the `crons` field in `vercel.json`, so it does not cover a `schedules` entry. https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/, .../configuration/build/, .../crons/ (via Context7, 2026-11-14).

**Uptime / heartbeat services**
- Better Stack free plan: 10 monitors, 10 heartbeats, 1 status page, 3-minute checks, email and Slack alerts. ✓✓ https://betterstack.com/uptime ("Get 10 monitors, 10 heartbeats and a status page with 3-minute checks totally free"); https://betterstack.com/pricing ("10 monitors included", "10 heartbeats included").
- **[Added]** The Better Stack pricing page heads the free plan "Free for personal projects". The Terms page (https://betterstack.com/terms) has no free-plan clause on commercial use. **Uncertain**: ask Better Stack, or use UptimeRobot for the uptime check, if this matters.
- A Better Stack heartbeat opens an incident when no beat arrives within the expected frequency plus a grace period that you set. A request to `<url>/fail` reports a failure explicitly. https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/.
- UptimeRobot free plan: 50 monitors, 5-minute checks, "Good for personal and commercial projects". ✓✓ https://uptimerobot.com/pricing/; https://help.uptimerobot.com/en/articles/11604710 (2026-08-27).

**Neon (cost of waking the DB)**
- Launch compute costs $0.106 per CU-hour, with no monthly minimum. It scales to zero after 5 min of no activity (you can turn this off). ✓✓ https://neon.com/pricing; https://neon.com/docs/introduction/plans.
- The `finance-agent` project (cool-queen-75259301) computes use a minimum of 0.25 CU and a maximum of 2 CU. Suspend is 300 s (some endpoints use the default, `0`, which is 5 min on Launch). Read 2026-11-14 via the Neon API, read-only.
- **[Corrected]** Observed on 2026-11-14: 5.1 to 6.6 min passed from an endpoint's last activity to its suspend. So one wake costs about 5-7 min of compute, not exactly 5.
- Worst-case math (when no Learner uses the DB), at 0.25 CU:
  - Every 15 min: 2,880 runs × 5-7 min = 240-336 h → 60-84 CU-h ≈ **$6.40-8.90/month**. With the observed average this is about **$6.40-8.40**.
  - Hourly: ≈ **$1.60-2.10/month**.
  - Every 5 min or less, the compute never sleeps: 730 h × 0.25 = 182.5 CU-h ≈ **$19.35/month**.
  - When Learners are active the DB is awake anyway, so the real cost is lower.

**Email (alternative alert channel)**
- Resend free plan: 100 emails/day, 3,000/month (sent and received count). ✓✓ https://resend.com/docs/knowledge-base/account-quotas-and-limits (2026-11-05); https://resend.com/docs/knowledge-base/what-is-resend-pricing (2026-10-15). Production has no `RESEND_API_KEY` or `EMAIL_FROM` yet, and sending needs a verified domain, which is a DNS change. So a heartbeat is the simpler channel now.

## How it fits this repo (file paths)

- **Why a generic error tool misses failed turns:** `src/tutor/turn.ts` (~459-478) catches the error, writes the `failed` row and yields `{ type: "error" }`. `src/app/api/turn/route.ts` streams it inside an HTTP 200 NDJSON response. So `onRequestError`, 5xx anomaly alerts and drain status filters never see it. Only the `console.error("Tutor turn failed (reference …)")` line and the DB row record it. **[Added]** Errors before the turn's first event (DB calls at turn.ts ~392 have no try/catch) make `POST` throw, so they become HTTP 500. Sentry's `onRequestError` would catch those.
- **Option B pieces:**
  - New route, for example `src/app/api/cron/health/route.ts`. It reuses `isCronRequest` from `src/library/refresh.ts`, with `runtime = "nodejs"` and `dynamic = "force-dynamic"`.
  - **Lookback window [Corrected]:** On Hobby two runs can be up to ~30 min apart (15-min interval + 15-min jitter). A turn can also start up to 300 s before it fails. So use a lookback of about 40 min, not 15. A failure then shows in 2-3 checks. That is noise, not a miss. For exact, one-time reports, add a small `failed_at` column (written in the `turn.ts` catch) and a stored watermark later.
  - Queries:
    - (1) **[Corrected]** `turns` where `failure_ref IS NOT NULL` and `started_at` is inside the lookback. Do **not** filter on `status='failed'`: Retry and a Topic change overwrite it, and Retry also resets `started_at` to the retry time. Return the `failure_ref`s. A turn that was retried much later can show again, because its `started_at` moves. Accept this.
    - (2) `tutor_incidents` by `kind` inside the lookback (index `tutor_incidents_kind_created` exists).
    - (3) `turns` where `status='running'` and `started_at < now() - 330 s` (killed runs). **[Corrected]** This finds a killed run only until the same Learner sends again. After that it is a normal `cut_off`. To make it durable, `expireStaleRuns` could also write a `tutor_incidents` row (optional, small code change).
    - (4) The latest `library_refresh_runs` row has `status='failed'`, **or [Added]** it is `status='running'` and started more than 10 min ago (killed mid-run), or it started more than 8 days ago (the cron runs weekly, Mon 21:30 UTC ± 59 min).
  - On success, the route calls the heartbeat URL. On findings, it calls `<url>/fail` with a short body that lists the counts and refs. It sends no Learner text. A duplicate run is possible (Vercel docs), so the handler must be safe to run twice. It is, because it only reads.
  - **Heartbeat settings [Added]:** expected period 15 min, grace period at least 15-20 min. Runs can be up to ~30 min apart on Hobby, so a shorter grace gives false "missed" alerts.
  - `vercel.json`: add `"schedules": { "health": { "schedule": "*/15 * * * *", "path": "/api/cron/health", "requestMethod": "GET" } }` next to the existing `crons` entry. Do not use `crons` for it: on Hobby, `crons` allows only a daily run. Do not list the same route in both `crons` and `schedules`, or it runs twice.
  - `src/proxy.ts` `config.matcher` (line 105): exclude `api/cron/health$` exactly, the same way as `api/cron/library-refresh$`. If you do not, the proxy answers 401 before the route runs.
  - A test for the matcher (`src/proxy.test.ts`) and for the queries (PGlite, like the other DB tests). Include a test where a failed turn is retried and finishes before the check runs.
- **Option A:** monitor `https://www.value-it.xyz/`. **[Confirmed]** While Better Auth is off, a signed-out GET of `/` runs no DB query. The proxy reads the DB only for a signed cookie (`src/proxy.ts` 33-41), and `learnerFromCookie` returns before any query when there is no valid cookie (`src/auth/learners.ts` 59-61). So the check does not keep Neon awake. Confirm this on Neon's compute graph after setup. Do not point the uptime check at a route that queries the DB. Each check is one function call. At 3-min checks that is about 15k calls a month, well inside Hobby's 1M.
- **Option C pieces:** `src/instrumentation.ts` already has `register()` for the E2E PGlite path, so merge into it. `next.config.ts` has Turbopack `rules`/`resolveAlias` for OpenUI stubs that `withSentryConfig` must keep. The CSP there is only `frame-ancestors`, so the browser SDK is not blocked. CI's build "reads no env" (`.github/workflows/ci.yml` line 19), so source-map upload runs only on Vercel. Add `Sentry.captureException(error, { tags: { failureRef: ref } })` in the `turn.ts` catch and in the `route.ts` catch. Keep `sendDefaultPii` off.
- **Rejected: a GitHub Actions scheduled job.** It needs `DATABASE_URL` as a GitHub secret, and CI is secretless by design. It also uses the private repo's Actions budget, which CI already uses heavily (the check job takes 11.8-14.3 min, per the `ci.yml` comment).

## Recommendation with the trade-off

Do **A + B on Hobby now**. Use one free Better Stack account for both the uptime monitor and the heartbeat, if its "personal projects" label is acceptable. If it is not, use UptimeRobot (explicitly allows commercial use) for A. Run B every 15 minutes.

- **Why:** The failures that matter (failed turns, killed turns, incidents, cron runs) are already in Postgres. A small check reads them directly, from a durable store, at $0 on Vercel. It also catches failures that throw nothing (a killed run never becomes `failed`). The heartbeat catches a down DB and a dead checker.
- **Trade-off:** B is code you own and must test. It must read `failure_ref`, not `status`, because Retry and a Topic change overwrite the status. It gives counts and `failure_ref`s, not stack traces. A failure can show in 2-3 checks in a row. On Hobby an alert can take up to about 30 min. It relies on Vercel Schedules, which is in beta. If Schedules changes, the fallback is a daily Cron Job (slow) or Pro.
- **Neon cost:** worst case about $6-8/month at 15 min. Run the check hourly to bring this down to about $1.60-2.10.
- **Later:** add **C (Sentry free)** if you want stack traces for errors outside the turn path (other API routes, pages, the browser, and the pre-start HTTP 500s). It still needs the same `captureException` work in `turn.ts`.
- **Do not** upgrade to Pro only for alerts. D and E add at least $20/month and still miss failed turns without extra work. Pro becomes necessary later for a different reason: the Hobby rule of "personal or non-commercial use", once the beta takes payment.

## Decision needed from the owner

1. **(Recommended)** Uptime monitor on `/` + DB check every 15 min (reads `failure_ref`, incidents, killed turns, Library runs) that reports to a Better Stack heartbeat. Stay on Hobby. Cost: $0 on Vercel, plus about $6-8/month of Neon compute in the worst case (about $2 if hourly).
2. Sentry Developer (free) only: errors + 1 uptime monitor + 1 cron monitor, plus `captureException` in the turn path. No own DB check, so no alert for killed runs or incidents.
3. Both 1 and 2: the DB check now, Sentry after the first Learners are in.

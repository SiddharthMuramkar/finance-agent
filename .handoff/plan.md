# Clerk sign-in + Vercel/Clerk security + agent-run ops

(Copy of the approved plan for issue #33, for the Fedora handoff. Delete `.handoff/` before PR B merges.)

## Context
Sign-in on `main` = Better Auth (Google + Resend email link) + passcode door + app-side invites/approve/deny (17 files, 9 tables). Production never turned Better Auth on (no GOOGLE_*/BETTER_AUTH_*/RESEND env there), so production runs on passcodes only. Owner wants sign-in outsourced to Clerk, firewall + bot protection on Vercel and Clerk, and the agent (not the owner) running Vercel, Clerk, GitHub and CI/CD setup from now on. Wayfinder (#2, #23) decided and partly built Better Auth sign-in + BotID-on-sign-in; Clerk supersedes those parts. Other #23 parts (caps, alerts, gates code) stay with Wayfinder; this work does not touch the `wip2-hard-*` worktrees.

Found 2026-11-15: `value-it.xyz` DNS is on Vercel nameservers (agent can add Clerk records). Firewall = defaults only. 6 stale preview DB env vars (Neon integration; branches `feat/21-signal-models`, `docs/architecture`, `chore/tracker-setup`) flagged "readable-secret".

## Decisions (owner, 2026-11-15)
- Clerk supersedes Better Auth + passcode for real people. Direct clerk.com account (owner's existing). **Free plan** now, Pro later.
- Sign-in **Google + email link**. Sign-up = Clerk **Waitlist** mode (spec's join → pending → approve; owner approves in Clerk; Clerk sends the "you're in" email). Resend not needed.
- Admin = Clerk `publicMetadata.role="admin"` via session claim.
- **Fresh start**: no user migration; after Clerk is live, snapshot then delete old auth tables + old Learners and history.
- Agent gets full Vercel access (in practice: owner ran `vercel login`; no token). Prod deploys stay **Git-only** (merge to `main`). No Vercel token in GitHub (Git integration already deploys, free).
- AI crawlers: allow, log only.
- Agent's call (override at approval): passcode door stays **only as test/tools door** (local + Playwright; production refuses it, as #15 B). Gain: 38 e2e specs + CI stay offline, free, no Clerk keys in CI. Give up: one extra branch in the proxy. Clerk is fully off in the test bed.

## Phase 0 — Owner one-time steps (only what the agent cannot do)
1. `! clerk auth login` (browser) — after agent installs the CLI.
2. Vercel login (done on the Mac via `vercel login`).
3. Team is on Pro (confirmed).
4. Google Cloud Console: OAuth web client for Clerk prod (agent gives exact redirect URI from `clerk deploy`); paste id/secret into the `clerk deploy` prompt.

## Phase 1 — Tooling + tracking (agent) — DONE
- `npm i -g clerk`; upgrade `vercel` CLI.
- Claude Code: allow `vercel`, `clerk`; user-level deny narrowed to risky Vercel commands only (`narrow-vercel-deny.mjs`).
- Issue #33. Branches without `/`: `feat-33-clerk-prep`, `feat-33-clerk-cutover`, `feat-33-clerk-contract`.
- Issue comments on #6 #10 #14 #15 #19 #23 #31 posted.
- GitHub: Dependabot alerts on.

## Phase 2 — Clerk app (agent via CLI) — DONE on dev
- Clerk app `app_3M88tftDykg1fsszyw09LAaHwPD`, dev instance `ins_3M88tm4LhTKkJ8vuoawBD6mCQEx`. Dev keys go in `.env.local` via `clerk env pull --file .env.local`.
- `clerk config patch` (dev; prod in Phase 4): Waitlist mode; Google; email link; passwords off; sign-up bot protection on; session-token claims `metadata` (`{{user.public_metadata}}`), `email`, `first_name`. Patch body: `.handoff/clerk-patch.json`.

## Phase 3a — PR A "prep" — PR #35 open
- Expand migration: `learners.clerk_user_id text` + partial unique index `learners_one_active_per_clerk_user` (active rows, non-null). Partial because Start over keeps the id on archived + fresh rows. Test: `src/db/learners-clerk.test.ts`. `schema.ts` keeps all Better Auth tables + `auth_user_id`.
- Headers in `next.config.ts`: HSTS `max-age=63072000; includeSubDomains`, Permissions-Policy. Full CSP deferred.
- BotID Basic on `POST /api/turn` (start only, not stop; bot → 403). Needs Vercel OIDC (on).

## Phase 3b — PR B "cutover" (merge only after Phase 4 steps 1–2)
- **Gates:** new `passcodeDoorOpen(env)` (NODE_ENV≠production and no `VERCEL`) used by `/api/login`, proxy gate, `currentSignIn`, `learnerFromCookie`. New `clerkOn(env)` (both keys set and not `e2eEnabled`).
- **Proxy** `src/proxy.ts`: wrap `gate()` in `clerkMiddleware` when `clerkOn`; public: `/`, `/about`, `/sign-in/*`, `/sign-up/*`, `/join`, landing assets, POST `/api/logout`. Delete `signedInAtLogin`; drop `api/auth` from matcher.
- **Seam:** new `src/auth/identity.ts` `currentIdentity()` → `{userId,email,firstName,admin}` from `auth().sessionClaims` (test bed: `src/dev/e2e-identity.ts`). `src/auth/session.ts`: Clerk learner | passcode learner | signed out (no waiting/denied). `owner.ts` → `signedInAdmin()`. Add `types/clerk.d.ts`.
- **Linking:** new `src/auth/clerk-learner.ts` `learnerForClerkUser` (reuse `makeLearner`, `reservedNames`; never null — fallback name "Learner <hex>" so `/sign-in`↔`/study` can't loop). `learners.ts`: `startOver` copies `clerkUserId`; `learnerFromCookie` refuses Learners with a Clerk id.
- **Admin:** keep Spend + Tutor speed + links to Clerk Waitlist/Users. Emails via Clerk Backend API `users.getUserList` in `src/auth/clerk-directory.ts` (test bed: registry). `spend.ts` groups by `clerk_user_id`. Delete `admin-controls.tsx`, `done.ts`, `api/admin/*`.
- **Pages:** `app/sign-in/[[...sign-in]]` (`<SignIn/>`, or passcode form when door open), `app/sign-up/[[...sign-up]]` (waitlist invites land here), `app/join` (`<Waitlist/>`). Delete `app/login/*`; 308 `/login`→`/sign-in` in `next.config.ts`; update `/login` links (`chrome.tsx`, `home-explorable.tsx`, `home-value-levers.tsx`, `study/page.tsx`); `destination.ts` refuses auth paths as `next`. `ClerkProvider` in `layout.tsx` only when `clerkOn`. `site-analytics.tsx` strips `__clerk_*`.
- **Sign-out:** account menu → `useClerk().signOut()` for Clerk; `/api/logout` for the test door. Start over sets `fa_access` only for passcode. Settings/account copy from session claims.
- **Turn 401 after idle tab:** `turn-stream.ts` refreshes via `Clerk.session.getToken()` and retries once (Clerk tokens live 60 s).
- **Delete:** `better-auth.ts`, `email-link.ts`, `email-throttle.ts`, `google-learner.ts`, `invites.ts`, `access.ts`, `api/auth`, `scripts/invites.mjs`, `scripts/setup-sign-in.sh`, their tests, both Better Auth packages. `OWNER_NAME` and `isOwnerLearner` go (admin = claim). `OWNER_LEARNER_ID` stays (test seed only).
- **Test bed:** `dev-e2e` `{person:"owner"|"asha"}` sets signed `fa_e2e_person` cookie; `becomePerson` keeps its shape. Rewrite `e2e/sign-in.spec.ts`, `e2e/admin.spec.ts`; `/login`→`/sign-in` in home, public-header, affordance, home-value-levers specs; refresh sign-in screenshots. No `@clerk/testing` (network + secrets).
- **Source-shape tests:** `no-auth-bypass` (only `session.ts` + dev-e2e import `learnerForClerkUser`); `no-test-utils` → `no-test-identity`; new `passcode-door.test`; `scripts/check-no-e2e-in-build.mjs` also catches `__faE2ePeople`.
- **Env:** `.env.example` + Clerk keys (+ optional `CLERK_JWT_KEY`), − Google/Better Auth/Resend/`PASSCODE`. Playwright env: drop Google/Better Auth, add `NEXT_PUBLIC_CLERK_KEYLESS_DISABLED=1`, `webServer.url` → `/sign-in`. CI: no Clerk keys needed.

## Phase 4 — Production cut-over (agent; owner signs in once)
1. `clerk deploy` → prod instance on `value-it.xyz`; agent adds 5 CNAMEs (`clerk`, `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey`) via Vercel DNS; `clerk deploy status` until green. Apply Phase 2 config to prod.
2. Vercel env: live keys → Production only; test keys → Development.
3. Merge PR B → Git deploy of `main`.
4. Owner signs in with Google at `/sign-in` → agent sets `role=admin` (`clerk api`).
5. Smoke: 2nd email joins `/join` → agent approves (`waitlist_entries/{id}/invite`) → invite link lands on `/sign-up` → email-link sign-in → one Tutor turn → `/admin` 404 for them, 200 for owner → Google sign-up for an invited person works.

## Phase 5 — Vercel platform hardening — mostly DONE (see HANDOFF.md)
- Pro confirmed. OIDC on. Deployment Checks `check`, `build`, `ui` created. No Git-only prod setting exists in Vercel.
- Firewall published in **log mode** 2026-11-15 → read logs after 48 h → enforce: Bot Protection → challenge; AI Bots → log; rate limit `POST /api/turn` 20/60 s/IP → 429; other `POST /api/*` 120/60 s/IP → 429; bypass `/api/cron/*`. Attack Challenge Mode off = emergency switch.
- Env cleanup (Production): `ANTHROPIC_API_KEY`, `THESYS_API_KEY` removed. Still to remove after PR B: `PASSCODE`, `PASSCODES`, `SESSION_SECRET`. Remove 6 stale preview DB env vars + their Neon preview branches (owner "yes" at that moment).

## Phase 6 — PR C "contract" + data wipe (destructive; owner "yes" at that moment)
1. Neon snapshot of `main` (project `cool-queen-75259301`, branch `br-shy-river-b3czlpmv`).
2. **Data wipe = one-off SQL, not a migration** (a migration would delete Learner 1, which ~105 tests seed): rehearse on a Neon branch from `main` (row counts before/after), then run on `main` via Neon MCP `run_sql_transaction`: delete rows for Learners with `clerk_user_id IS NULL` from the 20 referencing tables (+ `usage` via `sessions`), then those Learners; delete `settings.signup_open`.
3. PR C migration: drop `user`, `session`, `account`, `verification`, `rate_limit`, `email_link_sends`, `invites`, `access_denials`, and `learners.auth_user_id` (remove from `schema.ts`, `db:generate`). Keep `login_failures` (test door).

## Phase 7 — Docs (agent)
- `CLAUDE.md`: short **Auth** (Clerk; seam `src/auth/session.ts` + `identity.ts`; admin = claim; test door local only), **Ops** (agent runs `vercel`/`clerk`/`gh`; prod deploy = merge to `main` only), **Security** (pointer) sections.
- New `docs/agents/platform.md`: Clerk config commands, firewall rules + Attack Mode switch, Deployment Checks, approve a waitlist entry, env var map per environment.
- ADR (asked in #31): "Clerk replaces Better Auth" (Waitlist mode, admin by Clerk role, passcode door local/test only, fresh start).

## Verification
- **PR A:** `npm run check`; vitest `learners-clerk`, `next-config`, `proxy`, `api/turn/route`; full `npm run ui:test`. After deploy: `curl -sI https://www.value-it.xyz` shows HSTS + Permissions-Policy; one real Tutor turn passes BotID.
- **PR B:** vitest session, proxy, identity, clerk-learner, admin, spend, account, account-menu, settings-view, logout, start-over, dev-e2e, admin page, site-analytics, 3 source-shape tests; e2e sign-in, admin, home, public-header, affordance, home-value-levers, then all shards; `npm run build` with no env + `check-no-e2e-in-build.mjs`. CI green (no Clerk keys). Then Phase 4 smoke list.
- **Platform:** firewall rules visible; burst 25 unauthenticated POSTs to `/api/turn` → 429 after 20 (enforce mode); Deployment Checks listed; `clerk doctor` clean; `clerk config pull` matches Phase 2.
- **PR C:** rehearsal counts match; after run, `learners` has only Clerk-linked rows; app still serves owner + test user; tests green.

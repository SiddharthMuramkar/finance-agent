# Handoff — issue #33 (Clerk replaces Better Auth + Vercel/Clerk security)

Written 2026-11-15 on the Mac; the owner continues on a Fedora laptop. **Delete `.handoff/` before PR B merges.**

- Plan (approved, full): `.handoff/plan.md`. Issue: #33 (checklist + superseding comments on #6 #10 #14 #15 #19 #23 #31).
- PR A: #35 `feat-33-clerk-prep` (clerk_user_id expand, HSTS + Permissions-Policy, BotID on POST /api/turn). Open, not merged. CI was re-run after the repo went public; check `gh pr checks 35`.
- **Continue on branch `feat-33-clerk-cutover`** (stacked on `feat-33-clerk-prep`). Its top commit is a WIP snapshot (hooks skipped, not type-checked).

## Owner rules (keep)
- Replies extremely concise. One tiny action at a time, as an exact line to paste with `!`.
- Orchestrate: subagents/workflows do reading, coding, tests; main context decides and reports.
- Ask for the owner's "yes" right before: any merge, any delete (env vars, branches, Neon), `clerk deploy`, any destructive Neon step (snapshot first). Prod deploys only by merging to `main`.
- Never print or paste secrets; don't read `.env*`.

## Where PR B stands (plan Phase 3b)
WIP commit holds the **core seam, part-written and untested**: `src/auth/{gates,identity,clerk-learner}.ts` (+ tests), `src/dev/e2e-identity.ts`, `types/`, edits to `session.ts`, `owner.ts`, `learners.ts`, `proxy.ts`, `destination.ts`, `api/login`, admin + login files. Next agent: run `npx tsc --noEmit` and the touched vitest files first, finish the core, then:
1. Slice **pages + UI** (sign-in/sign-up/join pages, `/login` 308, links, ClerkProvider when `clerkOn`, sign-out, turn-stream token refresh).
2. Slice **admin** (`clerk-directory.ts`, spend by `clerk_user_id`, delete `api/admin/*`, `admin-controls.tsx`, `done.ts`).
3. Slice **removal + test bed** (delete Better Auth files + packages, `.env.example`, Playwright env, dev-e2e person cookie, e2e specs, source-shape tests).
4. Integrate (full check, vitest, `next build` with no env + `scripts/check-no-e2e-in-build.mjs`, Playwright) → 3-lens adversarial review (security, correctness, tests) → fix → push → open PR B (do not merge).
Then Phase 7 docs into PR B: `CLAUDE.md` Auth/Ops/Security, `docs/agents/platform.md`, ADR "Clerk replaces Better Auth".

Note: the Mac worktree for `feat-33-clerk-prep` also had an uncommitted `clerk init` scaffold (ClerkProvider in layout, sign-in/sign-up pages). It was not pushed; PR B replaces it.

## Platform state (live)
- Repo is **public** (private Actions minutes ran out). Secret scanning, push protection and Dependabot alerts on.
- Vercel team `acme-ef4b` is Pro; project `prj_GhCV5t8pT2vuRQQo0hlnImPWLlAx`. OIDC on (team issuer).
- Firewall **published in log mode** 2026-11-15: cron bypass (path `/api/cron/` + vercel-cron UA + `x-vercel-cron-schedule` header), Bot Protection = log, AI crawlers = log, POST `/api/turn` 20/60 s per IP (log), POST `/api/*` 120/60 s per IP (log). Rule bodies: `.handoff/platform/`. **On or after 2026-11-17:** read firewall logs, then enforce (bot → challenge, rate limits → 429). Publishing needs the owner (`vercel firewall publish … --confirm-name finance-agent --effects-digest <digest>`; agents get `userActionRequired`).
- Deployment Checks `check`, `build`, `ui` created (block the prod alias, 3600 s timeout). Risk: if `ui` is red on `main`, prod deploys are held — fix `ui`, or PATCH that check to `blocks: "none"`. Bodies: `.handoff/platform/dc-*.json`.
- Vercel has no "prod only from Git" setting; the agent's CLI deny list covers it.
- Env: `ANTHROPIC_API_KEY` removed from Production (Preview copy still there; owner not yet asked), `THESYS_API_KEY` removed. After PR B: remove `PASSCODE`, `PASSCODES`, `SESSION_SECRET`. Later (owner yes): 6 stale preview `DATABASE_URL*` vars for branches `feat/21-signal-models`, `docs/architecture`, `chore/tracker-setup` + their Neon branches.

## Clerk state
- App `app_3M88tftDykg1fsszyw09LAaHwPD`, dev instance `ins_3M88tm4LhTKkJ8vuoawBD6mCQEx`; dev config patched with `.handoff/clerk-patch.json` (Waitlist, Google, email link, no password, session claims). `captcha_enabled` still reads false after `clerk security fix` — re-check with `clerk config pull`.
- Prod instance not created (Phase 4; needs owner's Google OAuth client + "yes" for `clerk deploy`).

## Fedora setup (one line at a time for the owner)
1. `git fetch && git switch feat-33-clerk-cutover && npm ci`
2. `npm i -g clerk vercel` then `! clerk auth login` and `! vercel login`
3. `clerk link` (app above), then `clerk env pull --file .env.local` (dev keys; gitignored)
4. Claude Code on Fedora: allow `Bash(vercel *)`, `Bash(clerk *)` in project `.claude/settings.local.json`; if a user-level deny on `Bash(vercel *)` exists, run `node .handoff/narrow-vercel-deny.mjs` (narrows it to deploy/prod/promote/rollback/rm).
5. The Mac-only RAM gate (`heavy.sh`) does not exist there; keep vitest `--maxWorkers=2`, Playwright `--workers=1` if RAM is tight.

## Gotchas met
- Vercel MCP returns 403 on firewall writes; use the `vercel firewall` CLI (staged drafts) or `vercel api`.
- Vercel CLI destructive commands need `--confirm-name`; `--yes` is refused for agents.
- On the Mac a read-jail hook blocked paths outside `~/value-it` (and jq `//`); may not exist on Fedora.

## Suggested skills
- `workflow-authoring` (owner uses "ultracode": orchestrate with workflows)
- `clerk-nextjs-patterns`, `clerk-cli`, `clerk-custom-ui` (sign-in/sign-up/waitlist pages)
- `vercel:vercel-firewall`, `vercel:vercel-cli`, `vercel:env-vars`
- `mattpocock-skills:tdd`, `code-review`, `mattpocock-skills:pr`
- `mattpocock-skills:domain-modeling` (the ADR), `mattpocock-skills:writing-for-agents` (CLAUDE.md)

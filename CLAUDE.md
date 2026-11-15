## Agent skills

### Issue tracker

GitHub Issues on SiddharthMuramkar/finance-agent via `gh`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

### Specs

Product specs live in `docs/specs/`. Current: `docs/specs/value-it-signal-spec.md` (Value It Signal).

## Auth

- Clerk signs real people in (issue #33; ADR 0017 "Clerk replaces Better Auth"). Production: email link only for now, Google later. Sign-up is Clerk's Waitlist: `/join` (Waitlist), `/sign-up` (an invitation lands here), `/sign-in`. The old `/login` answers 308 to `/sign-in`.
- The seam: `src/auth/session.ts` (`currentSignIn`: a Clerk account, the passcode door, or signed out) over `src/auth/identity.ts` (`currentIdentity`, read from the session token's claims). Every page and route asks here; the proxy (`src/proxy.ts`) only lets the request through.
- `learnerForClerkUser` (`src/auth/clerk-learner.ts`) makes or finds an account's Learner. Only `session.ts` and the test bed's `dev-e2e` route may import it (`src/auth/no-auth-bypass.test.ts`).
- Admin = Clerk `publicMetadata.role: "admin"`, read from the session claim (`signedInAdmin`, `src/auth/owner.ts`). Never a passcode, an env var or a Learner name.
- `clerkOn(env)` (`src/auth/gates.ts`): both Clerk keys set and not the test bed. While it is off, nothing loads or calls Clerk.
- The passcode door (`PASSCODES`, `/api/login`) is local and test only: `passcodeDoorOpen(env)` is false in production and on Vercel.
- Test bed: Clerk is off; `POST /api/dev-e2e {person: "owner" | "asha"}` sets a signed `fa_e2e_person` cookie in place of a Clerk session (`src/dev/e2e-identity.ts`). CI needs no Clerk keys.

## Ops

- The agent runs `vercel`, `clerk`, `gh` and `neon` from the CLI. Commands, rule bodies and the env var map: `docs/agents/platform.md`.
- Production deploys only by merging to `main` (Git integration). Never `vercel --prod`, promote or rollback without the owner's yes.
- Ask the owner first for any merge, any delete, `clerk deploy`, a firewall publish, and any change to Vercel env, Clerk config, DNS or Neon.

## Security

- Platform security (Vercel Firewall, Attack Mode, BotID on `POST /api/turn`, Clerk bot protection, Deployment Checks) is in `docs/agents/platform.md`.
- The browser test bed never reaches a production build: `node scripts/check-no-e2e-in-build.mjs` after `next build`, and `src/auth/no-test-identity.test.ts`.
- Never print or commit secrets. Pipe a secret from one CLI into another; never echo it.

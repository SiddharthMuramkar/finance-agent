# Platform: Clerk, Vercel, env vars

How the agent runs the platform for Value It (issue #33). The agent uses the CLIs; the owner logs them in once and says "yes" before anything that changes production (see `CLAUDE.md`, Ops). Everything below is names, ids and rule bodies: no secrets.

## Ids

| What | Id |
|---|---|
| Vercel team (scope) | `acme-ef4b` |
| Vercel project | `finance-agent`, `prj_GhCV5t8pT2vuRQQo0hlnImPWLlAx` |
| Clerk app | `app_3M88tftDykg1fsszyw09LAaHwPD` |
| Clerk dev instance | `ins_3M88tm4LhTKkJ8vuoawBD6mCQEx` |
| Clerk prod instance | `ins_3M8hIbKUzewrzjDR04aMaWrTL82` (`clerk deploy`, 2026-11-15) |
| Neon project / main branch | `cool-queen-75259301` / `br-shy-river-b3czlpmv` |
| Production domain | `value-it.xyz` (DNS on Vercel nameservers) |

Vercel commands below take `--scope acme-ef4b --project prj_GhCV5t8pT2vuRQQo0hlnImPWLlAx` (shortened to `$S`) when the folder is not linked.

## Clerk

### Config

The production config the app expects (applied to prod on 2026-11-15). Email link only, Google off (owner, 2026-11-15):

```json
{
  "auth_access_control": { "sign_up_mode": "waitlist" },
  "auth_attack_protection": { "bot_protection": { "captcha_enabled": true, "captcha_widget_type": "smart" } },
  "auth_email": {
    "used_for_sign_in": true,
    "used_for_sign_up": true,
    "required_for_sign_up": true,
    "verify_at_sign_up": true,
    "sign_in_strategies": ["email_link"],
    "verification_strategies": ["email_link"]
  },
  "auth_password": { "enabled": false, "required": false },
  "connection_oauth_google": { "enabled": false },
  "paths": { "sign_in": "/sign-in", "sign_up": "/sign-up", "waitlist": "/join" },
  "session": {
    "claims": {
      "metadata": "{{user.public_metadata}}",
      "email": "{{user.primary_email_address}}",
      "first_name": "{{user.first_name}}"
    }
  }
}
```

- **Dev differs in one key:** it keeps Google on (`"connection_oauth_google": { "enabled": true, "authenticatable": true }`, Clerk's shared test client). Never copy dev's Google setting to prod.
- **Google in prod, later:** only after the owner's Google OAuth client exists (redirect URI from `clerk deploy`) and its id and secret are in Clerk. Then patch `{"connection_oauth_google": {"enabled": true, "authenticatable": true}}` to prod (owner's yes). `/sign-in` needs no change: Clerk's card offers whatever the instance has on.
- **Paths** are per instance (`clerk deploy` does not clone them). Without them, the links in Clerk's own emails (Waitlist invitations) open the Account Portal on `accounts.value-it.xyz`, not `/sign-up`.
- **Names:** the email-link sign-up asks for no name, so `first_name` is usually empty; the app then names the Learner from the email address (`nameFromEmail` in `src/auth/clerk-learner.ts`). Turning on Clerk's first-name field at sign-up (owner's call) would give the first name instead.
- The session claims are what `src/auth/identity.ts` reads: `metadata.role` (admin), `email`, `first_name` (snake case). Change them only together with that file and `types/clerk.d.ts`.
- `captcha_enabled` read `false` after `clerk security fix` on dev. Check it with `clerk config pull`.

Commands (save the body above to a file outside the repo, e.g. `/tmp/clerk-patch.json`):

```sh
clerk config pull --instance prod                     # read; compare with the body above
clerk config patch --instance prod --file /tmp/clerk-patch.json --dry-run
clerk config patch --instance prod --file /tmp/clerk-patch.json   # owner's yes first
clerk doctor                                          # integration health
clerk security                                        # audit against Clerk's recommendations
clerk env pull --file .env.local                      # dev keys for local work (gitignored; chmod 600)
clerk deploy status --wait                            # prod DNS, SSL, email DNS, OAuth
```

`clerk deploy` (makes the prod instance, prints 5 CNAMEs: `clerk`, `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey`) needs the owner's yes. The agent then adds the CNAMEs in Vercel DNS.

### People

- **Let someone in from the Waitlist** (prod):
  ```sh
  clerk api /waitlist_entries --instance prod                     # find the entry id (status pending)
  clerk api /waitlist_entries/<entry_id>/invite -X POST --instance prod --yes
  ```
  Clerk emails the invitation; it lands on `/sign-up` (the `paths` above). `/waitlist_entries/<entry_id>/reject` refuses one. The owner can do the same in the Dashboard (Users → Waitlist); `/admin` links there.
- **Take access away**: ban the user. `clerk api /users/<user_id>/ban -X POST --instance prod --yes` (`/unban` undoes it). `/admin` marks a banned person "Access removed"; their past spend stays.
- **Make the owner admin** (once, after their first sign-in):
  ```sh
  clerk users list --instance prod
  clerk api /users/<user_id>/metadata -X PATCH -d '{"public_metadata":{"role":"admin"}}' --instance prod --yes
  ```
  The claim reaches the app with the next session token (tokens live 60 s).

## Vercel

### Firewall

Published in **log** mode on 2026-11-15. Plan: on or after 2026-11-17 read the logs (`vercel firewall overview $S`, `vercel firewall traffic list $S`), then enforce: Bot Protection → challenge (`vercel firewall rules update bot-protection --action challenge --yes $S`), and the two rate limits → 429 (in each body below, `rateLimit.action` from `"log"` to `"rate_limit"`, Vercel's 429; `"deny"` would answer 403; then `vercel firewall rules update "<name>" --data "$(cat <file>)" --yes $S`). AI bots stay on log (owner: allow, log only).

| Rule | What | Action now |
|---|---|---|
| Bypass Vercel Cron (first) | `/api/cron/` with the `vercel-cron/` user agent and the `x-vercel-cron-schedule` header; the route also checks `CRON_SECRET` | bypass |
| Bot Protection (managed) | known bad bots | log |
| AI Bots (managed, `ai-crawlers`, `ai-assistants`) | AI crawlers | log |
| Rate limit POST /api/turn | 20 per 60 s per IP | log |
| Rate limit POST /api/* | 120 per 60 s per IP, not `/api/turn`, not `/api/cron/` | log |

Rule bodies (`vercel firewall rules add --data "$(cat <file>)" --yes $S`):

```json
{
  "name": "Bypass Vercel Cron",
  "description": "Vercel Cron (UA vercel-cron/, x-vercel-cron-schedule) to /api/cron/; route also checks CRON_SECRET",
  "active": true,
  "conditionGroup": [
    {
      "conditions": [
        { "type": "path", "op": "pre", "value": "/api/cron/" },
        { "type": "user_agent", "op": "pre", "value": "vercel-cron/" },
        { "type": "header", "op": "ex", "key": "x-vercel-cron-schedule" }
      ]
    }
  ],
  "action": { "mitigate": { "action": "bypass" } }
}
```

```json
{
  "name": "Rate limit POST /api/turn",
  "description": "20 per 60s per IP; log only (tune before 429)",
  "active": true,
  "conditionGroup": [
    {
      "conditions": [
        { "type": "method", "op": "eq", "value": "POST" },
        { "type": "path", "op": "eq", "value": "/api/turn" }
      ]
    }
  ],
  "action": {
    "mitigate": {
      "action": "rate_limit",
      "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 20, "keys": ["ip"], "action": "log" }
    }
  }
}
```

```json
{
  "name": "Rate limit POST /api/*",
  "description": "120 per 60s per IP, excl /api/turn and /api/cron/; log only",
  "active": true,
  "conditionGroup": [
    {
      "conditions": [
        { "type": "method", "op": "eq", "value": "POST" },
        { "type": "path", "op": "pre", "value": "/api/" },
        { "type": "path", "op": "eq", "value": "/api/turn", "neg": true },
        { "type": "path", "op": "pre", "value": "/api/cron/", "neg": true }
      ]
    }
  ],
  "action": {
    "mitigate": {
      "action": "rate_limit",
      "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 120, "keys": ["ip"], "action": "log" }
    }
  }
}
```

Managed rules and order:

```sh
vercel firewall rules update bot-protection --action log --yes $S
vercel firewall rules update ai-bots --category ai-crawlers --action log --yes $S
vercel firewall rules update ai-bots --category ai-assistants --action log --yes $S
vercel firewall rules move "Bypass Vercel Cron" --first --yes $S
vercel firewall diff $S                         # read the staged draft
vercel firewall status $S                       # what runs now, in order
```

Every `rules` change is a **draft** until published. Only the owner publishes (agents get `userActionRequired`):
`vercel firewall publish --confirm-name finance-agent --effects-digest <digest from the preview> $S`. `vercel firewall discard $S` drops a draft (owner's yes).

**Emergency switch, Attack Mode** (challenges every visitor; takes effect at once, no publish):
`vercel firewall attack-mode enable $S` / `vercel firewall attack-mode disable $S`. Off by default; turn it on only under attack, and tell the owner.

Gotchas: the Vercel MCP answers 403 on firewall writes, so use the CLI. Destructive Vercel CLI commands need `--confirm-name`; `--yes` is refused for agents.

### BotID

`POST /api/turn` (the start of a Tutor turn, not stop) checks BotID Basic; a bot gets 403. It needs Vercel OIDC, which is on for the team.

### Deployment Checks

Three checks hold the production alias until GitHub's CI jobs of the same name pass (each waits up to 3600 s): `check`, `build`, `ui`. Body (the same for each, with its name):

```json
{
  "name": "check",
  "requires": "build-ready",
  "targets": ["production"],
  "blocks": "deployment-alias",
  "timeout": 3600,
  "source": { "kind": "git-provider", "provider": "github", "externalCheckName": "check" }
}
```

```sh
vercel api /v2/projects/prj_GhCV5t8pT2vuRQQo0hlnImPWLlAx/checks --scope acme-ef4b                 # list
vercel api /v2/projects/prj_GhCV5t8pT2vuRQQo0hlnImPWLlAx/checks -X POST --input <body.json> --scope acme-ef4b
```

Risk: if `ui` is red on `main`, production deploys wait. Fix `ui`, or (owner's yes) PATCH that check to `"blocks": "none"`.

Vercel has no "production only from Git" setting: the agent's CLI deny list (no `vercel --prod`, promote, rollback, rm) keeps production Git-only.

## Env vars

Names only. Read them with `vercel env ls $S` (never pull Production; its values are Sensitive and cannot be read anyway).

| Name | Production | Preview | Development / local | CI and test bed |
|---|---|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | live keys (go-live) | none: Clerk off, sign-in says it is off | test keys (`clerk env pull --file .env.local`) | none: Clerk is off |
| `CLERK_JWT_KEY` (optional) | prod PEM key | none | dev PEM key | none |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon main | Neon preview branches | Neon dev branch | none: PGlite in memory |
| `OPENAI_API_KEY` | yes | none | own key, if needed | none: scripted Tutor |
| `VOYAGE_API_KEY` | yes | yes | optional | none |
| `CRON_SECRET` | yes | none | none | none |
| `NEON_API_KEY`, `NEON_PROJECT_ID` | yes (snapshot gate) | none | none | none |
| `PASSCODES`, `SESSION_SECRET` | **remove once PR C is live** (the door is shut there) | `SESSION_SECRET` today: remove | local passcode door | `playwright.config.ts` sets them |
| `PASSCODE` | **remove once PR C is live** (opens nothing now) | remove | none | none |
| `ANTHROPIC_API_KEY` | removed | still there: owner to decide | none | none |
| `BETTERSTACK_HEARTBEAT_URL` | to add (owner's Better Stack account) | none | none | none |

Not needed any more: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM` (never set in Production).

Stale (owner's yes to delete): the preview `DATABASE_URL*` for branches `feat/21-signal-models`, `docs/architecture`, `chore/tracker-setup`, and their Neon preview branches.

Set a secret by piping it from one CLI into the other, never through the screen, for example
`clerk env pull --instance prod --print | <pick the key> | vercel env add CLERK_SECRET_KEY production --sensitive $S`.

## Go-live order (Phase 4 of issue #33)

1. `clerk deploy --domain value-it.xyz` (owner's yes) → add the 5 CNAMEs → `clerk deploy status --wait` → apply the config above to prod (Google off, paths). Done 2026-11-15.
2. Before the merge, on a developer's machine with dev keys (`clerk env pull --file .env.local`, `npm run dev`): one email-link sign-in finishes on `/study` with no reload (the proxy lets Clerk's sign-in Server Action through: `isClerkSignInAction` in `src/proxy.ts`), and the Clerk card looks right.
3. Live keys into Vercel Production; test keys into Development.
4. Merge PR B (owner's yes) → Git deploy of `main`.
5. Waitlist mode blocks everyone's own sign-up, the owner's too: pre-create the owner's user in Clerk (or invite their Waitlist entry). Owner signs in at `/sign-in` → set `role: "admin"` (above).
6. Smoke: a second email joins on `/join` → invite it → the link lands on `/sign-up` → email-link sign-up finishes on `/study` with no reload → one Tutor turn → `/admin` is 404 for them and 200 for the owner.
7. Remove `PASSCODE`, `PASSCODES`, `SESSION_SECRET` from Production and Preview (owner's yes), once PR C is live: `docs/runbooks/wipe-pre-clerk.md`, step C7.

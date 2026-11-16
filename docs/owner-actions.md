# Owner actions

These steps need the owner. The agent cannot do them: they need your accounts, your email or your judgement. Each step says why, when and how. This file holds no secrets. Never paste a secret into chat, into an issue or into git.

Written 2026-11-15, when map #2 closed. Updated 2026-11-16, after the merges of 2026-11-15, the production Library load and the production wipe. Tick a box when a step is done.

## Checklist

| # | Step | When |
|---|---|---|
| 1 | [Enforce the firewall](#1-enforce-the-firewall) | On or after 2026-11-17 |
| 2 | [Better Stack account and heartbeat URL](#2-better-stack-account-and-heartbeat-url) | Before the first invite |
| 3 | [Sign in once as admin](#3-sign-in-once-as-admin) | Now (Clerk is live) |
| 4 | [Waitlist smoke test with a 2nd email](#4-waitlist-smoke-test-with-a-2nd-email) | Right after step 3 |
| 5 | [Google OAuth client for Clerk production](#5-google-oauth-client-for-clerk-production) | When you add Google sign-in |
| 6 | [OpenStax reuse request](#6-openstax-reuse-request) | Now |
| 7 | [Email to Damodaran](#7-email-to-damodaran) | Now |
| 8 | [Lawyer check on CC BY](#8-lawyer-check-on-cc-by) | Before any paid launch |
| 9 | [OpenAI hard spend limit, old key revoked](#9-openai-hard-spend-limit-old-key-revoked) | Now |
| 10 | [2nd copy of the backups on your laptop](#10-2nd-copy-of-the-backups-on-your-laptop) | Now, then after each backup run |
| 11 | [Decide on the 2 unused `ANTHROPIC_API_KEY` copies](#11-decide-on-the-2-unused-anthropic_api_key-copies) | Any time |
| 12 | [Tune the spend caps](#12-tune-the-spend-caps) | After the first real turns |
| 13 | [Write the owner content](#13-write-the-owner-content) | Before the first invite |
| 14 | [Run the Waitlist](#14-run-the-waitlist) | Before the beta starts, then on a fixed rhythm |
| 15 | [Decide the licence label on 16 citations](#15-decide-the-licence-label-on-16-citations) | Before any paid launch |
| 16 | [Revoke the eval Voyage key, delete the 2 env files](#16-revoke-the-eval-voyage-key-delete-the-2-env-files) | When the evals end (the Library load and the wipe ended on 2026-11-16) |
| 17 | [Delete the export of the old Learners](#17-delete-the-export-of-the-old-learners) | About 2026-12-16 |
| 18 | [Remove the passcode env vars from Production](#18-remove-the-passcode-env-vars-from-production) | After PR C is live |
| 19 | [Decide on link underlines and pill chips](#19-decide-on-link-underlines-and-pill-chips) | Any time |
| 20 | [Decide the price of a step cut short](#20-decide-the-price-of-a-step-cut-short) | With step 12 |

Also: [Commands the agent was not allowed to run](#commands-the-agent-was-not-allowed-to-run) and [Notes (no action)](#notes-no-action).

## 1. Enforce the firewall

- [ ] Done

**Why.** The Vercel firewall rules went live in **log** mode on 2026-11-15. Log mode only records hits. It blocks nothing. Two days of logs show if a rule would hit real people.

**When.** On or after 2026-11-17.

**How.**

1. The agent reads the logs and reports. It uses `vercel firewall overview` and `vercel firewall traffic list` (read-only).
2. If no real person hits a rule, the agent stages these drafts:
   - Bot Protection: log → **challenge**.
   - Rate limit `POST /api/turn`, 20 per 60 s per IP: log → **429**.
   - Rate limit `POST /api/*` (not `/api/turn`, not `/api/cron/`), 120 per 60 s per IP: log → **429**.
   - No change: AI Bots stay on log. The "Bypass Vercel Cron" rule stays first.
3. The agent shows you `vercel firewall diff` and gives you the effects digest from the publish preview.
4. Only you can publish. Run this in a terminal on the VPS:

   ```sh
   vercel firewall publish --scope <team> --project finance-agent --confirm-name finance-agent --effects-digest <digest>
   ```

   `<team>` is the Vercel team slug (`vercel teams ls`). `<digest>` comes from step 3.
5. The agent checks: 25 fast `POST /api/turn` calls get 429 after the 20th.

Emergency switch: Attack Challenge Mode in the Vercel dashboard (Firewall). The rule bodies are in `docs/agents/platform.md` (section "Firewall").

## 2. Better Stack account and heartbeat URL

- [ ] Done

**Why.** A health check runs every 15 minutes (`/api/cron/health`, decision #12). It sends an "OK" ping to a Better Stack heartbeat. Without `BETTERSTACK_HEARTBEAT_URL` the check runs but sends nothing, so nobody gets an alert.

**When.** Before the first invite.

**How.**

1. Make a free account at betterstack.com (Uptime). It needs your email.
2. Add a **heartbeat**: period 15 minutes, grace 10 minutes. Copy its URL.
3. Add an **uptime monitor** on `https://www.value-it.xyz/`.
4. Set the alerts to your email (and the phone app, if you want).
5. Put the heartbeat URL into Vercel Production as a secret. Run this on the VPS and paste the URL when it asks:

   ```sh
   vercel env add BETTERSTACK_HEARTBEAT_URL --environment production --sensitive --scope <team> --project finance-agent
   ```

   No folder on the VPS is linked to Vercel, so the command names the team and the project. `<team>` is the same as in step 1.

6. The value reaches the live site at the next production deploy (the next merge to `main`). Within 15 minutes after that deploy, Better Stack shows the heartbeat as "up".

## 3. Sign in once as admin

- [ ] Done

**Why.** In Clerk, admin is `publicMetadata.role = "admin"` on your user. `/admin` needs it. Sign-up is a Waitlist, and in Waitlist mode `/sign-in` works only for a user who already exists. So on 2026-11-15 you made your Clerk user on production, with the admin role, in `owner-batch.sh` (see [Commands the agent was not allowed to run](#commands-the-agent-was-not-allowed-to-run)). You do not join the Waitlist.

**When.** Now. Clerk is live in production since PR #48 merged. On 2026-11-16 the wipe (`contract-run.sh`) found 1 Learner with a Clerk user: yours. So your first sign-in worked. Tick the box when `/admin` loads (How, point 3).

**How.** Email link only for now. Google comes later (step 5).

1. Open `https://www.value-it.xyz/sign-in`. Type the email of your Clerk user.
2. Open the email from Clerk. Its link signs you in.
3. Open `/admin`. It must load.
4. Tell the agent "signed in". If `/admin` shows "not found" (404), tell the agent. It checks the role with the Clerk CLI.

## 4. Waitlist smoke test with a 2nd email

- [ ] Done

**Why.** It proves the real door for a new person: join, approval, invite email, sign-in, one Tutor turn, and no admin rights.

**When.** Right after step 3.

**How.** Use a 2nd email address that you own.

1. In a private browser window, open `https://www.value-it.xyz/join`. Join with the 2nd email.
2. Tell the agent. It approves the waitlist entry. (You can also click it in the Clerk dashboard, Waitlist.)
3. Open the "you're in" email. Its link opens `/sign-up`. Finish with the email link.
4. Ask the Tutor one question. A reply must come.
5. Open `/admin` as this user. It must show "not found" (404).
6. Tell the agent the result. When Google is on (step 5), do the test again with Google.

## 5. Google OAuth client for Clerk production

- [ ] Done

**Why.** Clerk production needs your own Google OAuth client for "Sign in with Google". It belongs to your Google account, so only you can make it. Decision 2026-11-15: email link first, Google later.

**When.** When you decide to add Google sign-in.

**How.**

1. The values below come from `clerk deploy` on the production instance (2026-11-15):
   - Authorized redirect URI: `https://clerk.value-it.xyz/v1/oauth_callback`
   - Authorized JavaScript origins: `https://value-it.xyz` and `https://www.value-it.xyz`
2. Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
3. Authorized JavaScript origins: add the 2 origins from step 1. Authorized redirect URIs: add the URI from step 1. Create.
4. Google Auth Platform → Audience: user type **External**, publishing status **In production**. ("Testing" allows only 100 test users.) Google can ask to verify the app name and logo.
5. Enable Google on the Clerk **production** instance. Today Google is off there. Clerk dashboard → SSO connections → Google: turn it on, choose custom credentials. Paste the Client ID and the Client Secret only there (or into the Clerk prompt). Or tell the agent, and it turns Google on; you still paste the 2 values yourself.
6. Do step 4 again with a Google account.

## 6. OpenStax reuse request

- [ ] Done

**Why.** Decisions #26 and #27. The web page of OpenStax *Principles of Finance* 2nd edition forbids use in "generative AI offerings" without written permission, and commercial use needs permission. Decision #27 moved the Library to the 1st edition, which is CC BY 4.0 (GitHub commit `3b7fc65c52`). That move is issue #38 (PR #43, merged 2026-11-15). The production Library load passed on 2026-11-16 (`prod-load.sh`, see [Scripts you ran](#scripts-you-ran)). Since then the live Library uses the 1st edition only. The 2nd edition is out of the Library, and out of `scripts/library/sources.json`, so no later load brings it back. The owner decided that the reuse request goes out anyway.

**When.** Now. It must be done before any paid launch. Name the 1st edition in the form.

**How.** Fill in the OpenStax reuse request form: <https://riceuniversity.tfaforms.net/52>. Points to include are in [Appendix A](#appendix-a-openstax-reuse-request-points).

## 7. Email to Damodaran

- [ ] Done

**Why.** Decision #26. His blog has no licence. His site rule ("no resale") is not clear for a paid tutor. His material answers 11 of the 78 Library score questions.

**When.** Now.

**How.** Send the draft in [Appendix B](#appendix-b-draft-email-to-damodaran) from your own email. Fill in `[email]` and `[link to Value It]`. Tell the agent the reply. If he says no, the blog leaves the Library.

## 8. Lawyer check on CC BY

- [ ] Done

**Why.** Decisions #27 and #29. CC BY 4.0 permits commercial use, but a lawyer must confirm that it covers a paid tutor. Any paid part makes the whole site commercial. Then Yale ECON 251/252 and the Damodaran blog must leave or get permission. The research is not legal advice.

**When.** Before any paid launch. No paid launch is planned now (#29 is out of scope).

**How.** Give the lawyer these 2 files:

- `research/library-licences.md` on [`research-library-licences`](https://github.com/SiddharthMuramkar/finance-agent/blob/research-library-licences/research/library-licences.md)
- `research/new-sources.md` on [`research-new-sources`](https://github.com/SiddharthMuramkar/finance-agent/blob/research-new-sources/research/new-sources.md)

Each branch becomes a tag with the same name, so the links keep working.

Ask 4 questions:

1. Can a paid tutor store, embed, show and quote the CC BY 4.0 1st edition of OpenStax?
2. Does the AI clause on the openstax.org book page bind a copy taken from GitHub under CC BY?
3. Are the credit lines that Value It shows enough?
4. Is the licence label on the 16 citations correct (step 15)?

## 9. OpenAI hard spend limit, old key revoked

- [ ] Done

**Why.** Decisions #3 and #13. The OpenAI project limit is the outer net under the app's spend caps. Only you can open the OpenAI console. The old key must not work any more.

**When.** Now.

**How.** On platform.openai.com, open the project that the Tutor uses:

1. Limits: set the monthly budget to your Tutor budget + 20% (example from #13: $450 + 20% = $540). Turn on **Enforce a hard limit**.
2. API keys: revoke every key except the one that you made on 2026-11-15 (the one in Vercel Production).
3. Tell the agent. It checks that one Tutor turn still works.

## 10. 2nd copy of the backups on your laptop

- [ ] Done

**Why.** Decision #8, option B. The Library dump must be in 2 places. The VPS is one place. If the VPS is lost, the laptop copy stays. Never put a dump in git: the Damodaran blog text is stored for private search only.

**When.** Now: `copy2` holds 2 dumps from 2026-11-15. Then after each backup run: after each Library load, and once a month. The Library load of 2026-11-16 needs a new dump first (`scripts/backup-drill.sh --redump`, a follow-up that `prod-load.sh` prints at its end). Ask the agent if it ran. Then copy again.

**How.** On the VPS, the dumps are in `/root/backups/`. The subfolder `/root/backups/copy2/` holds every dump again, each with its checksum file (`.dump.sha256`). Copy only `copy2`. On the laptop (`vps` is your SSH name for the VPS):

```sh
scp -r vps:/root/backups/copy2 ~/value-it-backups-$(date +%F)
cd ~/value-it-backups-$(date +%F)
for f in *.dump.sha256; do shasum -a 256 -c "$f"; done    # on Linux: sha256sum -c "$f"
```

Each line must end with `OK`. If a line says `FAILED`, copy again and tell the agent.

Keep the folder private (an encrypted disk, not a shared folder). `docs/backup-and-restore.md` (from the #8 PR) explains the files.

## 11. Decide on the 2 unused `ANTHROPIC_API_KEY` copies

- [ ] Done

**Why.** No code reads `ANTHROPIC_API_KEY`: the Tutor uses OpenAI now (#3). The Vercel Production copy is already removed. 2 copies are left:

- Vercel Preview. Previews are off (#11).
- A GitHub Actions secret on the repo (set 2026-11-14). No workflow reads it, on any branch or in the history.

A key that nobody uses can still leak. The 2 copies can hold different keys.

**When.** Any time.

**Options.**

- **A. Remove both (recommended).** Say yes, and the agent runs:

  ```sh
  vercel env rm ANTHROPIC_API_KEY --environment preview --confirm-name ANTHROPIC_API_KEY --scope <team> --project finance-agent
  gh secret delete ANTHROPIC_API_KEY -R SiddharthMuramkar/finance-agent
  ```

  Then, in the Anthropic console, revoke each key that nothing else uses.
- **B. Keep them.** Nothing changes.

## 12. Tune the spend caps

- [ ] Done

**Why.** Decision #13 set the caps from an estimate (about $0.05 a turn): 10 steps and 2 resumes per turn, 120 turns and $5 per Learner per day, $30 per day for everyone. Real turns give the real cost.

**When.** After the first real turns (for example, after the first week of Learners).

**How.**

1. Ask the agent for the cost numbers: the median turn and the most expensive turn (totals only, no Learner data).
2. Choose new numbers. Change them on `/admin` (the Spend caps form, from PR #36). If the form is not there, ask the agent.
3. Change the OpenAI limit (step 9) to match.

## 13. Write the owner content

- [ ] Done

**Why.** The public site shows placeholders. Only you can write these words (spec §14).

**When.** Before the first invite. The Learner quotes come later, from the first Learners.

**How.** Write them and give them to the agent:

- the founder's note (2–3 sentences)
- the contact email
- the wait-time promise (or none)
- the hero copy
- which market and currency come first
- the "not affiliated" line on About (for the valuation author that the site names): say if the wording is enough
- later, Learner quotes: real sentences from early Learners, never invented

See item 8 in `docs/roadmap.md`.

## 14. Run the Waitlist

- [ ] Done

**Why.** Sign-up is a Clerk Waitlist (#33). Nobody is approved automatically. If nobody approves, people wait and get no answer (`docs/roadmap.md`, item 9).

**When.** Choose the first people before the beta starts (target: end of November 2026). Then approve on a fixed rhythm.

**How.**

1. List the first 20 people. Send them `https://www.value-it.xyz/join`.
2. Choose a rhythm, for example twice a week.
3. On each of those days, open the Clerk dashboard, Waitlist. Approve the people you want. Clerk sends each one the "you're in" email. Or give the agent the emails to approve.
4. Decide what a person who waits hears. This ties to the wait-time promise (step 13).

## 15. Decide the licence label on 16 citations

- [ ] Done

**Why.** Sources review, finding 2 (PR #43). 16 Library citations say "Principles of Finance (CC BY 4.0)". They link to openstax.org 1st edition pages. Those pages now show CC BY-NC-SA. 7 other citations to the same pages already say CC BY-NC-SA. Only you can decide which licence claim Value It makes.

**When.** Before any paid launch. The lawyer checks your choice (step 8, question 4).

**Options.**

- **A. Relabel the 16 as CC BY-NC-SA.** This matches the 7 others and the 2nd edition labels. NC means non-commercial, so a paid launch needs permission (step 6).
- **B. Keep CC BY 4.0, and link the 16 to the CC BY GitHub commit `3b7fc65c52`.** The claim is then true. But a Learner who clicks the link gets a GitHub XML page, not a book page.

Tell the agent A or B. The agent makes the change.

## 16. Revoke the eval Voyage key, delete the 2 env files

- [ ] Done

**Why.** The Library evals used a Voyage key that you made for them, named "vps-eval". 2 folders on the VPS hold secrets for the evals and the owner-run scripts:

- `/root/projects/.evalenv`: the eval database addresses and the vps-eval key.
- `/root/projects/.prodenv`: the production database addresses and a copy of the vps-eval key (`prod-load.sh` and `contract-run.sh` use it).

A key or an address that nobody uses can still leak.

**When.** When the evals end. The production Library load and the wipe ended on 2026-11-16. The agent tells you when the evals end.

**How.**

1. In the Voyage AI dashboard, API keys: revoke the key named **vps-eval**. Revoke only that key.
2. On the VPS, delete the 2 folders:

   ```sh
   rm -rf /root/projects/.evalenv /root/projects/.prodenv
   ```

3. Tell the agent. A later eval (for example, the reranker re-test in `docs/roadmap.md`) needs a new key.

## 17. Delete the export of the old Learners

- [ ] Done

**Why.** Before the wipe, `contract-run.sh` exported the production tables to `/root/backups/pre-contract-2026-11-15.dump` (and its `.dump.sha256`), on 2026-11-16. The export holds Learner personal data. Keep it only while a rollback of the wipe can need it. It is not in `copy2`, so the laptop copy (step 10) does not hold it. Never put it in git.

**When.** About 2026-12-16 (30 days after the export).

**How.**

1. Ask the agent if a rollback still needs the export. If no, go on.
2. On the VPS:

   ```sh
   rm /root/backups/pre-contract-2026-11-15.dump /root/backups/pre-contract-2026-11-15.dump.sha256
   ```

3. Tell the agent.

## 18. Remove the passcode env vars from Production

- [ ] Done

**Why.** Clerk replaced the passcode door (ADR 0017). The door is shut in production since PR #48. `PASSCODE`, `PASSCODES` and `SESSION_SECRET` in Vercel Production open nothing now. A secret that nobody uses can still leak.

**When.** After PR C is live: PR C is merged, and its production deploy is Ready. PR C deletes the old Better Auth tables (migration 0040). The agent plans to remove the 3 vars itself. First ask the agent if it did. If yes, tick the box. You have nothing more to do.

**How.** If the vars are still there, run this on the VPS:

```sh
vercel env rm PASSCODE --environment production --confirm-name PASSCODE --scope <team> --project finance-agent
vercel env rm PASSCODES --environment production --confirm-name PASSCODES --scope <team> --project finance-agent
vercel env rm SESSION_SECRET --environment production --confirm-name SESSION_SECRET --scope <team> --project finance-agent
```

`<team>` is the same as in step 1. Then tell the agent. It checks `vercel env ls` (names only).

## 19. Decide on link underlines and pill chips

- [ ] Done

**Why.** The public site (PR #47) follows the Signal spec look. ADR 0018 (flat controls) says something different:

| Look | Signal spec §5 (the site today) | ADR 0018 |
|---|---|---|
| Text link | No underline. Underline on hover (§5.2). | In a reading area, a link is underlined. |
| Question chips | Round ends, like a pill (§5.4). | No pill ends. Never rounder than 12px. |
| Cards | 14px corners. | Never rounder than 12px. |

The site's look checks (the affordance audits) let these looks off on the Signal pages until you decide. Only you can choose the look.

**When.** Any time.

**Options.**

- **A. Keep the spec look on the public site.** The agent adds a line to ADR 0018: the public site follows spec §5; the app stays flat.
- **B. Use ADR 0018 on the public site too.** The agent underlines the text links, makes the chips and cards 12px or less, and removes the let-off from the audits.

Tell the agent A or B. The agent makes the change.

## 20. Decide the price of a step cut short

- [ ] Done

**Why.** Hardening review, finding 4 (PR #36). Sometimes a Tutor step stops before OpenAI sends its usage report: a stream fails mid-way, the stream guard stops it, or the Learner presses Stop. Then the app does not know the cost. Today the caps count each such step at a flat $0.66, the worst case (`UNPRICED_STEP_USD` in `src/tutor/quota.ts`). About 8 Stops in one day reach the $5 Learner cap. In an incident, many failed streams can reach the $30 cap for all Learners (`usd_global_day`). This is a money rule, so you decide.

**When.** With step 12, after the first real turns.

**Options.**

- **A. Keep the flat $0.66.** It never counts too little. A bad incident can stop the Tutor early.
- **B. Estimate the cost from the turn's last usage report (`lastUsage`).** It is nearer the real cost. A wrong estimate can let more money through.

Tell the agent A or B. The agent makes the change.

## Commands the agent was not allowed to run

On 2026-11-15 the Claude Code safety check (the auto-mode classifier) stopped the agent before the commands below. The agent did not retry them and did not find a way around them. Run an open one yourself in Claude Code as `! <command>`, or in a terminal on the VPS.

### Done by you

| Command the agent could not run | How it was done |
|---|---|
| `git push` from the lane agents, on every lane: hardening, CI, docs, backup, site, Clerk, sources, reranker, legacy, wrapup and architecture | At 10:45 UTC you allowed a plain `git push` (no force, no delete) in `.claude/settings.local.json`. Then the agent pushed 9 lanes. The safety check still stopped later pushes from the lane agents. You ran them in `owner-batch.sh`, `owner-batch-2.sh`, `owner-batch-3.sh` and `owner-batch-4.sh` (all in `/root/projects/`). `owner-batch-2.sh` also posted the #48 comment and set the #43 body, because both needed the push first. |
| `git push` of the #46 fix | It failed in `owner-batch.sh`: Dependabot had rebased the branch. #49 replaces #46. The agent makes the fix again in a final deps PR. |
| `git commit` of 2 doc changes: owner actions (`docs-2-wrapup`) and the reranker re-test (`feat-37-reranker`) | `owner-batch.sh`. |
| `vercel env rm` of the 2 stale Preview vars `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (branch `docs/architecture`) | `owner-batch.sh`. The other 4 of the 6 stale Preview vars were already gone. |
| Make your Clerk user on production, with the admin role (`clerk api /users`) | `owner-batch.sh`. Next: [step 3](#3-sign-in-once-as-admin). |

### Scripts you ran

These 2 scripts change production data. They need a real terminal and your typed `yes`, so you ran them, not the agent. Both are done. Each README stays next to its script: `/root/projects/prod-load-README.md` and `/root/projects/contract-run-README.md`.

- [x] **The production Library load (#38): the new sources go in, the 2e textbook goes out.** Done 2026-11-16 (`/root/projects/prod-load.sh`).
  - First: Neon snapshot `pre-library-load-2026-11-15` (`snap-curly-hall-b3zgkyik`).
  - Loaded: OpenStax *Principles of Finance* 1st edition, `openstax-principles-finance-1e` (1043 passages); `fomc-historical` (4013); `sec-amazon-1997-2000` (765); `sec-webvan-1999-2001` (749); `sec-wework-s1-2019` (801).
  - Dropped: `openstax-principles-finance-2e` (1043 passages deleted).
  - Then: credits restamped, and the new passages embedded with Voyage.
  - Score on production, keyword + Voyage vectors. The 78 original questions: hits@5 75/78 (96.2%, bar 92%), hits@1 58, MRR 0.827 (bar 0.82). **Pass.** The 12 Signal questions, open search: 9/12, MRR 0.542. Outcome-word probes: clean, 19/19. Keyword only: 71/78, MRR 0.715.
  - Logs: `/root/projects/eval-runs/2026-11-15-prod-*.txt`.
  - Rollback: `neon snapshots restore snap-curly-hall-b3zgkyik --project-id cool-queen-75259301 --target-branch br-shy-river-b3czlpmv`, then `neon snapshots finalize <restored branch id> --project-id cool-queen-75259301` (`docs/backup-and-restore.md`, Restore B). This puts ALL of production back to the snapshot time. The snapshot is older than the wipe, so it also brings back the 2 old Learners. Ask the agent first.
- [x] **The production wipe of the pre-Clerk Learners (#33).** Done 2026-11-16 (`/root/projects/contract-run.sh`).
  - First: the export `/root/backups/pre-contract-2026-11-15.dump` (step 17), and Neon snapshot `pre-wipe-contract-2026-11-15` (`snap-round-sound-b3kcyjzm`).
  - Rehearsal on the Neon branch `rehearse-wipe-2026-11-15`: the wipe and migration 0040 passed.
  - Production: 2 pre-Clerk Learners deleted, with their rows. 1 Learner is left: yours (your Clerk user).
  - Migration 0040 did not run on production. PR C runs it when it deploys.
  - Logs: `/root/projects/contract-runs/2026-11-15/`.
  - Rollback: `neon snapshots restore snap-round-sound-b3kcyjzm --project-id cool-queen-75259301 --target-branch br-shy-river-b3czlpmv --name main-restored`, then `neon snapshots finalize <restored branch id> --project-id cool-queen-75259301 --name main-before-restore`. Or tell the agent "roll back the wipe". For one table only, the agent restores it from the export into a new Neon branch. The snapshot was taken during the Library load: after the new sources went in and the 2e textbook went out, before the restamp and the embed steps. After a restore, the agent runs those 2 steps again (`prod-load.sh --from 5`).

### Not done (no step for you)

- **Install Node 24 on the VPS with nvm.** Stopped. The VPS stays on Node 22. CI and `.nvmrc` use Node 24 (#39). See `docs/roadmap.md`, item 11.
- **Download `actionlint`, a checker for the GitHub Actions files.** Stopped. The CI lane checked the job graph by hand. `src/dev/ci-workflow.test.ts` checks the gates.

### Still to do

**Delete 4 stale Neon branches.** Nothing uses them. Previews are off (#11). Your yes of 2026-11-15 covers them, but the safety check stopped the agent. Each line deletes one branch (its name is in the comment):

```sh
neon branches delete br-winter-boat-b39iqmcn --project-id cool-queen-75259301    # rag-baseline-2026-11-14
neon branches delete br-morning-brook-b3zs4na0 --project-id cool-queen-75259301  # preview/docs/architecture
neon branches delete br-twilight-snow-b3bfl3gk --project-id cool-queen-75259301  # preview/feat/21-signal-models
neon branches delete br-green-paper-b3i7otr2 --project-id cool-queen-75259301    # preview/chore/tracker-setup
```

On 2026-11-16 only the first 2 still exist. For the last 2, Neon answers "not found". That is OK.

**Eval branches: delete or let expire.**

| Branch | Made by | What to do |
|---|---|---|
| `eval-2026-11-15` (`br-billowing-salad-b37bbjon`) | The Library evals | Nothing. It expires by itself on 2026-11-18. |
| `rehearse-wipe-2026-11-15` | `contract-run.sh` (the wipe rehearsal) | Nothing. It expires by itself on 2026-11-17. |
| `g2-eval` (`br-patient-bar-b3wc46f3`) | An older eval, 2026-11-06 | It has no expiry date, and nothing in the repo names it. Ask the agent to check it. Then delete it: `neon branches delete br-patient-bar-b3wc46f3 --project-id cool-queen-75259301` |

If the safety check stops the agent again, the command comes here.

## Notes (no action)

- **Reranker (#37) is parked.** The eval of 2026-11-15 showed a gain too small to keep. PR #42 merged only the scorer flags. The numbers are in `docs/library/2026-11-15-reranker-retest.md`. The re-test after the Library grows is a follow-up in `docs/roadmap.md`.

## Appendix A. OpenStax reuse request (points)

Not a draft from the research. These are the points to put in the form, from `research/library-licences.md`:

- Who: Value It, an online valuation course. Today it is a free beta for about 20 invited Learners. A paid offer may come later.
- What: *Principles of Finance*, 1st edition (CC BY 4.0, GitHub commit `3b7fc65c52`). The live Library uses the 1st edition only, since the production Library load of 2026-11-16 (#38). Before that date it used the 2nd edition. The 2nd edition text is 99.5% the same.
- How Value It uses it: it keeps the text in a private search index, cut into passages of at most 300 words. It sends each passage to Voyage AI to make a search vector. A signed-in Learner can read a passage. The AI tutor puts passages into its prompt and quotes short parts with a credit and a link.
- What Value It does not do: it does not train a model on the book, and it does not sell the text.
- The ask: written permission for use in a generative AI offering, now in the free beta and later in a paid offer.
- Credit: OpenStax's name, a link to the source and a link to the licence, on every page that shows a passage.

## Appendix B. Draft email to Damodaran

Copied from `research/library-licences.md` on `research-library-licences` (the draft at its end). That branch becomes a tag with the same name. Do not change the facts. Fill in the 2 brackets.

> **To:** adamodar@stern.nyu.edu
> **Subject:** Permission to quote your blog and papers in a small valuation course
>
> Dear Professor Damodaran,
>
> I am building Value It, an online course that teaches valuation the way you teach it: a story first, then the numbers. Learners study real Cases, such as your Amazon valuation of 2000. An AI tutor helps them, and it quotes sources with a credit and a link.
>
> Today the course is a free beta for a small invited group. Later I want to charge Learners. Before I do, I want your permission for these uses of Musings on Markets, your papers and the spreadsheets linked from your posts:
>
> 1. Keep the text in a private search index (not public, not for sale).
> 2. Let the tutor show short passages (at most 60 words from the blog), always with your name, the title and a link to the original.
> 3. Use numbers from your spreadsheets in Cases, with credit.
>
> I will not sell your data, train a model on your work, or present your words as mine. I will remove anything you ask me to remove. I am happy to give you free access to see how it works.
>
> Is this acceptable to you? If you prefer limits (for example, links only, or the free tier only), I will follow them.
>
> Thank you for everything you share so openly.
>
> Siddharth Muramkar
> [email] · [link to Value It]

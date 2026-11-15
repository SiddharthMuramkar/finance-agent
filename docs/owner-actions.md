# Owner actions

These steps need the owner. The agent cannot do them: they need your accounts, your email or your judgement. Each step says why, when and how. This file holds no secrets. Never paste a secret into chat, into an issue or into git.

Written 2026-11-15, when map #2 closed. Tick a box when a step is done.

## Checklist

| # | Step | When |
|---|---|---|
| 1 | [Enforce the firewall](#1-enforce-the-firewall) | On or after 2026-11-17 |
| 2 | [Better Stack account and heartbeat URL](#2-better-stack-account-and-heartbeat-url) | Before the first invite |
| 3 | [Join, then the agent makes you admin](#3-join-then-the-agent-makes-you-admin) | When Clerk is live |
| 4 | [Waitlist smoke test with a 2nd email](#4-waitlist-smoke-test-with-a-2nd-email) | Right after step 3 |
| 5 | [Google OAuth client for Clerk production](#5-google-oauth-client-for-clerk-production) | When you add Google sign-in |
| 6 | [OpenStax reuse request](#6-openstax-reuse-request) | Now |
| 7 | [Email to Damodaran](#7-email-to-damodaran) | Now |
| 8 | [Lawyer check on CC BY](#8-lawyer-check-on-cc-by) | Before any paid launch |
| 9 | [OpenAI hard spend limit, old key revoked](#9-openai-hard-spend-limit-old-key-revoked) | Now |
| 10 | [2nd copy of the backups on your laptop](#10-2nd-copy-of-the-backups-on-your-laptop) | After each backup run |
| 11 | [Decide on the 2 unused `ANTHROPIC_API_KEY` copies](#11-decide-on-the-2-unused-anthropic_api_key-copies) | Any time |
| 12 | [Tune the spend caps](#12-tune-the-spend-caps) | After the first real turns |
| 13 | [Write the owner content](#13-write-the-owner-content) | Before the first invite |
| 14 | [Run the Waitlist](#14-run-the-waitlist) | Before the beta starts, then on a fixed rhythm |

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

Emergency switch: Attack Challenge Mode in the Vercel dashboard (Firewall). The rule bodies are in `.handoff/platform/` on branch `feat-33-clerk-cutover`. They move to `docs/agents/platform.md` with the Clerk PR.

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

## 3. Join, then the agent makes you admin

- [ ] Done

**Why.** In Clerk, admin is `publicMetadata.role = "admin"` on your user. The agent can set it only after your Clerk user exists. `/admin` needs it.

Sign-up is a Waitlist. In Waitlist mode, `/sign-in` works only for a user who already exists. The new production Clerk has no users, so `/sign-in` does not know you and sends no link. You join first, like any Learner.

**When.** When Clerk is live in production (the Clerk PR for #33 is merged).

**How.** Email link only for now. Google comes later (step 5).

1. Open `https://www.value-it.xyz/join`. Join with your email.
2. Tell the agent. It approves your waitlist entry. (You can also click Approve in the Clerk dashboard, Waitlist.)
3. Open the "you're in" email. Its link opens `/sign-up`. Finish with the email link. Now your Clerk user exists.
4. Tell the agent "signed up". It sets `role=admin` with the Clerk CLI.
5. Sign out. Sign in again at `/sign-in`, so your session gets the role. Open `/admin`. It must load.

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

1. The agent gives you the **Authorized redirect URI** from Clerk (from `clerk deploy` or the Clerk dashboard).
2. Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
3. Authorized JavaScript origins: `https://value-it.xyz` and `https://www.value-it.xyz`. Authorized redirect URIs: paste the URI from step 1. Create.
4. Google Auth Platform → Audience: user type **External**, publishing status **In production**. ("Testing" allows only 100 test users.) Google can ask to verify the app name and logo.
5. Paste the Client ID and the Client Secret only into the Clerk prompt or the Clerk dashboard (SSO connections → Google → custom credentials).
6. Do step 4 again with a Google account.

## 6. OpenStax reuse request

- [ ] Done

**Why.** Decisions #26 and #27. Today the Library uses OpenStax *Principles of Finance* 2nd edition. The 2nd edition's web page forbids use in "generative AI offerings" without written permission, and commercial use needs permission. Decision #27 moves the Library to the 1st edition, which is CC BY 4.0. That move is PR #38. It is live only after #38 merges and the production Library is loaded again. The owner decided that the reuse request goes out in both cases.

**When.** Now. It must be done before any paid launch. Before you send the form, ask the agent which edition the live Library uses. Name that edition in the form.

<!-- Orchestrator: after the #38 production load passes, say "1st edition" here and in Appendix A. If #38 does not load, keep this text. -->

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

Ask 3 questions:

1. Can a paid tutor store, embed, show and quote the CC BY 4.0 1st edition of OpenStax?
2. Does the AI clause on the openstax.org book page bind a copy taken from GitHub under CC BY?
3. Are the credit lines that Value It shows enough?

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

**When.** After each backup run: after each Library load, and once a month.

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

## Commands the agent was not allowed to run

The agent stopped before these commands. Run them yourself, or say yes and the agent runs them. The orchestrator adds the rest of the list.

None so far.

Not on this list: the stale Neon branches (`rag-baseline-2026-11-14`, `preview/docs/architecture`, `preview/feat/21-signal-models` and `preview/chore/tracker-setup`) and their 6 Preview `DATABASE_URL*` env vars. Your yes of 2026-11-15 covers them. The agent deletes them in the final clean-up, after this PR merges. You do not need to do anything.

<!-- Orchestrator: add one bullet per command below, with why and the exact command. -->

## Appendix A. OpenStax reuse request (points)

Not a draft from the research. These are the points to put in the form, from `research/library-licences.md`:

- Who: Value It, an online valuation course. Today it is a free beta for about 20 invited Learners. A paid offer may come later.
- What: *Principles of Finance*. Today the Library uses the 2nd edition. It moves to the 1st edition (CC BY 4.0, GitHub commit `3b7fc65c52`) with #38. The 2nd edition text is 99.5% the same. Name the edition that is live when you send the form (step 6).
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

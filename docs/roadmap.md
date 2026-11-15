# Roadmap: open questions after the Signal map

Map #2 ("Wayfinder: Value It Signal, build-ready") closes with the PR that adds this file. The map decided what the Signal beta needs. This file keeps what the map did not decide (its "fog"). The decisions are indexed at the end.

Written 2026-11-15.

**How to read an item.** Each item has the question, why it matters, what it blocks, a first step and a status.

**Status words.**

- **Open**: not decided. When it is next, make it a ticket under a map (`tools/wayfinder/grad.mjs`).
- **Partly done**: some parts are decided or built. The rest is open.
- **Out of scope (2026-11-15)**: the owner ruled it out for now.

**Order.** Owner priority (2026-11-15): the "developer phase". The quality of the Tutor's output comes first. So items 1 and 10 go first.

## Open questions

### 1. RAG: does each citation support its claim?

- **Question:** When the Tutor cites a Library passage, does that passage really support the sentence?
- **Why it matters:** A wrong citation teaches a wrong fact and makes it look sourced. This is the centre of output quality.
- **Blocks:** Trust in the Tutor. Any claim that the Tutor's answers are sourced.
- **First step:** A research ticket. Take real turns (the eval runs, then the first Learners). Check each citation by hand and with a model judge. Report the share of citations that support their claim. This needed a working Tutor: the Tutor works since 2026-11-15 (#3).
- **Status:** Open. Next.

### 2. RAG: a hindsight review step in each Case?

- **Question:** Does each Case end with a hindsight review: what happened after the Case's as-of date?
- **Why it matters:** The as-of rule (#25) hides later facts during a Case. A review step can show them at the end, as the lesson.
- **Blocks:** How a Case ends. The later per-passage date work (item 4).
- **First step:** A grilling ticket with one Case as a prototype.
- **Status:** Open. Its blocker, the as-of decision (#25), is closed.

### 3. RAG: embedding and model refresh rules

- **Question:** When the embedding model changes, which passages are embedded again, and how do we know? The `embedded_with` column records the model per passage.
- **Why it matters:** Vectors from 2 models in one search give bad results, and nothing shows the error.
- **Blocks:** Any change of the Voyage model.
- **First step:** Read how `scripts/library-embed.mjs` writes `embedded_with`. Write the rule down. It can become an ADR.
- **Status:** Open.

### 4. RAG: a date per passage

- **Question:** Does each passage get its own date, so that the as-of rule works inside a long source?
- **Why it matters:** Today a source has one date, or the text gives a year. A timeless book can hold dated facts.
- **Blocks:** A stricter as-of rule.
- **First step:** Count the passages whose text names a year after the Case date (the outcome-word probes from #25 are a start).
- **Status:** Open. #25 put it after the beta.

### 5. Study Workspace: move to the Signal shell?

- **Question:** After the beta, do the other 28 recipes and the Notebook move to the Signal shell and its colour roles?
- **Why it matters:** Today the app has 2 looks. Decision #17 puts the spec colours across the whole app.
- **Blocks:** The Study Workspace widgets (#5: "a thin OpenUI recipe later").
- **First step:** List the 28 recipes and the Notebook, with the colours each one uses. Estimate the work.
- **Status:** Open. After the beta.

### 6. Model provider seam

- **Question:** Keep the direct OpenAI adapter, or move it behind a gateway?
- **Why it matters:** A gateway can give fallbacks, one bill and an easy model change. The trap: a change of `TUTOR_MODEL` retires every Session and leaves costs unpriced (`cost_usd` empty; #13 then counts each such step as the worst step).
- **Blocks:** Any model change. #19 keeps the model-change retirement guard, renamed.
- **First step:** A grilling ticket. List what a model change touches: the price table (`src/tutor/pricing.ts`), the retirement guard, the evals.
- **Status:** Open. Its blocker is gone: the OpenAI key proved a turn on 2026-11-15 (#3).

### 7. Home hero demo

- **Question:** Is the hero demo recorded (with a label), or wired to the live Tutor (spec §14)? Do all widgets mount on first paint?
- **Why it matters:** It is the first thing a visitor sees. A live demo costs money per visit and needs bot protection. A recorded demo must say "recorded".
- **Blocks:** The final home page.
- **First step:** A prototype. Measure first paint with all 5 widgets mounted. Price one live demo turn.
- **Status:** Open.

### 8. Owner content

- **Question:** The founder's note, the contact email, the wait-time promise, the hero copy, and which market and currency come first (spec §14). Also: real Learner quotes (never invented), and whether the "not affiliated" line is enough.
- **Why it matters:** The public pages show placeholders.
- **Blocks:** The first invite.
- **First step:** The owner writes the founder's note and picks a contact address. Only the owner can do this (`docs/owner-actions.md`, step 13).
- **Status:** Open. Owner only.

### 9. Invite operations

- **Question:** Who gets the 20 invites? How often does the owner approve? What happens to people who are never approved?
- **Why it matters:** Sign-up is a Clerk Waitlist (#33). Nobody is approved automatically. A forgotten waitlist leaves people waiting with no answer.
- **Blocks:** The beta start (target: end of November 2026).
- **First step:** The owner lists the first 20 people and picks a rhythm (for example, approve twice a week). Decide what a person who waits hears. This ties to the wait-time promise (item 8). Only the owner can do this (`docs/owner-actions.md`, step 14).
- **Status:** Open.

### 10. Evals in CI

- **Question:** Which evals run in CI, and how?
  - Tutor eval in CI: it needs an OpenAI key in GitHub. The repo is public again, so Actions minutes are free; the model calls still cost money.
  - `library-score` has no CI path: it needs a database.
  - About 12 eval harnesses exist (for example the `vitest.*.config.ts` files). Merge them into fewer.
- **Why it matters:** Without evals in CI, a prompt or Library change can make the Tutor worse, and nobody sees it.
- **Blocks:** Safe changes to the Tutor and the Library.
- **First step:** List the harnesses. Mark which ones still run and which ones die with the legacy lanes (#19).
- **Status:** Partly done. The CI PR makes `tutor-eval.yml` say "skipped (no key)" instead of a fake pass. Library evals run by hand on a Neon branch copy of `main` (for #38 and #37). The rest is open.

### 11. Housekeeping

| Part | Status |
|---|---|
| Remove stale secrets | Partly done. Production `ANTHROPIC_API_KEY` and `THESYS_API_KEY` are already removed. Production `PASSCODE`, `PASSCODES` and `SESSION_SECRET` go with the Clerk clean-up (#33). 2 unused copies of `ANTHROPIC_API_KEY` are left: Vercel Preview and a GitHub Actions repo secret. They are an owner decision (`docs/owner-actions.md`, step 11). |
| Document `CRON_SECRET` | Open. Planned in `docs/agents/platform.md` (Clerk PR, #33). |
| Local secret scanning (gitleaks) | Open. More important now: the repo is public. |
| Align Node versions (Vercel 26, CI 24, VPS 22) | In progress. The CI PR pins Node 24 (`.nvmrc` and `engines`). |
| Clean up Neon branches after an off-Neon dump | In progress. The first off-Neon dump ran on 2026-11-15 (#8). The agent deletes the stale Neon branches and their 6 Preview env vars in the final clean-up, after this PR merges (the owner said yes on 2026-11-15). |
| Actions-minutes budget for the private repo | Not needed now. The repo is public again, so minutes are free. Look again if it goes private. |
| Ignore the `AGENTS.md` that `next dev` writes | Done in the PR that adds this file. |

## Out of scope (ruled 2026-11-14 and 2026-11-15)

- **Offer shape after early access** ([#29](https://github.com/SiddharthMuramkar/finance-agent/issues/29)): shape, price, payments provider, price wording. Out of scope 2026-11-15. The owner is in the developer phase. Early access stays free. The hard cap per Learner (#13) stays. Licence fact for later: any paid part makes the whole site commercial, so Yale 251/252 and the Damodaran blog must leave or get permission.
- **Fine-tuning a model** (owner, 2026-11-14).
- **Public self-serve sign-up.** The beta stays invite-only (Clerk Waitlist).
- **The spec's review-notes page.** Prototype only (spec §7.8).

## Still open as tickets

These are tickets, not fog. Each closes through its PR.

- [#8](https://github.com/SiddharthMuramkar/finance-agent/issues/8) Backup and restore posture: option B (daily snapshots, protected `main`, an off-Neon Library dump, a restore drill).
- [#19](https://github.com/SiddharthMuramkar/finance-agent/issues/19) Legacy lanes and old Learner data: the wipe goes through #33. Then the dead lanes are deleted. The model-change retirement guard stays, renamed.
- [#37](https://github.com/SiddharthMuramkar/finance-agent/issues/37) Re-test the reranker after the year fix: after the site (#32) and the new sources (#38).
- Build issues: #23 hardening (PR #36), #31 docs (PR #34), #32 site, #33 Clerk, #38 new Library sources.

## Decisions so far

From map #2. One line per closed ticket. Each ticket's last comment holds the full decision and "What I learned".

| # | Ticket | Decision |
|---|---|---|
| [#3](https://github.com/SiddharthMuramkar/finance-agent/issues/3) | Rotate the OpenAI key and prove one Tutor turn | New Production key works (turn 05:29 UTC, no 401). No key on Preview (option A). |
| [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) | Restore design docs from the archive? | Fresh ADRs and glossary, written new from the code and the archive. No restore. |
| [#5](https://github.com/SiddharthMuramkar/finance-agent/issues/5) | Widget engine for the 5 Signal widgets | One fixed React component per widget. The site mounts them directly; the Study Workspace uses a thin OpenUI recipe later. |
| [#6](https://github.com/SiddharthMuramkar/finance-agent/issues/6) | Sign-in launch plan | Google and email links together before the first invite. **Changed by #33 (2026-11-15):** Clerk; email link first, Google later. |
| [#7](https://github.com/SiddharthMuramkar/finance-agent/issues/7) | Signal page map and public routes | All spec pages; Cases at `/examples/[slug]`; a `(site)` route group; replace `_landing`. |
| [#9](https://github.com/SiddharthMuramkar/finance-agent/issues/9) | Vercel Hobby or Pro for the beta? | Pro now ($20/month). Pro features are the base for the bot guard, the gates and the alerts. |
| [#10](https://github.com/SiddharthMuramkar/finance-agent/issues/10) | Bot protection for join and Tutor routes | BotID Basic, 1 WAF rate rule on sign-in, a daily Tutor turn cap. **Changed by #33:** BotID moves to `POST /api/turn`; rate limits go on the app's POST APIs; Clerk guards sign-in. |
| [#11](https://github.com/SiddharthMuramkar/finance-agent/issues/11) | Gate production deploys, migrations and previews | Only `main` deploys. Gate = checks + a snapshot before a migration. Deployment Policy on Pro (built as the Vercel Deployment Checks `check`, `build`, `ui`). |
| [#12](https://github.com/SiddharthMuramkar/finance-agent/issues/12) | Error alerts for the beta | Better Stack uptime monitor + a 15-minute database heartbeat on failed turns. |
| [#13](https://github.com/SiddharthMuramkar/finance-agent/issues/13) | Spend cap and per-learner quota | Layered caps: 10 steps and 2 resumes per turn; 120 turns and $5 per Learner per day; $30 per day for everyone. |
| [#14](https://github.com/SiddharthMuramkar/finance-agent/issues/14) | Join flow: one door, or join and pending pages? | Spec `/join` + `/pending`; approval email. **Changed by #33:** Clerk Waitlist at `/join`; the owner approves in Clerk; Clerk sends "you're in"; the chips are dropped for now. |
| [#15](https://github.com/SiddharthMuramkar/finance-agent/issues/15) | Keep or remove the passcode door | Passcodes only locally and in the test bed; production refuses them. Confirmed by #33. |
| [#16](https://github.com/SiddharthMuramkar/finance-agent/issues/16) | Tutor-widget event contract | Only the Learner's call starts a turn; other events ride along; verdicts come from data; browser input is clamped. |
| [#17](https://github.com/SiddharthMuramkar/finance-agent/issues/17) | Colour language and theme scope | Spec colours across the whole app, one Light theme, Dark deleted, tokens first. |
| [#18](https://github.com/SiddharthMuramkar/finance-agent/issues/18) | Levers model source of truth | The Levers widget uses the valuation engine on the sourced Amazon Case; the spec table is updated to match. |
| [#24](https://github.com/SiddharthMuramkar/finance-agent/issues/24) | What does Library search score today? | hits@5 92%, MRR 0.82 with vectors. Old Cases see about 10% of the Library. Yale 252 heading-year bug found. |
| [#25](https://github.com/SiddharthMuramkar/finance-agent/issues/25) | How strict should the as-of rule be for timeless sources? | Fix the heading-year bug and add outcome-word probes now. Per-passage dates after the beta. |
| [#26](https://github.com/SiddharthMuramkar/finance-agent/issues/26) | Which Library sources can Value It keep if it charges Learners? | Keep all sources for the free beta. The owner asks OpenStax and Damodaran now. The site PR fixes the credits. |
| [#27](https://github.com/SiddharthMuramkar/finance-agent/issues/27) | Which licence-safe public sources should the Library add next? | Swap OpenStax to the CC BY 1st edition. Add FOMC records, the WeWork S-1, Amazon and Webvan filings, Investor.gov. |
| [#28](https://github.com/SiddharthMuramkar/finance-agent/issues/28) | Does a reranker improve Library search enough to keep? | Park the reranker. Test again after the year fix (#37). The gain was +0.03 to 0.05 MRR for +0.6 s. |
| [#29](https://github.com/SiddharthMuramkar/finance-agent/issues/29) | What shape is the offer after early access? | Out of scope for now (2026-11-15). Early access stays free. |
| [#30](https://github.com/SiddharthMuramkar/finance-agent/issues/30) | Should runLockedTurn be split first? | Move turn admission out and add a step ledger inside the hardening PR. No big refactor first. |

The Clerk decisions of 2026-11-15 are in the open build issue [#33](https://github.com/SiddharthMuramkar/finance-agent/issues/33): Clerk replaces Better Auth; email link only at go-live, Google later; Waitlist sign-up; admin = Clerk `publicMetadata.role` "admin"; the passcode door stays local and test only; a fresh start (old Learners are wiped after a snapshot).

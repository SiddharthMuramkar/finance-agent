# Roadmap: open questions after the Signal map

Map #2 ("Wayfinder: Value It Signal, build-ready") closes with the PR that adds this file. The map decided what the Signal beta needs. This file keeps what the map did not decide (its "fog"). The decisions are indexed at the end.

Written 2026-11-15. Updated 2026-11-16 with the [follow-ups](#follow-ups-from-the-2026-11-15-batch) of the 2026-11-15 batch, the production Library load, the production wipe and PR C (#51). Updated again 2026-11-16 with [what spec #68 left](#after-spec-68-2026-11-16) (PR #119).

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
- **Blocks:** Any model change. The retirement guard stays as `isOldModelSession` / `retireOldModelSessions` (`src/tutor/session-log.ts`, PR #44).
- **First step:** A grilling ticket. List what a model change touches: the price table (`src/tutor/pricing.ts`), the retirement guard, the evals.
- **Status:** Open. Its blocker is gone: the OpenAI key proved a turn on 2026-11-15 (#3).

### 7. Home hero demo

- **Question:** Is the hero demo recorded (with a label), or wired to the live Tutor (spec §14)? Do all widgets mount on first paint?
- **Why it matters:** It is the first thing a visitor sees. A live demo costs money per visit and needs bot protection. A recorded demo must say "recorded".
- **Blocks:** The final home page.
- **First step:** A prototype. Measure first paint with all 5 widgets mounted. Price one live demo turn.
- **Status:** Partly done. PR #47 ships a recorded conversation with a live widget, labelled "A recorded conversation from the course. The widget is live." (`src/site/copy.ts`). Open: whether to wire it to the live Tutor later, and the first-paint measurement with all 5 widgets.

### 8. Owner content

- **Question:** The founder's note, the contact email, the wait-time promise, the hero copy, and which market and currency come first (spec §14). Also: real Learner quotes (never invented), and whether the "not affiliated" line is enough.
- **Why it matters:** The public pages show placeholders.
- **Blocks:** The first invite.
- **First step:** The owner writes the founder's note and picks a contact address. Only the owner can do this (`docs/owner-actions.md`, step 13).
- **Status:** Open. Owner only.

### 9. Invite operations

- **Question:** Who gets the 20 invites? How often does the owner approve? What happens to people who are never approved? Also: do the "What brings you here?" chips (#14, dropped by #33) come back, for example as a Clerk Waitlist field or a first-sign-in question?
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
- **First step:** List the harnesses that are left after PR #44 (#19), which deleted `browser-check.mjs`, `layout-check.mjs`, `src/comparison`, `vitest.comparison.config.ts` and `vitest.genui.config.ts`. Left: the 4 `vitest*.config.ts` files (`vitest.config.ts`, `behaviour`, `tutor-eval`, `tutor-sweep`), Playwright, `widget-eval.mjs` (widgets, delight), `library-score.mjs`, `tutor-eval-from-session.mjs`, `eval-reads.mjs` and `tutor-replay.mjs` (all in `scripts/`). Mark which ones run in CI.
- **Status:** Partly done. The CI PR makes `tutor-eval.yml` say "skipped (no key)" instead of a fake pass. The repo has no `OPENAI_API_KEY` GitHub secret today (only `ANTHROPIC_API_KEY`), so `tutor-eval` always skips. Library evals run by hand on a Neon branch copy of `main` (for #38 and #37), and on production after the Library load of 2026-11-16 (`docs/owner-actions.md`, "Scripts you ran"). The rest is open.

### 11. Housekeeping

| Part | Status |
|---|---|
| Remove stale secrets | Partly done. Production `ANTHROPIC_API_KEY` and `THESYS_API_KEY` are already removed. Production `PASSCODE`, `PASSCODES` and `SESSION_SECRET` go now that PR C (#51) is live (`docs/owner-actions.md`, step 18). Unused copies are left on Vercel Preview (`ANTHROPIC_API_KEY`, `PASSCODE`, `SESSION_SECRET`, `VOYAGE_API_KEY`) and as a GitHub Actions repo secret (`ANTHROPIC_API_KEY`). They are an owner decision (`docs/owner-actions.md`, step 11). |
| Document `CRON_SECRET` | Partly done. `docs/agents/platform.md` lists it (Env vars, and the "Bypass Vercel Cron" firewall rule), and `src/auth/cron.ts` checks it. Open: say what it guards (`/api/cron/*`) and how to rotate it. No ticket yet. |
| Local secret scanning (gitleaks) | Open. More important now: the repo is public. |
| Align Node versions (Vercel project setting 26, builds 24, CI 24, VPS 22) | Partly done. `engines` and `.nvmrc` pin Node 24 (PR #39), so CI and the Vercel builds use Node 24. `engines` overrides the Vercel project setting, which still says 26.x, so each build logs a warning. Open: set the project setting to 24.x to end the warning (a Vercel change: owner's yes). The VPS stays on Node 22: the safety check stopped the agent's `nvm install` (`docs/owner-actions.md`, blocked commands). |
| Clean up Neon branches after an off-Neon dump | Done 2026-11-16. Off-Neon dumps ran on 2026-11-15 (#8) and on 2026-11-16 (after the Library load). The stale Preview env vars are gone (the owner removed the last 2 on 2026-11-15). `owner-batch-5.sh` deleted the 6 old branches on 2026-11-16. Neon now has only `main` and `vercel-dev`. |
| Turn the 8 `research-*` branches into tags | Open. Needs the owner's yes (it deletes branches). Per branch: `git tag <b> origin/<b> && git push origin refs/tags/<b> && git push origin --delete refs/heads/<b>`. Links like `blob/research-library-licences/...` keep working. |
| Vercel agent token (ACME team, laptop Keychain, 90 days, made about 2026-11-15; #33) | Renew before about 2027-02-13 (owner). The VPS CLI uses its own login, not this token. |
| Actions-minutes budget for the private repo | Not needed now. The repo is public again, so minutes are free. Look again if it goes private. |
| Ignore the `AGENTS.md` that `next dev` writes | Done in the PR that adds this file. |

## Follow-ups from the 2026-11-15 batch

Smaller items that the PRs of 2026-11-15 found and did not fix. Each one can become a ticket.

| # | Follow-up | Why it matters | First step |
|---|---|---|---|
| F1 | A Stop during the fold still ends the turn as failed. | When the Learner presses Stop while the Tutor folds old history (`foldHistory` in `src/tutor/turn.ts`), the turn ends `failed`. The Learner sees an error, and the turn does not count in `turns_per_learner_day`. Its dollars count since #36. | A ticket: end such a turn as stopped, and count it. Source: the hardening review on PR #36. |
| F2 | The ADR cite check is skipped on docs-only PRs that edit top-level `.md` files or `docs/specs/`. | `scripts/ci-changes.mjs` calls a PR docs-only when it edits only top-level `.md` files or `.md` files under `docs/` (not `docs/adr/`). Then CI skips the `static` job, and with it `node scripts/check-adr-cites.mjs`. A wrong ADR number in `CLAUDE.md`, `GLOSSARY.md` or a spec can merge. A PR that edits `docs/adr/` runs the full CI (#34). | Run the cite check on every PR. It needs only Node and git, not `npm ci`, so it can run in the light `changes` job. |
| F3 | Investor.gov is not loaded. | Decision #27 adds the SEC investor-education pages (`investor-gov-explainers` in `scripts/library/sources.json`). The site answers 403 to the fetcher, so the Library has none of them (`docs/library/2026-11-15-sources-eval.md`, section 7). | Find a way to fetch the pages that the site's terms allow. Then load them like the other #38 sources. |
| F4 | The Signal-12 as-of MRR is 0.461, below the old 0.49. | The 12 Signal Case questions, searched as of each Case's date, rank the right passage lower than before the new sources. The full set got better (75/78, MRR 0.8271). The Tutor uses the as-of search during a Case. The production score after the load (2026-11-16) is the same: as-of 9/12 in the top 5, MRR 0.461; open search 9/12, MRR 0.542; the 78 original questions 75/78, MRR 0.827. | List which of the 12 questions lost rank, and why. The production ranks are in `/root/projects/eval-runs/2026-11-15-prod-score-voyage.txt`. |
| F5 | Re-test the reranker after the Library grows. | #37 parked the reranker: about one more question found, for about 0.2 s (p50) more per search (`docs/library/2026-11-15-reranker-retest.md`). A bigger Library can change that. | When the next sources load, run the commands in that doc's "How to re-run" section. It needs a Voyage key (`docs/owner-actions.md`, step 16). |
| F6 | Google sign-in for Clerk. | Clerk went live with email link only (ADR 0017). Many people expect "Sign in with Google". | The owner makes the Google OAuth client (`docs/owner-actions.md`, step 5). Then the agent turns Google on and runs the smoke test again (step 4). |
| F7 | The Dependabot widget-freeze step. | A Dependabot PR that bumps `@openuidev/lang-core` changes `src/widgets/frozen.generated.json`, so `src/widgets/widgets.test.ts` fails until someone runs `npm run widgets:freeze` and commits the result. #46 and #49 failed this way. | Add a step for lang-core bumps: run `npm run widgets:freeze`, raise the instruction-size budget in `src/widgets/widgets.test.ts` if the text grows, and commit. Or keep lang-core out of the Dependabot group, so a person updates it. |

## After spec #68 (2026-11-16)

What the spec #68 build (PR #119) left open. One line per item, with the ticket it came from. Owner-only steps are in `docs/owner-actions.md`, steps 23 to 28.

### Next build: the three #117 Cases

Delegated pick by the Owner, 2026-11-16: the top-ranked proposal of each region in `docs/cases/2026-11-case-proposals.md` (facts, sources, build notes). They are the next build. No Case tickets are opened now; each becomes a ticket when it is next.

| Region | Case | As-of | Build |
|---|---|---|---|
| India #1 | Paytm's IPO at Rs 2,150 | 2021-11-07 | INR works today. An illustration judged with `match_price` (no usable published value). NSE symbol `PAYTM`. From the proposal's Rank 2 section. |
| Japan/Korea #1 | Krafton's IPO at 498,000 won | 2021-08-01 | Needs KRW (#112) and the Korea market parts (#114), both built in spec #68, and the Tutor's won check (Markets, below). Its published peer-P/E value (579,153 won a share) is a multiple, so the engine does not reproduce it. KRX code 259960. From the proposal's Rank 3 section. |
| Europe/US #1 | Peloton's IPO at $29 | 2019-09-25 | USD works today. Build it like `s12-wework-iwg` against the published $19.35 a share; `reproduces` only within `REPRODUCE_TOLERANCE`. Nasdaq symbol `PTON`. From the proposal's Rank 1 section. |

### Library

- Replace the 11 topics that only Yale answered, with licensed Sources, or get Yale's permission (`docs/owner-actions.md`, step 23) (#118). The topics: the leverage cycle and the subprime crisis; Irving Fisher on interest and impatience; Social Security and the stock market; mortgage prepayment; yield curve arbitrage; psychology and bubbles; forwards and futures for hedging; how an insurance company manages risk; what an investment bank does in a share issue; call and put options; Geanakoplos on the leverage cycle and collateral. Without Yale the original 78 score 64/78, MRR 0.742 (bars 72/78, 0.82).
- Confirm the new question set (Yale-only questions taken out) with a live `library:score` on a Neon copy; the 66/68, MRR 0.88 so far is worked out from the recorded run (#118).
- Course Topics still link to oyc.yale.edu (`real-assets.yaml`, `eq-markets.yaml`, `sov-default-country-risk.yaml`, `outline.yaml`), and `real-assets.yaml` names ECON 251 "Shiller" (it is Geanakoplos) (#118).

### Course

- Daily-life line: only Spine 1, 2, 3 and the annual-report Topic have one; the rest come with #95/#96 (#86).
- The daily-life line is stored before the Principle reply (`src/course/practice.ts`); moving it after changes the turn flow in `src/tutor/turn.ts` (a tutor-eval trigger) (#86; review 3, L20).
- The beginner check counts new words only as Lingo cards, so nothing checks that a word is taught before it is used (how M01 passed); a rule needs a course-wide word list and a shrink-only list, and an Owner decision (#87; review 3, L19).
- Topics 2 and 3 still end on a typed Check with a typed Insight (review 3, L20); the `insight.pick` tap (ADR 0020) could replace typed Insights in the other Spine Topics (#88, #89, #95/#96).
- Critics rounds: Topics 2 and 3 count #89's round; Topic 1's round ran in fix round 2. Log real shas in `docs/critics/spine-log.yaml` when a Topic changes again (#88, #89; review 1, F13).
- The Value levers part's prompt text, which the Tutor and the Library read, still says "revenue in year 10" (`value-levers-part.tsx`, the recipe description); changing it needs `widgets:freeze` (#88).
- Retake the 390 px critics screenshots of Spine Topics 2 and 3 now that the phone Study Workspace is in (#89).
- Old Reviews on the removed Quick try `wc-primer-loop-try` point at no question; map them to `st-primer-loop-try` or not (#90).
- The Lingo card's "In the story" label should read "In the moment" ("The story" never labels the event, GLOSSARY) (#74).
- A reveal-step question for "which assumption failed" in the ready-Case valuation Topic (#92).
- A published Coffee Day valuation could replace the course illustration (#92).
- The Assignment opens beside Follow/Judge/Analyse once the Spine is passed (Owner, 2026-11-16), and the annual-report Topic's complete card links to it (#97, #93).
- Go deeper formulas never reach Learners: ADR 0003 says the Tutor may say them, but `src/tutor/instructions.ts` forbids typed formulas, the context says "in your own words" and the grader fails any formula. Needs an Owner decision on one rule, then align all four (a tutor-eval trigger) (#100; review 3, L17).
- Nintendo, Samsung and LVMH annual-report Cases with valuation blocks, now that #112 adds JPY, KRW and EUR (#94).

### Valuation and Full sheet

- Full sheet path rows (growth, margin, cost of capital) and the Case facts change only through the Levers; Own Case Estimate rows have no slider or tap; decide if they get their own (#104, #111).
- The saved Valuation story note (`storyNote`) does not list changed Full sheet rows (#104).
- Own Case Full sheet row changes are not saved with the Own Case or its Notebook note (#111).

### Markets, Own Case and Assignment

- Value levers on an Own Case: `OwnCasesContext` on the Study page, `ownCaseLookup` to `readWidget` and `widgetProblems`, a wider `caseId` check in `set-workbench.ts`; today the Estimate is the industry's opening one (#106, #107).
- The Tutor's reply check V7 does not catch ¥, ₩ or € (`src/tutor/reply-checks.ts`, `src/tutor/turn-facts.ts`) (#112).
- The FIGURE rule in `src/course/map.ts` has € but not ¥ or ₩ (#112).
- The Calculator, MoneyStack and case-data-view handle only dollars and rupees (#112).
- The Tutor's Workbench reading (`widget-reading.ts`) does not list the Market readings (#105).
- Implied premium readings stop at Dec 2019: the course's two-stage maths does not reproduce Damodaran's 2024-2025 method (3.99% against 4.23% for 2025) (#105).
- A Value levers view of the Price against a published non-DCF value, such as LIC's embedded value (#117, India #2).
- The range check's usual range (half to double; cost of capital ±3 points) is a stand-in; there is no tax-rate yardstick (#109).
- Own Case report date: the guide now uses the Board's approval date (India) and the filing date (Japan, Korea), as the research advised; the Owner can overrule (#108).
- Own Case cash: count liquid or debt mutual funds or not (#108).
- Own Case has no field for employee stock options (shown as "not entered" on screen and in the note) or non-controlling interests; a real options field needs guide lines in 3 markets (#108).
- Guide wording with no government source: 1 crore = 10 million, and the price rule for a shut market (#108).
- The Assignment Session's topic id `assignment` is not on the Course Map; give it a title and a read-only view (#110).
- Assignment Tutor Turns do not save a `reply_checks` record (#110).
- Add the Assignment's flagged-input and verdict-word cases to the behaviour or tutor-eval set (#110).
- Korea yardsticks are Damodaran's all-emerging-markets US dollar figures: label them so, or convert to won (#114).
- A course rule for Korean preferred shares (우선주) (#114).
- Japan's defense special corporate tax: which years and firms get 30.64% rather than 29.74% (#114).
- Europe's Own Case takes euro reporters only; UK, Swiss, USD and TEUR reporters need a currency or unit choice (#115).
- Europe's guide does not say shares are typed as the full count (not millions), and the form's share hint says "as the report prints it"; a slip moves the value a share 1,000,000 times (#115; review 2, G16).
- With no report link, the Own Case block's sources list only the cost-of-capital sheet (`industrySource` in `own-case.ts`); on screen each yardstick has its own link (#114, #115; review 2, G21).
- The Own Case form: one result line switches between `alert` and `status`, and field errors are not tied to their field (no `aria-invalid`) (#107; review 1, F24).
- Prices of €10 or more show as whole euros (€76.78 as €77); consider cents for EUR and USD share prices (#115).

### Theme and phone

- Printing a kit chart while Dark is on may keep Dark's chart colours: `pageChartPalette` in `src/widgets/genui-theme.tsx` writes them as SVG attributes; not checked (#80; review 2, G22).
- On the server `useScreen` assumes a laptop, so on a tablet the explore Widget moves into the conversation column on load (#81).
- Phone sheet: close it after the last due Review is done, and open the Spaced review row unfolded (#83).
- Preview matrix: add the signed-in reading pages at 390 and 360 px (#84); its public-site cells fail in both themes (header 64 px against 56, no signifier on the account menu and example cards, Tab never reaches Settings) (#80).

### Site

- Redirect `/examples/mega-millions-2018` and `/examples/rates-up-1` to `/examples/kerala-bumper-2024` and `/examples/rbi-repo-cut-2025` (#116).
- `meta.shareTitle` still says "Learn what things are worth."; align it with the hero "What is it really worth?" (#73).
- Spec §7.1 (Applicant row) and §7.2 ("Join early access") predate #76's "Join the waitlist" (#73).
- Home's hero h1 is followed by the demo's h3, so Home skips a heading level (#74).
- How it works draws 15 Spine steps (`Array.from({ length: 15 })` in `src/app/(site)/how-it-works/page.tsx`); make it follow the course (#91).
- `src/site/end-note.ts` hard-codes the Topic 15 Case `amazon-yourself-2000`; recheck after the Spine renumbering (#75).
- The jackpot's Go deeper task "find the rate where the two are worth the same" is always 0% for the Kerala bumper; a new task waits for the Owner (`docs/owner-actions.md`, step 27) (#116; review 1, F33).
- Measured minutes from the timed runs go into the course files (`docs/owner-actions.md`, step 25) (#72).
- After the merge, with Clerk on: check the Clerk cards on `/join`, `/sign-in` and `/sign-up` in Light and Dark (#76, #79); optional Lighthouse run for robots.txt (#70).

### Tests and tooling

- Install the Chromium build Playwright 1.65 expects (1254) on the VPS; until then e2e runs need `CHROME_PATH` set to chromium-1248 (#69, #70, #76, #81, #84, #90, #94, #106, #116).
- Retune the ui shard weights for the new p360 and mbp14-dark projects (#80, #82).
- `sharp` is imported by `scripts/make-icons.mjs` but not declared in `package.json` (#70; review 3, L26).
- Duplicated helpers: the month tables (`readings.ts`, `copy.ts`; use `src/widgets/months.ts`) and theme watching (`theme-store` and the `genui-theme.tsx` MutationObserver) (review 3, L30); `KIND_ID` and the reading id built in several files, and `readings-europe.ts` still copies the yardstick builder instead of `yardsticksFor` (review 1, F29; review 2, G41); `fadePath` in `own-case.ts` repeats `fadingGrowth`; the Lingo card shape in `src/markets/guides.ts` could use `LingoCardProps`; hand-written external-source links; one phone check per e2e spec (#105, #107, #114, #115).
- Test dates: `src/finance/own-case-japan-korea.test.ts` and `src/learner/own-cases-japan-korea.test.ts` still use year-end dates (verified: Kikkoman 2026-06-19 ¥1,540, Samsung 2026-03-10 ₩187,900); `e2e/assignment-tutor.spec.ts` types Tata Consumer's year end 2025-03-31, whose Board-approval date and price still need a primary source (#108, #114; review 2, G33).
- Timeouts under load: the no-typing Percent quick-try (5 s first result) and `src/app/other-learners.test.ts` (10 s hook) (#88, #76).

## Out of scope (ruled 2026-11-14 and 2026-11-15)

- **Offer shape after early access** ([#29](https://github.com/SiddharthMuramkar/finance-agent/issues/29)): shape, price, payments provider, price wording. Out of scope 2026-11-15. The owner is in the developer phase. Early access stays free. The hard cap per Learner (#13) stays. Licence fact for later: any paid part makes the whole site commercial, so Yale 251/252 and the Damodaran blog must leave or get permission (Yale leaves with #118, spec #68).
- **Fine-tuning a model** (owner, 2026-11-14).
- **Public self-serve sign-up.** The beta stays invite-only (Clerk Waitlist).
- **The spec's review-notes page.** Prototype only (spec §7.8).

## Still open as tickets

None besides map #2, which closes with this PR. All build tickets of the map are closed. Every open item is fog (above) or an owner step (`docs/owner-actions.md`).

Left from #33 for the owner: `docs/owner-actions.md` steps 1 (enforce the firewall), 3 (sign in as admin), 4 (Waitlist smoke test), 5 (Google), 21 (check the Clerk Protect sign-up CAPTCHA) and 22 (Clerk two-factor). Step 18 (Production passcode vars) is done (2026-11-16).

Open PRs: #20 (architecture overview, the map's architecture explainer; it merges last) and #45 (Dependabot actions bump; this PR folds in the same bump, so #45 can close after it).

Closed on 2026-11-15 and 2026-11-16: [#8](https://github.com/SiddharthMuramkar/finance-agent/issues/8) backup posture, option B (PR #40); [#19](https://github.com/SiddharthMuramkar/finance-agent/issues/19) legacy lanes (PR #44; the old Learners were wiped through #33 on 2026-11-16, and the model-change retirement guard stays, renamed); #21 widget models (PR #22); [#33](https://github.com/SiddharthMuramkar/finance-agent/issues/33) Clerk (PR #35 expand, PR #48 switch, PR C #51 contract: merged 2026-11-16 at 02:19 UTC, and migration 0040 ran in its production build after Neon snapshot `pre-migrate-ebde579-2026-11-16T022009`; the wipe of the 2 pre-Clerk Learners ran before it, with snapshot `pre-wipe-contract-2026-11-15` and export `/root/backups/pre-contract-2026-11-15.dump`; rollback in `docs/owner-actions.md`, "Scripts you ran"); #23 hardening (PR #36); #31 docs (PR #34); #32 site (PR #47); [#37](https://github.com/SiddharthMuramkar/finance-agent/issues/37) reranker re-test, parked (PR #42); #38 new Library sources (PR #43; loaded in production on 2026-11-16, snapshot `pre-library-load-2026-11-15`).

## Decisions so far

From map #2. One line per closed ticket. The ticket's resolution comment holds the full decision and "What I learned" (#37 has none: its decision is in a doc, see its row).

| # | Ticket | Decision |
|---|---|---|
| [#3](https://github.com/SiddharthMuramkar/finance-agent/issues/3) | Rotate the OpenAI key and prove one Tutor turn | New Production key works (turn 05:29 UTC, no 401). No key on Preview (option A). |
| [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) | Restore design docs from the archive? | Fresh ADRs and glossary, written new from the code and the archive. No restore. |
| [#5](https://github.com/SiddharthMuramkar/finance-agent/issues/5) | Widget engine for the 5 Signal widgets | One fixed React component per widget. The site mounts them directly; the Study Workspace uses a thin OpenUI recipe later. |
| [#6](https://github.com/SiddharthMuramkar/finance-agent/issues/6) | Sign-in launch plan | Google and email links together before the first invite. **Changed by #33 (2026-11-15):** Clerk; email link first, Google later. |
| [#7](https://github.com/SiddharthMuramkar/finance-agent/issues/7) | Signal page map and public routes | All spec pages; Cases at `/examples/[slug]`; a `(site)` route group; replace `_landing`. |
| [#8](https://github.com/SiddharthMuramkar/finance-agent/issues/8) | Backup and restore posture before any migration | Option B: daily Neon snapshots (22:00 UTC, kept 14 days), `main` protected, an off-Neon Library dump with a 2nd copy, a restore drill (PASS 9/9). PR #40. |
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
| [#19](https://github.com/SiddharthMuramkar/finance-agent/issues/19) | Delete legacy lanes and old learner data? | Wipe the old Learners through #33 (done 2026-11-16), then delete the dead lanes (PR #44). The retirement guard stays as `isOldModelSession` / `retireOldModelSessions`. |
| [#24](https://github.com/SiddharthMuramkar/finance-agent/issues/24) | What does Library search score today? | hits@5 92%, MRR 0.82 with vectors. Old Cases see about 10% of the Library. Yale 252 heading-year bug found. |
| [#25](https://github.com/SiddharthMuramkar/finance-agent/issues/25) | How strict should the as-of rule be for timeless sources? | Fix the heading-year bug and add outcome-word probes now. Per-passage dates after the beta. |
| [#26](https://github.com/SiddharthMuramkar/finance-agent/issues/26) | Which Library sources can Value It keep if it charges Learners? | Keep all sources for the free beta. The owner asks OpenStax and Damodaran now. The site PR fixes the credits. |
| [#27](https://github.com/SiddharthMuramkar/finance-agent/issues/27) | Which licence-safe public sources should the Library add next? | Swap OpenStax to the CC BY 1st edition. Add FOMC records, the WeWork S-1, Amazon and Webvan filings, Investor.gov. |
| [#28](https://github.com/SiddharthMuramkar/finance-agent/issues/28) | Does a reranker improve Library search enough to keep? | Park the reranker. Test again after the year fix (#37). The gain was +0.03 to 0.05 MRR for +0.6 s. |
| [#29](https://github.com/SiddharthMuramkar/finance-agent/issues/29) | What shape is the offer after early access? | Out of scope for now (2026-11-15). Early access stays free. |
| [#30](https://github.com/SiddharthMuramkar/finance-agent/issues/30) | Should runLockedTurn be split first? | Move turn admission out and add a step ledger inside the hardening PR. No big refactor first. |
| [#37](https://github.com/SiddharthMuramkar/finance-agent/issues/37) | Re-test the reranker after the year fix | Still parked: on the dated Signal questions the gain is about 1 question (MRR 0.49 to 0.52-0.54), for about 0.2 s (p50) more per search, and it brings a new hindsight problem. PR #42 keeps only the scorer flags. The decision is in `docs/library/2026-11-15-reranker-retest.md` (the ticket has no resolution comment). |

The Clerk decisions of 2026-11-15 are in build issue [#33](https://github.com/SiddharthMuramkar/finance-agent/issues/33) (closed 2026-11-16 by PR #51): Clerk replaces Better Auth; email link only at go-live, Google later; Waitlist sign-up; admin = Clerk `publicMetadata.role` "admin"; the passcode door stays local and test only; a fresh start (old Learners are wiped after a snapshot; done on 2026-11-16).

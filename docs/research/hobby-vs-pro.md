> Throwaway research branch for wayfinder ticket #9. Never merged.

# Vercel Hobby or Pro for the beta? (ticket #9)

## Question

Does an invite-only, free beta for about 20 Learners need Vercel Pro? The ticket asks for a Hobby and Pro comparison on 6 points: the non-commercial terms, function duration (300 s), custom analytics events, log retention and log drains, WAF and BotID tiers, and price.

## Short answer

1. Function time does not decide this. Both plans give a 300 s default. The Tutor turn stops itself at 270 s, so it works on both plans.
2. The terms decide it. Hobby is for "personal or non-commercial use" only (Terms, 19 Oct 2026). A free "early access" beta of a product that will have a price is a grey area. Vercel can stop a Hobby project with no notice.
3. Hobby cannot send custom events or use drains. It has no alerts, and it keeps runtime logs for 1 hour. Pro has all of these.
4. Pro costs $20 a month (plus tax) and includes $20 of usage credit. We expect a 20-Learner beta to use less than the credit.
5. Recommendation: upgrade to Pro before the first invite. Pro allows only 2 properties per custom event, so 2 of our 11 events need a small change.

## Options

| Option | What it gives | Cost on Hobby | Cost on Pro | Code/setup effort | Risk |
|---|---|---|---|---|---|
| **A. Upgrade to Pro now (recommended)** | Removes the terms risk. Turns on custom events, 30-day logs and alerts (Observability Plus is on by default for teams that start or upgrade to Pro on or after 3 Apr 2026), drains, 40 WAF custom rules and BotID Deep Analysis. Tickets #10, #11 and #12 can then use Pro features, and we can test them before Learners arrive. | n/a | $20/month + tax from today. Usage is billed from the $20 credit. We estimate $0–8 of usage, so about $20/month in total. | Small. Billing change in the dashboard (owner only). Set a spend budget with notifications. Merge 2 properties in 2 events. | Usage past the credit has no cap by default. Set a budget. A downgrade later removes all members except the owner, and stores and domains must be moved by hand. |
| B. Build on Hobby, upgrade on the day of the first invite | The same as A from invite day. Saves about 2 weeks of fee (about $10; we did not check how Vercel prorates the first month). | $0 until invite day | $20/month + tax from invite day | Same as A. Alerts and drains cannot be tested until the upgrade. | The terms grey area stays during the build. Pro features are tested late, close to the deadline. A 14-day Pro trial (one per account, $20 credit) could cover the build, but it has no Drains, pauses at its usage limits, and uses Your Content for AI training by default. |
| C. Stay on Hobby for the whole beta | $0. To replace the missing features we must build: an event table in Postgres (instead of custom events), our own error alerts (instead of Vercel Alerts, Drains and longer logs), and app-level rate limits (Hobby has 1 WAF rate-limit rule). | $0 | n/a | Medium to large. 3 substitutes to build and test before the end of November. | Terms risk: Vercel can stop the project with no notice. If usage goes past a Hobby limit, in most cases that feature stops until 30 days pass. Hobby uses Your Content for AI training by default (you can opt out). |

## Facts with sources

All pages were read on 2026-11-14 with a live fetch (Firecrawl, max age 0). The date in brackets is the "Last updated" date on the page.

### Hobby and Pro, side by side

| Topic | Hobby | Pro | Source |
|---|---|---|---|
| Terms | "You shall only use the Services under a Hobby plan for your personal or non-commercial use." Vercel "may shut down and terminate projects or deployments using the Hobby plan without notice for any reason or no reason." The Terms do not define "commercial". | Commercial use allowed | https://vercel.com/legal/terms §4 (19 Oct 2026) |
| Commercial use, Vercel's examples | Until at least 2026-11-08, the fair-use page said: "any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project, including a paid employee or consultant writing the code". Its examples were payments, "advertising the sale of a product or service", payment to build or host the site, affiliate links and ads. If you were not sure, it told you to contact Support. **The page update of 12 Nov 2026 removes this section.** It is also not on the Hobby, Pro, Pro trial or Limits pages today. The Terms still have the rule. | — | Octen index of https://vercel.com/docs/limits/fair-use-guidelines (crawled 2026-11-08); live Firecrawl fetch and fresh Octen extract on 2026-11-14 (page dated 12 Nov 2026) do not have it |
| AI training on Your Content | On by default ("Model Training"). You can opt out in Team settings. | Off by default on paid Pro (you can opt in). On by default on a Pro trial. | https://vercel.com/legal/terms (19 Oct 2026) |
| Function duration (Fluid compute) | Default 300 s, max 300 s | Default 300 s, max 800 s (generally available). 1800 s is in beta, set per function. | https://vercel.com/docs/functions/configuring-functions/duration (24 Aug 2026); https://vercel.com/docs/plans/hobby (12 Nov 2026) |
| Function memory | Always 2 GB / 1 vCPU (not configurable) | 2 GB / 1 vCPU default, or 4 GB / 2 vCPU | https://vercel.com/docs/functions/configuring-functions/memory (15 Jul 2026) |
| Custom events (Web Analytics) | Not available | Included. **2 properties per event.** With Web Analytics Plus ($10/month per team): 8. | https://vercel.com/docs/analytics/limits-and-pricing (25 Aug 2026); https://vercel.com/docs/analytics/custom-events (26 Jun 2026); confirmed by Context7 /websites/vercel (docs/pricing) |
| Web Analytics events | 50,000 a month. If you go past the limit, a 3-day grace period starts, then collection stops for 7 days. Reports cover 1 month. | $0.03 per 1K events, paid from the credit. Reports cover 12 months. | https://vercel.com/docs/analytics/limits-and-pricing (25 Aug 2026); https://vercel.com/pricing ("$3 per 100K events") |
| Runtime log retention | 1 hour | 1 day; 30 days with Observability Plus (you can select up to 14 consecutive days at a time) | https://vercel.com/docs/logs/runtime (28 Aug 2026); https://vercel.com/docs/plans/hobby (12 Nov 2026); https://vercel.com/pricing |
| Observability Plus | Not available (Observability data kept 12 hours) | $1.20 per 1M events, no base fee. On by default for teams created or upgraded to Pro on or after 3 Apr 2026. 30-day logs, saved queries. | https://vercel.com/docs/observability/observability-plus (6 Jul 2026); https://vercel.com/pricing; changelog https://vercel.com/changelog/no-base-fee-for-observability-plus (2 Apr 2026) |
| Alerts (error and usage anomaly; email, Slack, webhook) | Not available | Pro with Observability Plus. **Uncertain at our traffic:** anomaly alerts must pass Vercel's minimum activity checks against a 24-hour baseline, so they may not fire for about 20 Learners. Custom monitors (a fixed threshold) are Observability Plus only, at $0.0035 per GB scanned. | https://vercel.com/docs/alerts (9 Sep 2026); https://vercel.com/pricing |
| Drains (logs, traces, analytics) | Not available | $0.50 per GB, no included amount. Not available during a Pro trial. | https://vercel.com/docs/drains (1 Sep 2026); https://vercel.com/docs/plans/hobby (12 Nov 2026); https://vercel.com/pricing |
| WAF custom rules | Up to 3 | Up to 40 | https://vercel.com/docs/plans/hobby (12 Nov 2026); https://vercel.com/pricing |
| WAF rate limiting | 1 rule per project, inside the 3 custom rules. Fixed window, 10 s–10 min, keys IP or JA4. 1M allowed requests included. | 40 rules per project. From $0.50 per 1M allowed requests; the price depends on the region ($0.65 per 1M in sin1). | https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting (28 Aug 2026); https://vercel.com/docs/pricing/regional-pricing/sin1 (14 Sep 2026); https://vercel.com/pricing ("Starting at $0.50"); changelog https://vercel.com/changelog/rate-limiting-now-available-on-hobby-with-higher-included-usage-on-pro (23 May 2025) |
| WAF IP blocking | Up to 10 | Up to 40 | https://vercel.com/docs/plans/hobby (12 Nov 2026); https://vercel.com/pricing |
| Managed rulesets | Bot Protection and AI Bots: all plans. OWASP: Enterprise only. | Same | https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets |
| BotID | Basic: free, all plans | Deep Analysis: $1 per 1,000 `checkBotId()` Deep Analysis calls. Requests that do not call `checkBotId()` are not charged. | https://vercel.com/docs/botid (16 Jun 2026); https://vercel.com/pricing ("$1 per 1,000 Deep Analysis checks") |
| DDoS mitigation, Attack Mode | On by default; Attack Mode optional | Same | https://vercel.com/docs/plans/hobby (12 Nov 2026) |
| Price | $0. You cannot buy more usage. In most cases, past a limit you "wait until 30 days have passed". | $20/month platform fee. Includes 1 deploying seat and $20/month usage credit (unused credit expires at month end). Extra deploying seats: $20 each. Viewer seats: free. On-demand usage has no cap by default ("pay as you go, uncapped"). Spend notification default for new customers: $200 per billing cycle. Prices exclude tax. | https://vercel.com/docs/plans/pro-plan (15 Sep 2026); https://vercel.com/docs/plans/hobby (12 Nov 2026); https://vercel.com/pricing; third-party check: https://massivegrid.com/blog/vercel-pricing-explained-2026/ (31 Oct 2026) |
| Included usage (Hobby) | 4 Active CPU-hrs, 360 GB-hrs provisioned memory, 1M invocations, 100 GB Fast Data Transfer, 1M CDN requests | Usage-based, from the credit | https://vercel.com/docs/plans/hobby (12 Nov 2026; all five); https://vercel.com/docs/limits/fair-use-guidelines (12 Nov 2026; all except CDN requests) |
| On-demand rates, sin1 | — | Active CPU $0.16/h; Provisioned Memory $0.0133/GB-hr; invocations $0.60/1M. FDT $0.16/GB and CDN requests $2.60/1M apply only on per-unit CDN billing: Pro includes the lowest Flat Rate CDN tier (1M CDN requests and 1 TB a month) at no extra cost, and while it is on, those are not billed per unit. We did not confirm whether it is on by default for a new Pro team. | https://vercel.com/docs/pricing/regional-pricing/sin1 (14 Sep 2026); https://vercel.com/docs/limits/fair-use-guidelines (12 Nov 2026); https://vercel.com/docs/pricing/flat-rate-cdn |
| Spend Management | Not available | Team or project budgets. They can notify, call a webhook or pause production. Checks run every few minutes, so a pause comes some minutes late. On Pro, a team budget counts only usage past the credit. | https://vercel.com/docs/spend-management (18 Sep 2026) |
| Cron | Once a day at most; ±59 min precision | Once a minute; per-minute precision | https://vercel.com/docs/cron-jobs/usage-and-pricing (15 Jul 2026) |
| Deployment Protection | Vercel Authentication (preview and production), exceptions, shareable links | Hobby features, plus Password Protection at $20/month per project | https://vercel.com/docs/plans/hobby (12 Nov 2026) |
| Deployments a day | 100 | 6,000 | https://vercel.com/docs/plans/hobby (12 Nov 2026) |
| Pro trial | — | 14 days, $20 credit, one per account. No Drains. The trial pauses when Active CPU (16 h), memory (1,440 GB-hrs) or invocation (1M) limits are reached. With no card, the team goes back to Hobby. AI training on Your Content is on by default. | https://vercel.com/docs/plans/pro-plan/trials (14 Sep 2026); https://vercel.com/legal/terms (19 Oct 2026) |

### Is this beta "commercial"?

- For non-commercial use: the beta is free. It has no payments, no ads and no affiliate links. It does not hit any example in Vercel's old list.
- For commercial use: Home and Join say "Free during early access", and the FAQ says "No price has been decided yet" (`docs/specs/value-it-signal-spec.md` lines 975, 1134, 1496, 1514). The map (#2) lists "Offer and pricing … then payments" as a next step. The old definition counts any "financial gain of anyone involved". So a free beta of a future paid product can be read as commercial.
- Vercel did not publish an answer for a pre-revenue prototype. The community thread from 2026-11-08 had no reply on 2026-11-14 (https://community.vercel.com/t/hobby-eligibility-for-a-private-development-prototype-of-a-future-commercial-restaurant-platform/1000000127).
- Result: we cannot prove that Hobby is allowed. The cost of a wrong guess is a shutdown with no notice in the middle of the beta.

## How it fits this repo

Live state, read-only on 2026-11-14 through the Vercel API: project `finance-agent` (team `acme-ef4b`, Hobby), Node 26.x. Vercel Authentication protects all URLs except the custom domains (`ssoProtection: all_except_custom_domains`). Password protection is off. Firewall: `configured: false`, so only the default firewall applies.

- **Function duration.** `src/app/api/turn/route.ts` sets `maxDuration = 300`. `src/tutor/turn.ts` sets `TIME_BUDGET_MS = 270_000` with a 10 s compaction margin, and the browser resumes the turn in a new call. This works on both plans. With Pro, change nothing. Only the comment "Vercel Hobby's ceiling" becomes out of date (the Pro default is also 300 s; we could raise it to 800 s, but we do not need to). `src/app/api/cron/library-refresh/route.ts` (300 s, weekly cron `30 21 * * 1` in `vercel.json`) works on both plans. On Hobby it can start up to 59 min late.
- **Custom events.** `src/app/analytics.ts` sends 11 events (5 timing events + 6 Home events). Today Hobby drops them, as the file comment says. On Pro, 9 events have 2 properties or fewer and work as they are. 2 events send 3 properties: `widget_first_pixel` and `widget_interactive` in `src/app/widget-panel.tsx` (lines 396 and 403: `lane`, `recipe`, `ms`). The docs do not say what Vercel does with a third property. Fix: merge `lane` and `recipe` into one property, or buy Web Analytics Plus ($10/month). `src/app/site-analytics.tsx` (removes the sign-in token) does not change.
- **Logs and error alerts (#12).** `src/instrumentation.ts` only loads the E2E database. It has no error hook. So today errors exist only in Vercel runtime logs: 1 hour on Hobby. On Pro with Observability Plus: 30 days of logs, plus Error Anomaly alerts by email, Slack or webhook. **Uncertain:** anomaly alerts need Vercel's minimum activity checks, so at beta traffic they may not fire. #12 should plan a custom monitor with a fixed threshold ($0.0035 per GB scanned) or an app-side error hook as well. On Hobby, #12 must send errors out from the app (for example an `onRequestError` hook to an external service).
- **Bot protection (#10).** These work on Hobby: BotID Basic, the Bot Protection and AI Bots managed rulesets, and 1 WAF rate-limit rule. Join and `/api/turn` would share that one rule and one limit. App-level guards already exist (`src/auth/email-throttle.ts`, `src/auth/login-guard.ts`). Pro adds separate rules for each route (up to 40) and BotID Deep Analysis ($1 per 1,000 checks). If we use Deep Analysis on join only, it costs cents. On every Tutor turn, it costs about $1 per 1,000 turns. The WAF runs before `src/proxy.ts`.
- **Deploy gates (#11).** `vercel.json` deploys only `main`. `scripts/migrate-on-build.mjs` migrates only when `VERCEL_ENV=production`. The plan does not change this. Hobby allows 100 deployments a day; Pro adds Password Protection ($20/project/month), which we do not need.
- **Usage estimate (our assumptions; measure in week 1 on the Usage page).** A Tutor turn waits on OpenAI, so provisioned memory (2 GB × the time the instance is busy) costs more than CPU. Light use, 20 Learners × 30 turns a week × 60 s: about 43 h a month, or about 87 GB-hrs. That fits Hobby (360) and costs about $1.15 on Pro (sin1, $0.0133/GB-hr). Heavy use, 20 Learners × 20 turns a day × 60 s: about 200 h, or about 400 GB-hrs. That is **over the Hobby limit** (functions stop, in most cases until 30 days pass) and costs about $5.30 on Pro. When requests overlap, Fluid compute shares one instance, so real numbers can be lower. We have no data yet for Active CPU (Hobby gives 4 h).

How plan limits shape the architecture (what this ticket teaches):

- The 300 s cap is why the Tutor turn has its own time budget and a resume step.
- The 1-hour log window is why error alerts must leave Vercel on Hobby.
- The limit of 1 rate-limit rule is why app-level throttles exist.
- The hard 30-day pause is the reason why a free plan is a risk for a live beta. On a free plan you cannot pay to get past a limit.

## Recommendation

Upgrade the `acme-ef4b` team to Pro before we invite the first Learner. Do it now, so that #10, #11 and #12 can be designed and tested on Pro features.

- **What we get:** no terms grey area, no AI training by default, custom events, 30-day logs and alerts, drains, more WAF rules, and no hard 30-day stop at a usage limit.
- **Trade-off:** $20 a month plus tax, every month, for a product that earns nothing yet. Usage past the credit has no cap until we set a budget. At this scale we expect the total to stay at about $20/month.
- **Next steps:** add a team budget with a notification (decide in #13 whether it pauses production, because a pause takes the beta offline). Merge 2 event properties (see above). Update the comment in `src/app/api/turn/route.ts`. In #12, do not rely only on anomaly alerts at beta traffic.
- **If you choose Hobby:** build the 3 substitutes (event table, error alerts, app rate limits) and accept the shutdown risk. You can also ask Vercel Support for a written answer on the terms.

The owner must change the plan. This research did not change any Vercel setting.

## Decision needed from the owner

1. **Pro now** (recommended): $20/month + tax from today. Build #10–#12 on Pro features.
2. **Hobby until invite day, then Pro:** saves about $10 (we did not check proration). Pro features are tested late.
3. **Hobby for the whole beta:** $0, but we build 3 substitutes and accept the terms and 30-day-pause risk.

If you choose 1 or 2: merge `lane` and `recipe` into one event property (recommended, $0), or buy Web Analytics Plus ($10/month).

## Verification notes (2026-11-14)

- All 12 key claims held against live vendor pages and the repo.
- Corrected: the WAF rate-limit price is set per region (sin1 $0.65 per 1M, not $0.50). The duration page is dated 24 Aug 2026. The Hobby "1M CDN requests" figure comes from the Hobby page. Pro's Flat Rate CDN tier covers CDN requests and FDT.
- Marked uncertain: whether anomaly alerts fire at beta traffic, the option 2 saving, and whether Flat Rate CDN is on by default.

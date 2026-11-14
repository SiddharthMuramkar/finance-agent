> Throwaway research branch for wayfinder ticket #10. Never merged.

# Research: Bot protection for join and Tutor routes (#10)

*Verified 2026-11-14 by an adversarial check against primary sources and the repo. Corrections are marked **[corrected]**. Facts we could not confirm are marked **[uncertain]**.*

## Question

Which tool best protects three things for this beta: the join form, the Better Auth sign-in endpoints, and the Tutor turn endpoint (`POST /api/turn`)? The options are Vercel BotID (Basic or Deep Analysis), a Vercel WAF rate-limit rule, Cloudflare Turnstile, or a mix. For each option: what it stops, what it costs on Hobby and on Pro, and how much code it needs.

## Short answer

- Join and sign-in: use **BotID Basic** on the two Better Auth sign-in POSTs, plus **one WAF rate-limit rule**. Both are free on Hobby. Keep the DB limits and the hand approval you have now.
- The real join risk is a script that uses up the site cap of 90 emails a day. When it does, nobody can sign in by email until old sends age out. The script can keep the cap full for as long as it runs. **[corrected]** Limits for each IP do not stop this. One IP can fill the cap in about 2¼ hours. Many IPs can fill it in minutes. A browser challenge makes the script much harder to run.
- Better Auth sign-in is built but off in production today. This risk starts when you turn it on. **[corrected]**
- Tutor: a bot challenge is the wrong tool. The route already needs an approved sign-in. Add a **daily turn cap for each Learner** in code.
- Use Turnstile only if BotID Basic turns out too weak and you do not want Pro. Do not put Cloudflare in front of Vercel.

## The layers (what each one is, where it sits)

A request goes through these layers in this order. Each layer stops a different kind of abuse.

| # | Layer | Where it runs | What it stops | Cost of a blocked request |
|---|---|---|---|---|
| 1 | **Platform firewall** (DDoS) | Vercel CDN, before your code. Always on. | Floods (layers 3, 4 and 7) | None |
| 2 | **WAF rules** (custom rules, rate limit, managed rulesets) | Vercel CDN, before your code | Too many requests from one IP or JA4 fingerprint, and known bad patterns | None: no CDN request is billed |
| 3 | **Challenge** (BotID or Turnstile) | The browser solves it. Your route checks the result before it does work. | Clients that are not a real browser running JavaScript | One function call |
| 4 | **App limits** (DB-backed) | Inside the function, in Neon | Too many tries from one IP, too many emails to one address, too many emails in one day | One function call and DB writes |
| 5 | **Approval** | The owner, by hand | Strangers who get through everything else | Owner time |
| 6 | **Quota** | Inside the function | Too much costly work by one approved person (Tutor model calls) | One function call |

Today the app has layers 1, 4 and 5. Layers 2, 3 and 6 are empty. The firewall runs at its defaults: the Vercel API shows `configured: false` for project `finance-agent` (re-read 2026-11-14: "This project has no custom firewall configuration; the default firewall applies.").

## Threats for each endpoint (from the code)

Better Auth (Google and email links) is built but off in production now. While it is off, `/api/auth/*` answers 404 and the passcode is the only way in. The rows for `/api/auth/*` apply once you turn it on.

| Endpoint | Who calls it | What a bot can do | Protection in the code |
|---|---|---|---|
| `POST /api/auth/sign-in/magic-link` (join and sign-in by email) | `src/app/login/email-link-form.tsx` with plain `fetch` | (a) Send many emails to one victim. (b) **Use up the site cap of 90 emails a day**, so email sign-in stops for everyone until old sends age out. (c) Add DB writes. | Better Auth limit of 10 per 15 min per IP (`src/auth/better-auth.ts`: `EMAIL_LINK_REQUESTS = 10`, `EMAIL_LINK_SECONDS = 900`). 3 emails per address per hour and 90 per day for the site (`src/auth/email-throttle.ts`). Unverified emails never make a user (`newUserGate`). Approval by hand. |
| `POST /api/auth/sign-in/social` (Google) | `src/app/login/google-button.tsx` with `fetch` | Start many OAuth redirects. This costs the attacker little. Google runs its own bot checks. A new user still waits for approval. | Better Auth default of 3 per 10 s per IP on sign-in |
| `GET /api/auth/magic-link/verify` | Native GET form from the email landing page | Guess tokens. Not practical: tokens are stored hashed (`storeToken: "hashed"`) and expire in 15 min. | Better Auth default limit |
| `POST /api/login` (passcode, legacy) | Native HTML form | Guess passcodes | DB lockout: 5 wrong guesses per 15 min per IP. When there are more than 50 failures in an hour, the limit drops to 1 (`src/auth/login-guard.ts`). |
| `POST /api/turn` (Tutor) | Study Workspace with `fetch` (stream) | Burn OpenAI money, but only with an **approved** sign-in (a shared or stolen cookie, or a client loop bug) | Proxy gate plus `currentLearnerId()`, which accepts an approved Better Auth account or a valid passcode cookie. One turn at a time for each Learner (409 `busy`). **No daily cap**: `src/tutor/spend.ts` only reports spend in /admin. |

**Facts for (b)** **[corrected]**:
- The Better Auth 1.7.17 limiter resets an IP's count only when 15 min have passed since its last allowed request. Rejected requests do not count. So one IP gets at most about 40 sends an hour, and fills the 90 cap in about 2 h 15 min. Nine IPs fill it in minutes. Sources: Better Auth `packages/better-auth/src/api/rate-limiter/index.ts` at v1.7.17, and `docs/content/blogs/1-5.mdx` ("Rejected requests are no longer counted").
- Each request can use a new address, so the cap of 3 per address does not help.
- The cap counts sends from the last 24 h. As each old send ages out, the script can claim the slot again. So the outage lasts as long as the script runs, not only 24 h.
- What still works: Google sign-in, when it is on. The form already tells the person "Email sign-in is resting until tomorrow. Continue with Google instead." Sessions people already have also keep working (they last 90 days).

## Options

| Option | What it gives | Cost on Hobby | Cost on Pro | Code / setup effort | Risk |
|---|---|---|---|---|---|
| **A. BotID Basic** (through the Better Auth `captcha` plugin, `provider: "vercel-botid"`) | An invisible browser challenge. It checks that the challenge response is intact and correct. It stops scripts, curl and simple headless clients. | Free | Free | 1 dependency (`botid`). A new `src/instrumentation-client.ts` with `initBotId` for the 2 POST paths. The plugin added to `authOptions` (before `nextCookies()`). A "check failed" message in the 2 forms. Tests. About 40 to 80 lines (estimate). **[corrected]** The project must have Vercel OIDC Federation turned on (see "Facts with sources"). | Vercel says it catches "many less sophisticated bots", not all. Native HTML forms are not supported (among the sign-in POSTs, only `/api/login` uses one). If `checkBotId()` throws (for example, no OIDC token), the plugin answers 500 and sign-in stops. Check in a preview that the challenge loads for a signed-out visitor and that sign-in succeeds. |
| **B. BotID Deep Analysis** | Option A plus Kasada machine learning against bots that act like humans (Playwright, Puppeteer) | **Not available** | $20/mo Pro + $1 per 1,000 `checkBotId()` Deep Analysis calls | Option A + `checkLevel: 'deepAnalysis'` on the client and the server + a dashboard toggle (Firewall → Rules) | Needs Pro. The cost grows with each call: about $18/mo if you use it on every Tutor turn (estimate: 20 Learners × 30 turns a day × 30 days = 18,000 calls). On the join form only, it is cents. **[uncertain]** Whether the $20 included usage credit on Pro covers these calls is not confirmed. |
| **C. WAF rate-limit rule** | Caps requests per IP or JA4 at the CDN, before the function and the DB | 1 rate-limit rule per project (inside the 3 custom rules). 1M allowed requests a month included. Fixed window from 10 s to 10 min. | Up to 40 rules. **[corrected]** Billed by region: $0.50 (iad1) to $0.55 (bom1) to $0.65 (sin1) per 1M allowed requests. Persistent actions (block an IP for a set time). | No code. The owner sets it in the dashboard. It is not in git: `vercel.json` rules allow only `challenge` and `deny`. | It counts per IP or JA4 only, so distributed bots get through. Many people behind one IP (iCloud Private Relay) share one count. Counters are per region. |
| **D. Cloudflare Turnstile** (standalone, **no proxy**) | A widget token, checked with Siteverify. Better Auth supports it (`provider: "cloudflare-turnstile"`). | Free (up to 20 widgets, unlimited challenges) | Free (same) | A Cloudflare account and widget. 2 env vars (site key and secret). A widget component on the join and login forms. An `x-captcha-response` header on both fetches. The plugin `endpoints`. About 100 to 150 lines (estimate). | The managed mode can show a checkbox. It adds a third-party script and a second vendor account. A token is single-use and valid for 300 s. |
| **E. Cloudflare as a reverse proxy in front of Vercel** | The full Cloudflare WAF and bot product | Cloudflare plan | Cloudflare plan | DNS change, second proxy | **Reject.** Vercel says its Bot Protection managed ruleset does not work behind a reverse proxy. A proxy also adds a second hop. The owner does not want it. |
| **F. Vercel Bot Protection managed ruleset** | Challenges clients that do not act like a browser, on the whole site. Verified bots are not checked. | Free | Free | No code. Dashboard (log or challenge mode). Off by default. | A fetch outside a valid 1-hour challenge session fails. Use log mode first, if at all. |
| **G. Daily Tutor cap for each Learner** (quota) | A hard stop on model cost for each approved person | Free | Free | About 30 to 60 lines (estimate): count turns since midnight India time (`spend.ts` already counts turns and has India-time helpers), and refuse with a plain message. Probably no migration (not checked). | A real heavy user can hit the cap. The owner picks the number. |
| **H. (Verifier's idea, not researched in depth) Keep part of the daily email cap for invited addresses** | Invited Learners can still get a link when a script fills the cap | Free | Free | A code change in `src/auth/email-throttle.ts`: for example, count invited and other addresses against separate caps. The invite list already exists (`src/auth/invites.ts`). | Protects only invited people, not new strangers. It needs its own design and tests. |

## Facts with sources

All pages were read on 2026-11-14. The "updated" date is the date on the page.

**Vercel BotID**
- BotID is on all plans. Basic is free on all plans. Deep Analysis costs $1 per 1,000 `checkBotId()` Deep Analysis calls on Pro, and a custom price on Enterprise. "Passive page views or requests that don't invoke the `checkBotId()` function are not charged." Source: https://vercel.com/docs/botid (updated 2026-06-16). Confirmed by https://vercel.com/pricing ("Basic checks included / $1 per 1,000 Deep Analysis checks").
- Basic "validates the integrity and correctness of the challenge response, catching many less sophisticated bots". "Deep Analysis runs only after the Basic validation has passed." The same page names Playwright and Puppeteer as tools that sophisticated bots use. Source: https://vercel.com/docs/botid (2026-06-16).
- "Vercel automatically routes BotID challenge and detection requests. You don't need the `withBotId` wrapper in your Next.js configuration… Existing BotID rewrites can be removed." For Next.js 15.3+, use `initBotId()` in `instrumentation-client.ts`. A route that is missing from the client protection list makes `checkBotId()` fail. Local development returns `isBot: false`. Deep Analysis is turned on in Firewall → Rules (Pro and Enterprise). Source: https://vercel.com/docs/botid/get-started (read 2026-11-14).
- **[corrected]** The server check needs the project's Vercel OIDC token. In `botid@1.5.13`, `checkBotId()` reads the `x-vercel-oidc-token` header (or `VERCEL_OIDC_TOKEN`). Without it, it throws "Do you have the OIDC option enabled in the Vercel project settings?". Vercel adds this header at runtime when Secure Backend Access with OIDC Federation is on (Settings → Security). Sources: the `botid@1.5.13` npm package (`dist/server/index.mjs`), and https://vercel.com/docs/environment-variables/system-environment-variables. **[uncertain]** Whether this setting is on for `finance-agent`: the read-only project summary does not show it. Check it before you build.
- BotID vs Turnstile: BotID "requires a project to be deployed on Vercel". Turnstile "runs on any host or CDN and is free with unlimited verification" (up to 20 widgets). Turnstile tokens are "valid for 300s, single-use". Source: https://vercel.com/kb/guide/vercel-botid-vs-cloudflare-turnstile (read 2026-11-14). **[corrected]** The earlier quote "with or without Cloudflare" is not on that page.

**Vercel WAF**
- Rate limiting is on all plans. Hobby: "1 per project" rate-limit rule, "within their total of 3 custom firewall rules", and "1,000,000 Allowed requests" included. Pro: 40 rules per project, billed by use. Keys on Hobby and Pro: IP and JA4 Digest. Window: 10 s to 10 min. Algorithm: fixed window. "Rate limit counters are tracked on a per-region basis." Source: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting (updated 2026-08-28). Confirmed by https://vercel.com/pricing (Custom Firewall Rules "Up to 3" on Hobby and "Up to 40" on Pro; "1M allowed requests / month included"; "Starting at $0.50 per 1M allowed requests").
- **[corrected]** The rate-limit price depends on the region the requests come from: $0.50 per 1M allowed requests in iad1, $0.55 in bom1 (Mumbai) and $0.65 in sin1 (Singapore). Sources: https://vercel.com/docs/pricing/regional-pricing/iad1, /bom1 and /sin1 (read 2026-11-14).
- Custom rules, IP blocking and DDoS mitigation are free. "WAF deny, challenge, or rate-limit mitigated traffic does not incur CDN Requests or Fast Data Transfer." Requests that pass a challenge count as normal usage. Source: https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing (updated 2026-06-16).
- Persistent actions are on Pro and Enterprise only. Rules in `vercel.json` support only `challenge` and `deny`. Deny or challenge rules can also block Vercel Cron requests. Source: https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules (updated 2026-09-10).
- The challenge proves "a real web browser with JavaScript capabilities". A session is valid for 1 hour. "API routes that are protected by a challenge rule can only be accessed within a valid challenge session", and "Automated tools and scripts cannot establish challenge sessions." Source: https://vercel.com/docs/vercel-firewall/firewall-concepts (read 2026-11-14).
- The Bot Protection and AI Bots managed rulesets are on all plans. Bot Protection "is inactive by default". "Bot Protection doesn't work when a reverse proxy (e.g. Cloudflare, Azure, or other CDNs) is placed in front of your Vercel deployment." Source: https://vercel.com/docs/bot-management (updated 2026-09-10).
- Attack Mode "is available for free on all plans", and its blocked requests do not count towards usage. Source: https://vercel.com/docs/vercel-firewall/attack-mode (updated 2026-08-11).
- Pro is $20/mo with "$20 of included usage credit". Source: https://vercel.com/pricing (read 2026-11-14). **[corrected]** On Hobby, if you go over a usage limit, "you will have to wait until 30 days have passed before you can use the feature again" (most cases). Source: https://vercel.com/docs/plans/hobby (read 2026-11-14).

**Cloudflare Turnstile**
- Free plan: free, up to 20 widgets, unlimited challenges, 10 hostnames per widget, 7-day analytics. Enterprise adds ephemeral IDs and removes Cloudflare branding. Source: https://developers.cloudflare.com/turnstile/plans/ (updated 2026-08-14). Confirmed by the Vercel KB guide above.
- "Turnstile can be embedded into any website without sending traffic through Cloudflare." The managed widget "automatically decides whether to show a checkbox based on visitor risk level". Sources: https://developers.cloudflare.com/turnstile/ (updated 2026-08-14) and https://developers.cloudflare.com/turnstile/get-started/ ("You can use Turnstile on any website, regardless of whether it is proxied through the Cloudflare network").

**Better Auth (repo pins 1.7.17)**
- The `captcha` plugin supports Turnstile, reCAPTCHA, hCaptcha, CaptchaFox and **Vercel BotID**. By default it protects only `/sign-up/email`, `/sign-in/email` and `/request-password-reset`. Magic link and social sign-in need an explicit `endpoints` list, and that list replaces the defaults. BotID needs no `secretKey` and no `x-captcha-response` header. Its `initBotId` paths must be the full browser paths (`/api/auth/...`). "BotID does not support native HTML form submissions." Source: https://github.com/better-auth/better-auth/blob/v1.7.17/docs/content/docs/plugins/captcha.mdx. The installed 1.7.17 code matches: `dist/plugins/captcha/verify-handlers/vercel-botid.mjs` returns 403 when `isBot` is true. A thrown error becomes a 500. PR better-auth#11016 (merged 2026-09-22) added the provider and pins `botid` ^1.5.10 in its tests.
- Rate limit: on in production by default, 100 per 10 s globally. Hardened defaults (release notes for 1.5): sign-in and sign-up 3 per 10 s. Rejected requests are not counted. A window resets when the full window has passed since the last allowed request. Sources: https://github.com/better-auth/better-auth/blob/v1.7.17/packages/better-auth/src/api/rate-limiter/index.ts and `docs/content/blogs/1-5.mdx`.

**Next.js 16**
- Order of execution: config headers → redirects → **proxy** → `beforeFiles` rewrites → files → `afterFiles` rewrites → dynamic routes → `fallback` rewrites. So `src/proxy.ts` sees a path before any rewrite does. Source: https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/proxy.mdx
- **[corrected]** `withBotId` (`botid@1.5.13`, `dist/next/config`) adds its rewrites to `beforeFiles` only when the config already returns a `beforeFiles` object. Otherwise it adds them as a plain array, which Next.js applies as `afterFiles`. This repo has no rewrites, so they would be `afterFiles`. Either way they run after proxy. It also adds `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` headers on its own paths.

## How it fits this repo

- **Better Auth config**: `src/auth/better-auth.ts`. Add `captcha({ provider: "vercel-botid", checkBotId, endpoints: ["/sign-in/magic-link", "/sign-in/social"] })` to `plugins`, before `nextCookies()` (which stays last). Keep `rateLimit.customRules` as it is.
- **Client challenge**: a new `src/instrumentation-client.ts` with `initBotId({ protect: [{ path: "/api/auth/sign-in/magic-link", method: "POST" }, { path: "/api/auth/sign-in/social", method: "POST" }] })`. There is no client instrumentation file today. `src/instrumentation.ts` is the server one and is only for the E2E test bed.
- **Forms**: `src/app/login/email-link-form.tsx` and `src/app/login/google-button.tsx` already use `fetch`, so BotID can attach its headers. Add one plain message for a 403 "verification failed". The spec's join page (§7.7) and the inline Home form (§7.2.8) must call the same endpoints with `fetch`. If they get their own route (for example `/api/join`), call `checkBotId()` in it and add the path to `initBotId`.
- **Proxy**: `src/proxy.ts` already skips `/api/auth/*` (the matcher excludes `api/auth` as a whole path segment), so BotID's server check runs inside the Better Auth route. Do **not** add `withBotId` to `next.config.ts`: Vercel says you do not need it. If you added it, its rewrites (`afterFiles` in this repo) would run after `proxy.ts`. Proxy would then redirect a signed-out visitor's BotID requests to `/login`. It would also add frame headers next to the site-wide `X-Frame-Options: DENY`. Check in a preview that the challenge loads for a signed-out visitor.
- **OIDC** **[corrected]**: before you build, check that Settings → Security → Secure Backend Access with OIDC Federation is on for `finance-agent`. If it is off, `checkBotId()` throws in production and both sign-in POSTs answer 500. Do not change it as part of this research.
- **Tests**: `checkBotId()` returns `isBot: false` in development. The E2E test bed runs `npm run dev` (`playwright.config.ts`), so `npm run dev` and the E2E test bed keep working. Unit tests mock `botid/server`. Add a test that a bot verdict gets 403 and sends no email. Add a test that a thrown check does not send an email.
- **WAF rule** (the owner sets it in the dashboard; this research changes nothing): *if* the path starts with `/api/auth/sign-in` *and* the method is `POST`, rate limit to 10 requests per 60 s per IP and answer 429. You can add `/api/login` POST to the same rule as an OR group. This is looser than the app limits, so it only cuts floods before they reach Neon. It is not in git, so record it in `docs/architecture.md` or an ADR. Do not add deny or challenge rules that match `/api/cron/library-refresh`.
- **Tutor cap**: `src/app/api/turn/route.ts` → `runTutorTurn` in `src/tutor/turn.ts`. It can refuse a new turn (not a resume or stop) after N turns since midnight India time. The count can reuse the turn query in `src/tutor/spend.ts`. This is a separate build issue.
- **CI and build**: no change to `.github/workflows/ci.yml`, `vercel.json` (its `buildCommand` is `npm run vercel-build`, which runs `node scripts/migrate-on-build.mjs && next build`) or `scripts/migrate-on-build.mjs`. BotID needs no env var that you set by hand. It does need the OIDC setting above.

## Recommendation

**Use the free Hobby mix when you turn Better Auth on:**
1. **BotID Basic** on `POST /api/auth/sign-in/magic-link` (required) and `POST /api/auth/sign-in/social` (cheap, same plugin). This is the only layer here that makes a scripted drain of the daily email cap hard. First confirm that OIDC Federation is on.
2. **One WAF rate-limit rule** on `POST /api/auth/sign-in/*`. It stops floods at the CDN, at no cost on Hobby, before function calls and DB writes.
3. **Keep** the DB limits (per IP, per address, 90 a day) and the hand approval. They stay the last guards.
4. **Tutor**: add a daily turn cap for each Learner (quota). Do not add a bot challenge to `/api/turn` now. The route already needs an approved sign-in. A challenge there could block a real Learner in the middle of a lesson and protects little.
5. *(Optional, verifier's idea)* Keep part of the 90 daily emails for invited addresses. Then a drain cannot lock out invited Learners, even if a bot passes BotID.

**Trade-off:** BotID Basic does not stop a skilled bot that runs a real browser (Playwright). To stop that you need Deep Analysis, and Deep Analysis needs Pro ($20/mo, plus cents for join traffic). This beta has about 20 hand-approved people, and approval is the final gate. Google sign-in and existing sessions also keep working during a drain. So that extra protection is not worth $20/mo yet. If the Firewall tab shows bots passing BotID, switch the two join paths to `deepAnalysis` on Pro. The code change is one line on each side. Turnstile is the free fallback if you stay on Hobby. It needs more code and can show a checkbox.

**Incident lever (no setup):** Attack Mode is free on all plans. Turn it on in the dashboard during an attack.

## Decision needed from the owner

1. **(Recommended)** Hobby mix: BotID Basic on the 2 Better Auth sign-in POSTs (after you confirm OIDC Federation is on) + 1 WAF rate-limit rule on `/api/auth/sign-in/*` + a daily Tutor turn cap for each Learner (pick N, for example 60 turns a day). Optional: keep part of the daily email cap for invited addresses. Cost: $0.
2. Same as 1, plus Pro now for BotID Deep Analysis on the join paths. Cost: $20/mo + $1 per 1,000 Deep Analysis checks (cents at join volume). Pro rate-limit usage is $0.50 to $0.65 per 1M allowed requests, depending on the region.
3. Cloudflare Turnstile (standalone, no proxy) instead of BotID, plus the WAF rule and the Tutor cap. Cost: $0. More code, and visitors may see a checkbox.

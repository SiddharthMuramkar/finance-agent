# Handoff: Finance Agent

Written 2026-11-01, at the end of a design session. This file carries everything to a new Claude Code session on another machine. It replaces the old `SPEC.md`, which the owner never really reviewed and asked to delete. Don't revive that spec's decisions. It remains in git history at commit `7a87a21` if an idea from it is ever useful.

## Start here

```bash
git clone -b handoff git@github.com:SiddharthMuramkar/finance-agent.git
cd finance-agent
```

Use plain `git clone` without `-b handoff` once this branch is merged into `main`.

Then run these in Claude Code, in this order. The owner types each command, because Claude can't start them itself, and Claude does the work.

1. `/grill-with-docs @HANDOFF.md` works through the open questions below, one at a time.
2. `/to-spec` turns that conversation into a spec and publishes it as a GitHub issue. Run it in the same session as the grilling, because it builds from the conversation and doesn't interview.
3. `/to-tickets` splits the spec into tickets with blocking links, also as GitHub issues.
4. `/implement-spec` has Claude build from the spec and its tickets. `/implement <ticket>` does a single ticket.

If these commands are missing on this machine, install them with `npx skills add mattpocock/skills`. The repo's settings for them are already in `docs/agents/`.

Also read `GLOSSARY.md` and use its terms. Evidence for everything below is in `docs/research/`.

## How to work with the owner

- **One question at a time.** Give a recommended answer, worded so "yes" accepts it. Never send a round of questions.
- **The owner doesn't type or read code.** Claude writes all of it. The owner reviews the architecture.
- **The learning goal is the abstraction layers.** The owner wants to understand and explain them, for themselves. Explain each layer as it gets built. No quizzes, walkthroughs, pass marks or manual chores for the owner ("dont give me manual hard stupid work").
- **Reuse before writing.** Check current docs with Context7 and search for what's already built before writing each piece. Bring any new library or service to the owner before adding it.
- **Plain words.** Define new terms, use concrete scenarios and state the trade-off.
- **Prove it works.** Use tests and real runs, and report the results honestly.

If the owner wants to move quickly, offer "yes to the rest of the recommendations" as an option.

## The product

An AI tutor that teaches one adult finance and economics seriously. The owner's words: an agent that can "teach explain help and work with me". It's meant to "really learn finance", including bonds, yields, global markets and economics, and to be able to understand writers like Ed Zitron or Aswath Damodaran. It's "not meant for kids".

The project exists because the owner has about $200 a month of Claude API credits for building agents.

## Decisions settled

| Decision | Detail |
|---|---|
| Who it's for | Only the owner, on Vercel behind a simple passcode. |
| Main product | The Study Workspace: chat with the Tutor beside charts and calculators to play with, the sources behind each answer, and what has been learned. |
| Market Workbench | Comes after the Study Workspace, possibly sooner than first planned, because the last Stage needs real company documents and data. |
| Guided learning | The Tutor leads through a Course Map and remembers where the Learner was. The Learner can ask anything at any time and then return. |
| Scope | All of finance and economics. Serious and adult, with real numbers, real documents and proper terms. Damodaran and Buffett are sources, not the whole course. |
| Finish line | All three Stages: **Follow** the writers, **Judge** their arguments, then **Analyse** a company or story and reach an own view. The owner answered "all 3". |
| Tutor's character | The LLM stays itself, with no role-play. It uses RAG when it needs a quote or context. |
| Checks | Both conversation and quizzes. |
| Agent loop | Not hand-written. The owner said "dont write our own loop i want to acutally build stuff". |
| SDK | Anthropic SDK, because the credits only work on Anthropic's platform. |
| Model | Start with `claude-sonnet-5-5` at `medium` effort, as a setting that can change. Compare with Haiku 5.5 on real tutoring questions once the Tutor works, then choose from the results. |
| Stored data | The owner wants RAG plus SQL. The source material stays in the private database and never goes in this public repo. |

## Open questions

Ask these one at a time, in this order. Each recommendation can be overruled.

### How the agent runs

1. **Which ready-made loop?** Recommend the Anthropic SDK's Tool Runner in TypeScript. It runs inside a Vercel function, streams live, keeps history in our own SQL, and has no fees beyond tokens. Managed Agents costs $0.08 per running hour, adds a sandbox per session, keeps history outside SQL, and only streams text through best-effort previews. The Agent SDK's 328 MB binary exceeds Vercel's 250 MB Node limit. Trade-off: Tool Runner is in beta (pin the version), and we own the resume logic. See `docs/research/harness.md`.
2. **One app or two?** Recommend one Next.js TypeScript app on Vercel, with ingestion scripts run separately. Browser calculators are TypeScript anyway, and there's one thing to deploy.
3. **How is conversation history handled?** Recommend append-only within a session. On Sonnet 5.5, changing the system prompt, tools or earlier messages invalidates thinking blocks, which means a 400 error on accounts created on or after 2026-08-31. So: freeze the system prompt at session start, add changing context as appended messages, store assistant content unchanged including thinking blocks, and use on-demand compaction for long sessions. A new session starts fresh from SQL.
4. **What decides the next step: code or prompt?** Recommend code. The harness picks the Topic and step from the Course Map and progress, and the model teaches it. A [Harvard trial](https://www.nature.com/articles/s41598-025-97652-6) found a prompt couldn't reliably sequence multi-part problems. A [PNAS experiment](https://www.pnas.org/doi/10.1073/pnas.2422633122) showed the same model giving very different results depending on the harness around it. This speaks to the owner's question about how much the harness matters.

### Memory and the course

5. **What is a lesson, and how does the Tutor know where you stopped?** Scenario: you're halfway through a Topic on Tuesday and close the app. On Thursday, the Tutor should know that. Recommend not tracking "lessons" at all. Save progress when a Topic starts and after each Check. Also settle the meaning of "session", which is overloaded (a conversation thread versus a login).
6. **What does the Tutor remember?** Recommend structured SQL rows per Topic (status, evidence, misconceptions), plus a short plain-text summary given to the model. In [Khan Academy's A/B tests](https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/), a structured summary of recent attempts and surfacing unmastered prerequisites both helped, while raw JSON logs did nothing until converted to text. Reject memory frameworks such as mem0 and Letta, because they hide this layer. Cogni has code worth reading.
7. **How is the Course Map built?** Recommend a prerequisite graph rather than a single line, drafted by Claude from the research and reviewed by the owner. Default path: option E in `docs/research/course-ordering.md`. To resolve: that path puts financial statements after bonds and macro, while `docs/research/destination.md` suggests statements much earlier. Neither sample writer covers duration, balance of payments or Indian markets, so they can't define the whole course.
8. **What does each Stage involve?** `docs/research/destination.md` defines six skills: follow, recompute, build a valuation (Damodaran's skill), trace cash and credit (Zitron's skill), adjudicate between writers, and transfer to other markets. Recommend mapping them onto Follow, Judge and Analyse. Candidate capstone: both writers read the same Anthropic S-1 on the same day and reached different conclusions.
9. **How do quizzes work?** Recommend quizzes for quick recall and conversation for reasoning. Spaced review could use `ts-fsrs`. Decide who writes quiz items and where they're stored.

### Library and retrieval

10. **Is it Neon only?** Recommend yes: one store with joins between material and learner data. Pinecone's free tier is locked to `us-east-1`, and a second store has to be kept in sync. Neon's free plan has a 6-hour history window, which is a risk for progress data; its paid Launch plan has no minimum.
11. **How does search work?** Recommend hybrid: BM25 keyword search plus vectors, merged in SQL. Anthropic sells no embeddings. Voyage's free 200M tokens dwarf the estimated 3-4.5M token corpus, though standard rate limits need a payment method. Confirm Neon's `lakebase_text` and `lakebase_vector` work on the free plan; if not, fall back to pgvector plus Postgres full-text search. Judge any change with 20-50 test questions. See `docs/research/retrieval.md`.
12. **What goes in the Library?** Recommend starting with Damodaran's site and blog, OpenStax (economics, finance and accounting), Yale's ECON 251 and 252 transcripts, and the RBI, Fed and New York Fed primers. That's close to option E in `docs/research/open-sources.md`. No single source covers everything, and the main gaps are India-specific depth and tech-company finance; SEC EDGAR filings help with the second. See "Source terms" below. Buffett's letters are the owner's call, so ask directly. At ingestion, check for corrupted PDF text and use vision for charts: one Damodaran slide file turned "creation" into "CreaAon".
13. **How do citations work?** Recommend Anthropic's native `search_result` blocks with citations on, rather than a home-made format. Test them live with Tool Runner, because this was only confirmed by reading SDK source. Citations can't combine with structured outputs, so charts and calculators must go through tool calls.

### The Study Workspace

14. **How does the Tutor put charts, calculators and quizzes in the chat?** See "OpenUI" below. Recommend a small prototype comparing OpenUI with one plain tool per widget, then choosing. Either way, moving a slider recomputes in the browser and costs no tokens.
15. **What's the chat base?** Recommend the `assistant-ui` library with its external-store runtime, reusing layouts from Anthropic's `managed-agents/assistant-ui` quickstart. Its event reducer and API routes must be rewritten, because they assume Managed Agents. See `docs/research/existing-projects.md`.
16. **How do we keep the maths right?** Recommend checked calculators using `formula.js`, plus Anthropic's hosted code execution tool for one-off sums. Code execution proves the arithmetic ran, not that the formula is right. Use rupee, lakh and crore formats. No maintained finance widget library was found, so these get built. Anthropic's finance quickstart has growth and payoff charts to start from, but check their formulas.
17. **What does "really good" look like?** Ask about laptop or phone first, reference products the owner admires, and light or dark. This shapes the whole UI.
18. **How does the owner see the layers?** Recommend a short architecture note, plus an "under the hood" panel per turn showing steps, tools, tokens and cost. Store usage rows in SQL. Decide on outside tracing later, because Vercel Hobby keeps logs for only 1 hour.

### Scope edges

19. **Web search and real data?** The Tutor may need current events and real data to read writers like Zitron. Options: Anthropic's web search at $10 per 1,000, or Octen at $1 per 1,000 through its REST API. For real charts, BIS, the World Bank, IMF data and EDGAR look usable, plus RBI DBIE for India, though its API is unconfirmed. FRED's terms bar storing its data without consent, so query it live or get consent.
20. **When does real-company analysis arrive?** The Analyse Stage needs filings and data. Decide when the Market Workbench starts.
21. **Where's the advice line?** Recommend that the Tutor questions the Learner's reasoning but doesn't make buy, sell or hold calls. The owner hasn't decided this.
22. **How do we compare models?** Recommend the same tutoring questions through Haiku and Sonnet, with answers and costs side by side. A stronger model can do first-pass grading, so the owner isn't stuck with manual marking. Khan Academy's main metric, correctness on the next item without help, is worth copying. No study found compares cheaper models under the same harness.
23. **A weekly progress report?** It was in the deleted spec, and the owner hasn't confirmed wanting it. Recommend leaving it for later.

## OpenUI

The owner asked how [OpenUI](https://www.openui.com/docs/mcp) could fit. Two different things go by that name here.

- **The linked MCP page is for coding agents, not the product.** It gives Claude access to OpenUI's docs through Context7 (`/thesysdev/openui`), which already works. There's also an optional agent skill: `npx skills add thesysdev/skills --skill openui`.
- **The OpenUI library is the useful part.** It lets a model write a compact UI language that renders progressively as React components that we define. MIT licence, about 14,600 stars, `@openuidev/react-lang` at 1.0.2, last pushed 2026-10-31.

How it could fit: we define our own components (`Calculator`, `Chart`, `Quiz`, `SourceCard`), and the Tutor composes them per lesson, for example a discounting chart beside a question. The formulas stay in our checked code, and the Tutor only picks the widget and starting numbers. `@openuidev/assistant-ui` renders it from tool calls, which leaves the Tutor's prose free to carry citations. Fixed pages such as the Course Map and progress stay ordinary React.

Unknowns and risks:
- Nothing has been run yet. Whether it works with our own backend and Tool Runner needs a prototype.
- Models can produce invalid output. The parser drops invalid parts, but automatic correction is a Thesys service ([Gateway or Autofix](https://www.openui.com/docs/production)), which the Claude credits presumably don't cover. We'd need our own fallback.
- The component instructions add to the system prompt, and the package set is another layer to explain.
- With only a few widgets, one plain tool per widget may be simpler. Anthropic's `copilot-kit-ag-ui` quickstart does it that way.

## Source terms

Not legal advice. Full quotes are in `docs/research/sources.md`.

| Source | What it says | Handling |
|---|---|---|
| Damodaran's site | "An open site with very few rules": don't sell the data, and acknowledge it. The heading only mentions data and spreadsheets, but he says he's "lax" about slides | Use, with credit |
| Damodaran's blog | No licence statement found | Short quotes with credit |
| YouTube lectures | Embedding allowed, automated access and downloads barred | Embed only, no transcripts from YouTube |
| Berkshire's letters | Reproduction, distribution and even linking need written permission | Owner's call. India's fair dealing rule covers private use and electronic storage, but whether that holds on cloud hosting and through an API is a lawyer's question |
| CNBC Buffett Archive | No bots, copying or archiving, even non-commercially | Read or watch only. Do not fetch it automatically |
| *The Essays of Warren Buffett* | Paid book, all rights reserved | Read alongside, don't ingest |
| OpenStax | CC BY-NC-SA 4.0, with an official Git source | Use, non-commercially, with credit |
| Investopedia | Bars scraping, downloading and AI use | Keep out of the Library |
| IMF, FRED, St. Louis Fed, SEBI | Restrict bulk download, storage or database use, or ask for permission | Don't ingest without permission |

Anything beyond one private learner needs a rights check. More sources and quotes are in `docs/research/open-sources.md`. No source's terms address private RAG directly, so that remains a judgement call.

## Platform facts

Verified against vendor docs on 2026-11-01, with nothing tested live. Recheck with Context7 before coding.

**Anthropic**
- [Credits](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers) cover the Claude API, Managed Agents, the Agent SDK and the playground. They don't cover Claude Code. They expire monthly, and new subscribers wait 7 days. Other vendors, such as embeddings, are separate spend.
- Keep the key in `.env`, not in shell settings, because [Claude Code uses `ANTHROPIC_API_KEY`](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan) if it's set.
- Sonnet 5.5 costs $2 in, $10 out and $0.10 for cache hits per million tokens ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)). A rough estimate is 3 cents per exchange, plus thinking.
- Sonnet 5.5 thinks by default, and thinking counts toward `max_tokens`, so don't set that low. Read responses by block type. Handle the `max_tokens` and `refusal` stop reasons explicitly. Forced `tool_choice` returns a 400.

**Vercel**
- [Hobby](https://vercel.com/docs/functions/limitations) allows 300 seconds per function, including streaming, and is for personal, non-commercial use.
- Functions [default to `iad1`](https://vercel.com/docs/regions), so set `sin1` to sit next to the database.
- [Deployment Protection](https://vercel.com/docs/deployment-protection) can answer with its own 401 on deployment URLs. Test auth against the production domain.
- [Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs), if needed, fires any time within the hour and doesn't retry failures.

**Neon**
- There's no India region. [Singapore](https://neon.com/docs/introduction/regions) is closest, and the region is fixed at creation.
- Use a new project, not the existing `finance-academy`, unless the owner says otherwise.
- [Use pooled connections for the app and direct for migrations](https://neon.com/docs/connect/connection-pooling).
- `pg_search` was retired in September 2026, so older guides are stale.

**Next.js**
- [`middleware` became `proxy.ts`](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) in v16.

**LangSmith, if chosen**
- New orgs use [agent-based workspaces](https://docs.langchain.com/langsmith/log-traces-to-agent) with different env vars.
- Serverless code [must flush traces](https://docs.langchain.com/langsmith/annotate-code) before returning.

## Before the first real API call

The owner's key has not been tested yet. These steps are the owner's:

1. Claim the credits at claude.ai under Settings > Billing, linking the Console organization to build in. The link can't be changed without contacting support.
2. In the Console, create a workspace for this project with a spend limit, and create a key there.
3. Add `ANTHROPIC_API_KEY=...` to a `.env` file in the repo root. It's gitignored. Never paste the key into chat.

Then Claude sends one tiny request to prove the key and credits work.

## Suggested first slice

Once the questions are settled, build one thin path end to end before anything else: one Topic, taught in a streaming chat, with one calculator, one cited source, and saved progress, deployed on Vercel behind the passcode. The owner wants to "acutally build stuff", so get this running early and grow from there.

## Research notes

| File | Covers |
|---|---|
| `docs/research/harness.md` | Tool Runner, Managed Agents, Agent SDK, Vercel fit, code execution |
| `docs/research/retrieval.md` | Neon, pgvector, Pinecone, embeddings, citations, PDF extraction |
| `docs/research/sources.md` | Damodaran and Buffett material, sizes and terms |
| `docs/research/existing-projects.md` | Reusable projects, charts, widgets, studies on AI tutors |
| `docs/research/destination.md` | What a reader needs to understand Zitron and Damodaran |
| `docs/research/course-ordering.md` | How CFA, MIT, Yale, CORE, OpenStax and NISM order the subject |
| `docs/research/open-sources.md` | Other sources for the Library, with licences |

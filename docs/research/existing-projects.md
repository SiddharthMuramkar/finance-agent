# What is already built that we could reuse

Research notes gathered on 2026-11-01. Prices, limits and terms change, so recheck before relying on them. This is not legal advice.

## Summary

Much of this already exists, but no single project covers it, so reuse means taking parts. The closest are Anthropic's own MIT quickstarts: a Next.js chat built on assistant-ui, and a finance assistant whose in-chat charts have sliders. Both assume Managed Agents. I found no maintained Next.js template for the plain SDK tool runner. Cogni (MIT, Claude, very small) has learner memory and mastery code worth copying. Neon's examples cover search, and one needs no embedding vendor. I found no maintained React library of finance teaching widgets, so TVM and DCF would be built, with formula.js for the maths. None of this forces the model choice now: it is one setting in each Anthropic quickstart checked. Studies suggest prompts, structured learner data and checked maths matter a lot, though LearnLM shows model training matters too. No study compares cheaper models under the same harness. Dropped as unmaintained or unlicensed: ai-sdk-rag-starter, ai-sdk-preview-rag, pgrag, Idyll, Tangle, finance.js, financial, Mr. Ranedeer, tutor-gpt, sokra-tutor, agent-sdk-demos, cma-chat-sdk, Tremor, AI Elements. Mafs is borderline: 19 months without a commit.

## Options

### CHAT: Anthropic quickstart managed-agents/assistant-ui (https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/assistant-ui)

- **Fit:** MIT. Folder last commit 2026-10-23; repo 19,071 stars. Closest match for a Next.js chat with Claude and streaming tool calls. Reuse: chat layout, sidebar, per-tool cards, source cards, the client-executed show_chart pattern, and the event-to-UI reducer. Replace: the spreadsheet agent, bash and pandas tools, and the no-database design, since this project wants SQL. Vendors: Anthropic and assistant-ui only. The reducer keeps the layers visible.
- **What would break it:** The account lacks Managed Agents access, or the streaming gate is off, so replies arrive whole. If the project chooses the Messages API with the tool runner, the reducer and API routes must be rewritten because they read Managed Agents events.
- **Cost:** Code is free. Claude usage comes from credits. Managed Agents session charges were not checked here.

### CHAT: assistant-ui library (https://github.com/assistant-ui/assistant-ui)

- **Fit:** MIT, with an optional paid cloud. Last commit 2026-10-30; 12,883 stars. Reuse: thread, composer, tool UI and approval components, plus examples/with-external-store, with-generative-ui and with-interactables. useExternalStoreRuntime lets our own backend drive the UI, so it works with any of the Anthropic runtimes. Replace: the default useChatRuntime, which assumes the Vercel AI SDK.
- **What would break it:** The packages used by the quickstart are still 0.14.x, so APIs may change. Taking the default AI SDK path would add a layer between us and the agent.
- **Cost:** Free. Assistant Cloud is optional and not needed if threads live in SQL.

### CHAT: Anthropic quickstart managed-agents/copilot-kit-ag-ui with CopilotKit (https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/copilot-kit-ag-ui, https://github.com/CopilotKit/CopilotKit)

- **Fit:** Quickstart MIT, folder last commit 2026-10-23. CopilotKit MIT, last commit 2026-10-30, 38,445 stars. Same domain as ours, with the finance assistant prompt as a starting point. Reuse: the tool-to-widget pattern. Replace: Vite and Express if staying on Next.js, the advice-oriented prompt, and the claude-fable-5 model line. Framework flag: the CopilotKit runtime and AG-UI adapter sit between the UI and the agent, which hides layers.
- **What would break it:** The AG-UI adapter is version 0.0.1. Its notes record tool arguments changing shape by version, and sessions are held in memory, which the README calls fine for a demo only. The README's Vercel route hosts only the frontend, with the server on another Node host. There are no tests.
- **Cost:** Free. A second host for the server may be needed, and that cost was not checked.

### CHAT: Anthropic quickstart managed-agents/chat-sdk (https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/chat-sdk)

- **Fit:** MIT. Folder last commit 2026-10-23. Reuse: session-per-conversation design, a live tool-call feed, and a published Vercel deployment guide (https://vercel.com/kb/guide/claude-managed-agents-vercel-services). Replace: the research analyst and the Hono and esbuild app shell, since it is not a Next.js app. Framework flag: Vercel Chat SDK and AI SDK v7 hooks on the frontend.
- **What would break it:** The request stays open for the whole turn. Vercel's guide gives a 300-second default and up to 800 seconds on Pro and Enterprise. Same streaming gate as other Managed Agents quickstarts.
- **Cost:** Free. Vercel plan needs depend on turn length.

### CHAT: vercel/chatbot (https://github.com/vercel/chatbot)

- **Fit:** Apache-2.0 (GitHub shows 'Other', but the LICENSE file is Apache). Last commit 2026-07-08; 21,022 stars. Reuse: Next.js 16 shell, Drizzle schema for chat history on Neon, and Auth.js. Replace: the Vercel AI Gateway and model list (Mistral, Moonshot, DeepSeek, OpenAI, xAI as shipped, no Anthropic), and the AI SDK agent layer if we want the Anthropic SDK directly.
- **What would break it:** Vendor and framework flag: it is built around AI SDK and AI Gateway, so the agent loop sits inside the framework and gateway spend falls outside the Claude credits. Removing the AI SDK touches most of the chat code.
- **Cost:** Free template. Neon and Vercel usage apply.

### CHAT: Anthropic quickstart financial-data-analyst (https://github.com/anthropics/claude-quickstarts/tree/main/financial-data-analyst)

- **Fit:** MIT. Folder last commit 2026-10-23. Reuse: chart tool schemas and Recharts rendering where Claude picks the chart. Replace: Next 14 and React 18, and the single non-streaming messages.create call.
- **What would break it:** It does not stream and has no agent loop, so it cannot serve as the chat base. It renders static charts from data rather than explorable widgets.
- **Cost:** Free.

### CHAT: vercel/streamdown (https://github.com/vercel/streamdown)

- **Fit:** Apache-2.0 per its LICENSE file. Last commit 2026-10-29; 5,741 stars. Reuse: streaming markdown rendering with KaTeX maths, installable standalone. Needs nothing replaced, and the README presents it as a react-markdown replacement.
- **What would break it:** Integration with assistant-ui was not tested. The quickstart uses assistant-ui's own markdown package, so it may be unnecessary.
- **Cost:** Free.

### TUTOR: Cogni (https://github.com/arshawnarbabi/Cogni)

- **Fit:** MIT. Last commit 2026-10-31; 6 stars; one human maintainer; marked beta. The closest tutor project on our stack (Next.js 16, Anthropic SDK, Recharts). Reuse: lib/agents/memory.ts (one Haiku call per session, capped digest of about 800 tokens), lib/mastery.ts (one evidence-update rule), lib/fsrs.ts, Socratic mode prompts, mastery decay, and the prerequisite graph. Replace: Supabase with Neon, the hand-written while (iterations < 5) loop, SDK ^0.96, and OpenAI embeddings and TTS.
- **What would break it:** Single maintainer and little outside use. It is designed for university courses, exams and grades, not a guided finance course. Mastery code is tied to Supabase RPCs, so copying means rewriting the data access. Vendor flag: OpenAI for vector RAG, though keyword search is the fallback.
- **Cost:** Free. Copied code becomes ours to maintain.

### TUTOR: DeepTutor (https://github.com/HKUDS/DeepTutor)

- **Fit:** Apache-2.0. Last commit 2026-10-31; 53,301 stars. Use as a design reference: inspectable three-layer memory (raw traces, curated facts, synthesis), mastery paths, and source-linked reading. Replacing it wholesale is not practical; read it rather than copy it.
- **What would break it:** It has a Python FastAPI backend, and default state lives in files and SQLite under one mounted directory, so it does not fit Vercel plus SQL as it stands. About 21 MB of Python and 12 MB of TypeScript is far too much for a non-coding owner to audit. Framework and vendor flag: LlamaIndex, LightRAG and many LLM providers.
- **Cost:** Free. Running it would need a separate server.

### TUTOR: OATutor (https://github.com/CAHLR/OATutor)

- **Fit:** MIT. Last commit 2026-10-21; 274 stars; research project with a CHI 2023 paper. Reuse: src/models/BKT/BKT-brain.js (Bayesian Knowledge Tracing) and its problem-selection heuristics. Replace: Firebase and the OpenStax maths content.
- **What would break it:** BKT needs exercises tagged to skills with sensible parameters, and a chat-first course may not produce those signals. There is no LLM agent layer to reuse.
- **Cost:** Free.

### TUTOR: ts-fsrs (https://github.com/open-spaced-repetition/ts-fsrs)

- **Fit:** MIT. Last commit 2026-10-29; 843 stars. Reuse: spaced-review scheduling as a small library, which Cogni already uses in production code. Nothing needs replacing.
- **What would break it:** Only useful if the course includes recall items such as flashcards or short questions.
- **Cost:** Free.

### TUTOR: memory frameworks mem0, Letta, Honcho (https://github.com/mem0ai/mem0, https://github.com/letta-ai/letta, https://github.com/plastic-labs/honcho)

- **Fit:** mem0 Apache-2.0, 2026-10-30, 68,208 stars. Letta Apache-2.0, 2026-10-18, 25,315 stars. Honcho AGPL-3.0, 2026-10-30, 7,870 stars. Each would supply a ready memory layer, but that overlaps the memory tool plus SQL.
- **What would break it:** Framework flag: they hide the memory layer the project wants visible. mem0 defaults to OpenAI for both LLM and embeddings. Honcho's AGPL has obligations if the app is ever offered to others.
- **Cost:** Free to self-host, plus hosting. Hosted plans were not checked.

### RAG: Neon ai/fuzzy-semantic-search-nextjs (https://github.com/neondatabase/examples/tree/main/ai/fuzzy-semantic-search-nextjs)

- **Fit:** Apache-2.0. Folder last commit 2026-09-11; repo 82 stars. Next.js search over tsvector, pg_trgm and pgvector with rank fusion, and no embedding vendor. Reuse: SQL, fusion logic, and local embedding scripts. Replace: the Netflix dataset, add a chunker for long sources, and add the Claude layer, since it is search only.
- **What would break it:** The query path loads the embedding model inside a function, so cold starts or Vercel size limits may be a problem (not tested). gte-small retrieval quality on finance text is unmeasured.
- **Cost:** Free. README says the Neon free tier suffices for the demo.

### RAG: Neon with-hybrid-search-api (https://github.com/neondatabase/examples/tree/main/with-hybrid-search-api)

- **Fit:** Apache-2.0. Folder last commit 2026-10-30. Reuse: heading-aware Markdown chunker, document update API, rank fusion, Drizzle schema, and tests. Keyword-only mode needs no embeddings. Replace: Hono on Neon Functions with Next.js routes.
- **What would break it:** Vendor flag: vector mode uses Neon AI Gateway, which needs a paid plan and prepaid credits outside Claude credits. lakebase_ann and lakebase_bm25 indexes are Neon-specific and need Postgres 16 or later.
- **Cost:** Keyword mode has no gateway cost. Vector mode costs a paid Neon plan plus credits; amounts not checked.

### RAG: forgekit (https://github.com/fabwaseem/forgekit)

- **Fit:** MIT. Created and last pushed 2026-10-16; 0 stars; 2 commits by one contributor. Next.js 16 with pgvector HNSW, upload-to-citation flow, and tool cards. Use as a reading example for lib/db/schema.ts. Replace: AI SDK, Better Auth, and Docker Postgres.
- **What would break it:** No maintenance record at all, so it barely clears the maintained test. Vendor flag: embeddings need OpenAI, Google or Ollama, and the Anthropic path covers chat only.
- **Cost:** Free.

### RAG: pgvector and pgvector-node (https://github.com/pgvector/pgvector, https://github.com/pgvector/pgvector-node)

- **Fit:** pgvector uses the PostgreSQL licence (GitHub shows 'Other'), last commit 2026-10-31, 23,554 stars. pgvector-node is MIT, last commit 2026-10-30, 445 stars. These are the plain building blocks, and Neon documents pgvector directly (https://neon.com/docs/extensions/pgvector). Nothing to replace.
- **What would break it:** They supply storage and search only. Chunking, embedding and citation handling remain ours to build.
- **Cost:** Free.

### RAG alternative: Anthropic managed-agents/knowledge-wiki (https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/knowledge-wiki)

- **Fit:** MIT. Folder last commit 2026-10-23. It distils a slow-changing corpus once into a Markdown wiki with provenance on every fact, then answers from that instead of re-reading documents. Damodaran and Buffett material is slow-changing. Needs no embedding vendor per its description. Replace: the M&A worked example.
- **What would break it:** The consolidation step uses a gated research preview. Exact-quote retrieval from a distilled wiki was not verified, and quotes are a core need here.
- **Cost:** About $25 to $35 and 40 to 60 minutes per run on its example corpus, per its README. Our corpus would differ.

### RAG reference: Anthropic cookbook contextual-embeddings (https://github.com/anthropics/claude-cookbooks/tree/main/capabilities/contextual-embeddings)

- **Fit:** MIT. Repo last commit 2026-10-29; 54,025 stars. Reuse: the method of adding context to chunks, and the evaluation setup. Replace: the Python notebook form.
- **What would break it:** Vendor flag: the notebook uses Voyage, Cohere and Elasticsearch, all outside the Claude credits.
- **Cost:** Free to read. Vendor costs apply if followed as written.

### WIDGETS: finance visuals in copilot-kit-ag-ui (https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/copilot-kit-ag-ui/web/src/viz)

- **Fit:** MIT. Folder last commit 2026-10-23. Reuse: GrowthProjection (compounding with sliders), PayoffTimeline, Comparison, finance.ts, and LineChart.tsx. They are plain React and SVG with no chart library, so they lift out cleanly; only renderers.tsx depends on CopilotKit. Replace: fmtUsd with rupee formats, and add teaching text.
- **What would break it:** Covers compounding and debt payoff only, with no present value, NPV or DCF. The project has no tests, so the formulas need checking first.
- **Cost:** Free.

### WIDGETS: formula.js (https://github.com/formulajs/formulajs)

- **Fit:** MIT per its LICENSE file (GitHub shows 'Other'). Last commit 2026-10-01; 823 stars. Reuse as the maths layer: FV, PV, NPV, IRR, MIRR, PMT, RATE, NPER, XNPV, XIRR, EFFECT, NOMINAL, matching Excel behaviour. Nothing to replace. It has no UI.
- **What would break it:** Excel sign conventions can confuse beginners unless wrapped. It carries jstat and bessel as dependencies, and bundle size was not measured.
- **Cost:** Free.

### WIDGETS: PlanDhan (https://github.com/yogeshwaran1998/financial-planner-calculator)

- **Fit:** MIT. Last commit 2026-06-29; 1 star. India-specific calculators (SIP, goal SIP, FD, RD, PPF, EMI, SWP, retirement) in Next.js with Recharts, with logic in src/lib/calculations.ts. Reuse: formulas and the India calculator list. Replace: Next 14 and Recharts 2, and page layouts built as calculators rather than lessons.
- **What would break it:** All activity spans about two days (16 commits) and no test script is present. Formula errors would directly teach wrong finance, so results need checking against formula.js.
- **Cost:** Free.

### WIDGETS reference: personal-finance-mcp (https://github.com/sarveshtalele/personal-finance-mcp)

- **Fit:** MIT. Last commit 2026-11-01; 6 stars. Python, 77 deterministic calculators including time value of money, DCF, dividend discount and Indian savings products, with a test suite. Reuse: formulas and test cases as a check for our TypeScript versions, and the idea that tools calculate while the LLM explains. Replace: the Python runtime.
- **What would break it:** Python does not fit a Next.js route directly, so it must be ported or hosted separately. The README's test count differs in two places (137 and 119). One maintainer.
- **Cost:** Free.

### WIDGETS reference: stockvaluation_io and Investment_Valuation_Agent (https://github.com/stockvaluation-io/stockvaluation_io, https://github.com/chrisuzy/Investment_Valuation_Agent)

- **Fit:** stockvaluation_io: Apache-2.0, 2026-09-14, 35 stars, Java and Python. Investment_Valuation_Agent: MIT, 2026-05-05, 2 stars, Python with React and TypeScript. Both follow Damodaran-style DCF. Reuse: DCF structure, story-to-numbers flow, and worked numbers as test cases for a teaching widget. Replace: their backends and real-company data flows.
- **What would break it:** Both are aimed at valuing real companies, closer to the possible later Market Workbench than to beginner teaching. The claim to match Damodaran's published numbers is the author's own and was not checked.
- **Cost:** Free.

### WIDGETS reference: Khan Academy Perseus (https://github.com/Khan/perseus)

- **Fit:** MIT. Last commit 2026-10-30; 1,594 stars. A production exercise renderer with a grading package and interactive graph widgets. Reuse: read its exercise format and perseus-score grading design. Replace: everything if adopted, since there are no finance widgets.
- **What would break it:** It has 22 Wonder Blocks peer dependencies plus aphrodite and underscore, and setup refers to internal Khan tooling. Heavy to adopt for one learner.
- **Cost:** Free to read. High effort to adopt.

### CHARTS: Recharts (https://github.com/recharts/recharts)

- **Fit:** MIT. Last commit 2026-11-01; 27,679 stars. React components that work with React 16 to 19, and already used by the Anthropic analyst quickstart, Cogni and PlanDhan. Suits the slider-beside-chart pattern, since sliders change state and the chart redraws.
- **What would break it:** Docs lookup confirmed dragging only for Brush range selection. Dragging points on the chart itself was not confirmed, so direct manipulation may need custom work.
- **Cost:** Free.

### CHARTS: visx (https://github.com/airbnb/visx)

- **Fit:** MIT. Last commit 2026-06-22; v4.0.0 released 2026-06-11; 21,092 stars. Low-level React primitives including visx-drag, visx-annotation and visx-tooltip, so custom explorable charts are possible.
- **What would break it:** More code per chart than Recharts, which matters for an owner who does not read code. Commit pace is slower, with about four months since the last commit.
- **Cost:** Free.

### CHARTS: Mafs, borderline on maintenance (https://github.com/stevenpetryk/mafs)

- **Fit:** MIT. Last commit 2025-03-30; last release v0.21.0 on 2024-10-20; 3,446 stars. React peer range is >=18. Best match for dragging a point along a function (useMovablePoint, https://mafs.dev/guides/interaction/movable-points), for example a discount-rate curve. Khan's Perseus uses it in production, pinned at 0.19.0.
- **What would break it:** 19 months without a commit fails a strict maintained test, and the owner may prefer to rule it out. It plots functions and has no ready business chart types.
- **Cost:** Free. Any future fixes could fall to us.

### CHARTS: Observable Plot and D3 (https://github.com/observablehq/plot, https://github.com/d3/d3)

- **Fit:** Plot: ISC, last commit 2026-09-01, 5,417 stars. D3: ISC, last commit 2026-10-21, 113,840 stars. Plot documents two React approaches: server-side virtual DOM, or useRef with useEffect (https://observablehq.com/plot/getting-started). D3 offers the most control.
- **What would break it:** Neither is a set of React components. Plot's interaction range for dragging was not verified. D3 needs the most custom code.
- **Cost:** Free.

### CHARTS: ECharts, JSXGraph, nivo (https://github.com/apache/echarts, https://github.com/jsxgraph/jsxgraph, https://github.com/plouc/nivo)

- **Fit:** ECharts: Apache-2.0, 2026-10-04, 67,653 stars. JSXGraph: LGPL-3.0, 2026-10-28, 1,485 stars, covers interactive geometry and function plotting. nivo: MIT, 2026-07-21, 14,130 stars, built on D3 and React. All maintained, but none is used by the closest reference projects found here.
- **What would break it:** ECharts and JSXGraph are not React-first, and wrapper quality was not checked. LGPL terms apply to JSXGraph if modified and distributed. nivo's drag support was not checked.
- **Cost:** Free.

## Findings

- Anthropic's copilot-kit-ag-ui quickstart is a personal finance assistant with four render-only visual tools (payoff timeline, growth projection, budget breakdown, scenario comparison). The agent supplies starting numbers, and sliders recompute the charts in the browser with no further agent turn, so moving a slider costs no tokens. Source: https://github.com/anthropics/claude-quickstarts/blob/main/managed-agents/copilot-kit-ag-ui/CLAUDE.md
- Anthropic's managed-agents/assistant-ui quickstart is Next.js 16 with React 19, the Anthropic SDK and assistant-ui. It has no database: sessions are the thread list. One pure reducer file turns the session event log into UI messages, and web_search results render as source cards. Source: https://github.com/anthropics/claude-quickstarts/blob/main/managed-agents/assistant-ui/README.md
- Managed Agents token previews (event_deltas) are gated per organization while the 2026-07-01 update rolls out. Without the gate everything still works, but replies arrive whole instead of streaming. Source: https://github.com/anthropics/claude-quickstarts/blob/main/managed-agents/chat-sdk/README.md
- The SDK tool runner handles the agent loop, error wrapping and type safety, and is in beta. Anthropic's docs point to a manual loop when you need human approval or conditional execution. Its TypeScript helper accepts stream: true (https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md). Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner
- The model is a single setting in each Anthropic quickstart checked: a QUICKSTART_MODEL variable in chat-sdk, a model: line in the agent file for assistant-ui and copilot-kit-ag-ui, and a request parameter in financial-data-analyst. Reusing them does not force the model decision. Cogni shows per-task routing: Sonnet for the tutor, Opus for deep thinking, Haiku for flashcards, quizzes and memory distilling. That is a design choice, not evidence of teaching quality. Source: https://github.com/anthropics/claude-quickstarts/blob/main/managed-agents/chat-sdk/README.md
- Anthropic does not offer its own embedding model; its docs point to Voyage AI as one provider. Any vector RAG template therefore needs another vendor (outside the Claude credits) or a local embedding model. Source: https://platform.claude.com/docs/en/build-with-claude/embeddings
- Neon's fuzzy-semantic-search-nextjs example combines full-text, trigram and pgvector search with reciprocal rank fusion, and states that no external AI APIs are required. Embeddings run locally with Transformers.js using Xenova/gte-small (384 dimensions; https://github.com/neondatabase/examples/blob/main/ai/fuzzy-semantic-search-nextjs/lib/embeddings.ts). Source: https://github.com/neondatabase/examples/blob/main/ai/fuzzy-semantic-search-nextjs/README.md
- Neon's newer hybrid search example uses lakebase_vector and lakebase_text with Neon AI Gateway embeddings. The gateway needs a paid plan (Launch or Scale) with prepaid credits, which are separate from Claude credits. That example's keyword mode makes no gateway call (https://github.com/neondatabase/examples/blob/main/with-hybrid-search-api/README.md). Source: https://neon.com/docs/ai/lakebase-search-get-started
- Claude can cite your own retrieved content through search_result blocks returned from a custom tool, with no beta header. All active models except Haiku 3 support it. Managed Agents accepts these blocks only in tool results. This covers 'the sources behind each answer' without a RAG framework. Source: https://platform.claude.com/docs/en/build-with-claude/search-results
- Anthropic's memory tool runs client-side: Claude requests file operations under /memories and your handler maps them onto storage you control, such as keys in a database. Learner memory can therefore stay in SQL without a third-party memory framework. Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- Anthropic lessons: Learning mode guides reasoning rather than giving answers and uses Socratic questioning (https://www.anthropic.com/news/introducing-claude-for-education). In Anthropic's own coding study the AI group averaged 50% on a later quiz against 67% for hand coders, and people who asked follow-up questions and for explanations retained more. This is coding rather than finance, and the authors say the interaction-pattern analysis is not causal. Source: https://www.anthropic.com/research/AI-assistance-coding-skills
- Dropped. No licence: https://github.com/vercel/ai-sdk-rag-starter (also last commit 2024-10, OpenAI), https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor, https://github.com/goncalvespedroo/sokra-tutor, https://github.com/anthropics/claude-agent-sdk-demos, https://github.com/vercel-labs/cma-chat-sdk. Archived or deprecated: https://github.com/vercel-labs/ai-sdk-preview-rag, https://github.com/neondatabase/pgrag, https://github.com/vercel/ai-elements (deprecated end of November 2026, moving to shadcn/ui). Unmaintained: https://github.com/idyll-lang/idyll (2022), https://github.com/worrydream/Tangle (2011, no licence), https://github.com/ebradyjobory/finance.js (2018), https://github.com/lmammino/financial (2024-07), https://github.com/tremorlabs/tremor (2025-10). GPL-3.0 and idle since 2025-11: https://github.com/plastic-labs/tutor-gpt. Source: https://github.com/vercel/ai-elements/blob/main/README.md
- GitHub searches for time value of money, DCF and financial calculators in React found only small apps (5 stars or fewer among finance-specific results), no reusable component library, and nothing for WACC or DCF web apps in TypeScript. This is a search result, so it does not prove none exists. Source: https://github.com/search?q=dcf+calculator+react&type=repositories (not confirmed in a primary source)
- Khan Academy 2026 A/B tests: a structured summary of a student's recent attempts raised next-item correctness by 3.4% (608,000 threads), and surfacing unmastered prerequisites raised it by 2.7% (1.36 million threads). Raw JSON conversation logs did nothing until converted to plain text and widened to 24 hours, which then raised cognitive engagement 5.09%. Adding examples of other problem types to the prompt showed no effect. Source: https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/
- Khan Academy's math-checking agent moved to a faster AI model with accuracy holding steady across 1.35 million threads. Limiting it to the math the student had already done cut answer give-aways by 50%. This concerns a checking sub-agent and latency, not the main teaching model, and Khan does not name the models. It is suggestive for the cheaper-model question, not proof. Source: https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/
- Khan Academy measures next-item correctness without AI help as its main learning metric, with guardrails on giving the answer away and math error rate. Its 2024 design note says the prompt should lead with questions and give support or a step, but not the answer (https://blog.khanacademy.org/how-we-built-ai-tutoring-tools/). Its prompt process also tests with varied learner personas (https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo/). Source: https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/
- Field experiment with nearly 1,000 high school students, using GPT-4 in both arms. Plain chat improved practice grades 48% but cut unassisted exam grades 17%. A tutor prompt with hints and teacher-supplied solutions improved practice 127% and essentially removed the exam harm, but produced no exam gain. Students did not perceive the loss. The same model gave different outcomes depending on the harness around it. Source: https://www.pnas.org/doi/10.1073/pnas.2422633122
- Harvard undergraduate physics RCT (N = 194): an AI tutor beat in-class active learning with an estimated effect of 0.73 to 1.3 standard deviations. The authors found a system prompt could not reliably scaffold multi-part problems, so the platform sequenced the steps, and accuracy relied on pre-written step-by-step answers. This is one course at one university, and the subject is not finance. Source: https://www.nature.com/articles/s41598-025-97652-6
- Google's LearnLM report says post-hoc fine-tuning per application is impractical and that prompting will likely remain the best way for education developers to specify behaviour. It also reports pedagogy training raised expert preference 13% over its own Gemini 1.5 Pro base and 11% over Claude 3.5, so the model can matter too. This is Google's own evaluation of 2024 models. Source: https://services.google.com/fh/files/misc/improving-gemini-for-education_v7.pdf
- LearnLM RCT with 165 UK secondary students on maths: expert tutors supervised and could edit every message, and approved 76.4% with zero or minimal edits. Students solved novel problems at 66.2% against 60.7% with human tutors alone. Humans checked every message and the model was fine-tuned, so this is not evidence for an unsupervised tutor. Source: https://arxiv.org/abs/2512.23633

## Still unknown

- Whether a maintained Next.js template exists for the plain Anthropic SDK tool runner with streaming tool calls. GitHub and Firecrawl developer searches found only blog tutorials, which I did not check, so this is an absence in search rather than proof.
- Whether a cheaper model teaches as well as a stronger one under the same RAG, database and harness. I found no study comparing model tiers this way. The Khan, Bastani and Kestin results show the harness matters, and LearnLM shows model training also matters, but none answers this directly. An eval on our own lessons would be needed.
- Whether the learner's Anthropic organisation has Managed Agents access and the event_deltas streaming gate. Not checked.
- Managed Agents and other runtime pricing were not checked here.
- Whether Transformers.js with gte-small fits Vercel function size and cold-start limits, and how well it retrieves finance text. Not deployed or tested.
- Whether Recharts supports dragging data points directly. Only Brush dragging was confirmed.
- Correctness of formulas in PlanDhan and the quickstart's finance.ts. I read the code signatures and part of the logic but ran nothing.
- Whether re-implementing Damodaran's Ginzu logic raises licensing questions, and whether the repos claiming to match his numbers actually do.
- Whether results from school maths and university physics apply to an adult finance beginner in India. None of the studies tested that group or subject.
- Outcome data for Anthropic's Learning mode. I found the feature description but no published learning results for it.
- Khan Academy's full AIED 2026 paper was not read, only the blog summary, and the post does not name the models used.
- Letta and Honcho internals were not read, only repo metadata. No repo was cloned or run; all code findings come from repo files and metadata through the GitHub API.

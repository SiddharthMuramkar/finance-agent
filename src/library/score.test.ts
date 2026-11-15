import { describe, expect, it } from "vitest";
import questions from "../../scripts/library/eval/questions.json";
import {
  answers,
  checkQuestionSet,
  DEFAULT_POOL,
  formatTally,
  inRerankOrder,
  judged,
  KEEP,
  parseScoreArgs,
  percentile,
  queriesToEmbed,
  rankOf,
  scorerSearch,
  tally,
  voyageReranker,
  type QuestionSet,
  type Reranker,
  type ScoreQuestion,
} from "./score";
import type { PassageQuery } from "./search";

const set = questions as QuestionSet;
const passage = (sourceId: string, ref: string, text = "") => ({ sourceId, ref, text });

describe("the scorer's flags", () => {
  it("with no flags: keyword search, the app's own order, nothing to rerank (as before #28)", () => {
    expect(parseScoreArgs([])).toEqual({ file: undefined, ranking: undefined, voyage: false, rerank: undefined, pool: DEFAULT_POOL });
  });

  it("reads the #28 re-test command: --voyage --rerank=<model> --pool=<n>", () => {
    expect(parseScoreArgs(["--voyage", "--rerank=rerank-3-lite", "--pool=20"])).toEqual({ file: undefined, ranking: undefined, voyage: true, rerank: "rerank-3-lite", pool: 20 });
  });

  it("takes a question file and --ranking as before", () => {
    expect(parseScoreArgs(["my-questions.json", "--ranking", "full-text"])).toMatchObject({ file: "my-questions.json", ranking: "full-text" });
  });

  it("refuses a flag it cannot use, so a typo never runs as a plain baseline", () => {
    expect(() => parseScoreArgs(["--rerank"])).toThrow("--rerank needs a model");
    expect(() => parseScoreArgs(["--rerank="])).toThrow("--rerank needs a model");
    expect(() => parseScoreArgs(["--pool=20"])).toThrow("add --rerank=<model>");
    expect(() => parseScoreArgs(["--rerank=rerank-3", "--pool=4"])).toThrow(`at least ${KEEP}`);
    expect(() => parseScoreArgs(["--rerank=rerank-3", "--pool=twenty"])).toThrow("whole number");
    expect(() => parseScoreArgs(["--rerank=rerank-3", "--pool=20.5"])).toThrow("whole number");
    expect(() => parseScoreArgs(["--ranking", "bm2"])).toThrow("--ranking must be bm25 or full-text");
  });
});

describe("what counts as an answer", () => {
  const question: ScoreQuestion = { q: "q", expect: ["m00053", "damodaran-papers/paper-newlease"], sources: ["damodaran-blog"], expectText: ["Growing Annuity"], alsoExpect: ["yale-econ-252/lecture-7"] };

  it("a bare expected ref belongs to the set's own source; a qualified one names its source", () => {
    expect(answers(question, passage("openstax-principles-finance-2e", "m00053#p4"), "openstax-principles-finance-2e")).toBe(true);
    expect(answers(question, passage("openstax-principles-finance-1e", "m00053#p4"), "openstax-principles-finance-2e")).toBe(false);
    expect(answers(question, passage("openstax-principles-finance-1e", "m00053#p4"), "openstax-principles-finance-1e")).toBe(true);
    expect(answers(question, passage("damodaran-papers", "paper-newlease#3"), "openstax-principles-finance-2e")).toBe(true);
  });

  it("a listed source answers only when its passage holds one of the phrases, ignoring case", () => {
    expect(answers(question, passage("damodaran-blog", "post-1", "a growing annuity of 30 payments"), "x")).toBe(true);
    expect(answers(question, passage("damodaran-blog", "post-1", "a level annuity"), "x")).toBe(false);
    expect(answers({ q: "q", sources: ["damodaran-blog"] }, passage("damodaran-blog", "post-1", "anything"), "x")).toBe(true);
  });

  it("the rank is the first answer's place (1 is first), 0 for a miss; alsoExpect counts only as judged", () => {
    const found = [passage("decoy", "a"), passage("yale-econ-252", "lecture-7#2"), passage("openstax-principles-finance-2e", "m00053")];
    expect(rankOf(question, found, "openstax-principles-finance-2e")).toBe(3);
    expect(rankOf(question, found.slice(0, 2), "openstax-principles-finance-2e")).toBe(0);
    expect(judged(question, found[1])).toBe(true);
    expect(judged(question, found[0])).toBe(false);
  });
});

describe("rank tallies and time percentiles", () => {
  it("hits@5, hits@1 and mean reciprocal rank, a miss counting 0", () => {
    expect(tally([1, 2, 0, 4])).toEqual({ n: 4, hits5: 3, hits1: 1, mrr: (1 + 1 / 2 + 0 + 1 / 4) / 4 });
    expect(formatTally([1, 2, 0, 4])).toBe("hits@5 3/4, hits@1 1/4, MRR 0.44");
    expect(tally([])).toEqual({ n: 0, hits5: 0, hits1: 0, mrr: 0 });
  });

  it("percentiles by nearest rank, 0 for no searches", () => {
    const ms = [40, 10, 30, 20, 50, 60, 70, 80, 90, 1000];
    expect(percentile(ms, 50)).toBe(50);
    expect(percentile(ms, 95)).toBe(1000);
    expect(percentile(ms, 0)).toBe(10);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("the question set", () => {
  it("has no repeated question and 12 Signal Case questions, each with a real as-of date (#24)", () => {
    expect(checkQuestionSet(set)).toEqual([]);
    const signal = set.questions.filter((q) => q.signal);
    expect(signal).toHaveLength(12);
    const perCase: Record<string, number> = {};
    for (const q of signal) perCase[q.signal!.case] = (perCase[q.signal!.case] ?? 0) + 1;
    expect(perCase).toEqual({
      "mega-millions-2018": 3,
      "amazon-2000": 2,
      "wework-2019": 2,
      "fed-1994": 2,
      "sensex-1992": 3,
    });
  });

  it("names repeated questions and Signal questions it cannot search as of a date", () => {
    const bad: QuestionSet = {
      source: "s",
      questions: [
        { q: "a" },
        { q: "a" },
        { q: "b", signal: { case: "c", asOf: "2000-02-30" } },
        { q: "c", signal: { case: "", asOf: "2000-02-03" } },
        { q: "d", signal: { case: "c", asOf: "Feb 2000" } },
      ],
    };
    expect(checkQuestionSet(bad)).toEqual([
      'question asked twice: "a"',
      'Signal question whose as-of date is not YYYY-MM-DD: "b" (2000-02-30)',
      'Signal question without a case: "c"',
      'Signal question whose as-of date is not YYYY-MM-DD: "d" (Feb 2000)',
    ]);
  });

  it("embeds every distinct query once: questions, scoped queries and hindsight probes", () => {
    const small: QuestionSet = {
      source: "s",
      questions: [{ q: "a" }, { q: "b", scoped: { q: "b scoped", source: "Shiller" } }],
      hindsight: [{ q: "a", asOf: "2018-10-24", outcome: [] }, { q: "c", asOf: "2018-10-24", outcome: [] }],
    };
    expect(queriesToEmbed(small)).toEqual(["a", "b", "b scoped", "c"]);
  });
});

type Fake = { id: string; heading: string; text: string; publishedOn: string | null };
const candidates = (n: number): Fake[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, heading: `H${i}`, text: `T${i}`, publishedOn: null }));
/** A clock that moves 10 ms each time it is read. */
const ticking = () => {
  let t = 0;
  return () => (t += 10);
};
/** A reranker that puts the candidates in reverse order and bills one token per document. */
const reversing = () => {
  const calls: { query: string; documents: string[]; topK: number }[] = [];
  const rerank: Reranker = async (query, documents, topK) => {
    calls.push({ query, documents, topK });
    return { order: documents.map((_, i) => documents.length - 1 - i).slice(0, topK), tokens: documents.length, retries: 0 };
  };
  return { rerank, calls };
};

describe("rerank order", () => {
  it("keeps the top 5 in the reranker's order", () => {
    expect(inRerankOrder(["a", "b", "c", "d", "e", "f", "g"], [6, 0, 5, 1, 4, 2]).join("")).toBe("gafbe");
  });

  it("throws on an index that is not a candidate, or one given twice", () => {
    expect(() => inRerankOrder(["a", "b"], [2])).toThrow("index 2 for 2 passages");
    expect(() => inRerankOrder(["a", "b"], [-1])).toThrow("index -1");
    expect(() => inRerankOrder(["a", "b"], [0.5])).toThrow("index 0.5");
    expect(() => inRerankOrder(["a", "b"], [1, 1])).toThrow("index 1 twice");
  });
});

describe("the scorer's search", () => {
  it("without --rerank: the app's search for the top 5, as before, and no reranker", async () => {
    const asked: PassageQuery[] = [];
    const { search, timings } = scorerSearch(
      async (query) => {
        asked.push(query);
        return candidates(5);
      },
      { ranking: "bm25", now: ticking() },
    );

    const kept = await search({ query: "a question", asOf: "2019-08-14", embedding: [1, 0], source: "Damodaran" });

    expect(asked).toEqual([{ query: "a question", asOf: "2019-08-14", embedding: [1, 0], source: "Damodaran", ranking: "bm25", limit: 5 }]);
    expect(kept.map((p) => p.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(timings).toEqual({ searchMs: [10], rerankMs: [], totalMs: [20], tokens: [], pool: [5], retries: 0 });
  });

  it("with --rerank and --pool: the top `pool` go to the reranker as heading + text, its top 5 are kept", async () => {
    const asked: PassageQuery[] = [];
    const { rerank, calls } = reversing();
    const { search, timings } = scorerSearch(
      async (query) => {
        asked.push(query);
        return candidates(query.limit!);
      },
      { rerank, pool: 20, now: ticking() },
    );

    const kept = await search({ query: "a question", asOf: null });

    expect(asked[0].limit).toBe(20);
    expect(calls).toEqual([{ query: "a question", documents: candidates(20).map((c) => `${c.heading}\n\n${c.text}`), topK: 5 }]);
    expect(kept.map((p) => p.id)).toEqual(["p19", "p18", "p17", "p16", "p15"]);
    expect(timings).toEqual({ searchMs: [10], rerankMs: [10], totalMs: [40], tokens: [20], pool: [20], retries: 0 });
  });

  it("defaults the pool to 30, and does not call the reranker for one candidate or none", async () => {
    const { rerank, calls } = reversing();
    const sizes = [1, 0];
    const limits: (number | undefined)[] = [];
    const { search, timings } = scorerSearch(
      async (query) => {
        limits.push(query.limit);
        return candidates(sizes.shift()!);
      },
      { rerank },
    );

    expect((await search({ query: "q", asOf: null })).map((p) => p.id)).toEqual(["p0"]);
    expect(await search({ query: "q", asOf: null })).toEqual([]);
    expect(limits).toEqual([DEFAULT_POOL, DEFAULT_POOL]);
    expect(calls).toEqual([]);
    expect(timings.pool).toEqual([1, 0]);
  });

  it("keeps the as-of rule: the reranker only sees what the Case may show, so it cannot bring an ending back", async () => {
    // A small Library: the dated WeWork news after the Case's as-of date tells the ending.
    const library: Fake[] = [
      { id: "lease", heading: "Leases as debt", text: "WeWork lease commitments", publishedOn: null },
      { id: "filing", heading: "The S-1", text: "WeWork run rate", publishedOn: "2019-08-14" },
      { id: "withdrawn", heading: "Six weeks later", text: "WeWork withdrew its IPO", publishedOn: "2019-09-30" },
      { id: "bankrupt", heading: "2023", text: "WeWork filed for bankruptcy", publishedOn: "2023-11-07" },
    ];
    const seenAsOf: (string | null)[] = [];
    // The as-of rule as search.ts applies it to dated passages, here in memory.
    const find = async (query: PassageQuery) => {
      seenAsOf.push(query.asOf);
      return library.filter((p) => !query.asOf || p.publishedOn === null || p.publishedOn <= query.asOf).slice(0, query.limit);
    };
    // A reranker that would put any passage telling the ending first.
    const documentsSeen: string[][] = [];
    const rerank: Reranker = async (_query, documents, topK) => {
      documentsSeen.push(documents);
      const order = documents.map((d, i) => ({ i, tells: /withdrew|bankruptcy/.test(d) })).sort((a, b) => Number(b.tells) - Number(a.tells));
      return { order: order.map((o) => o.i).slice(0, topK), tokens: 0, retries: 0 };
    };
    const { search } = scorerSearch(find, { rerank, pool: 20 });

    const asOfCase = await search({ query: "WeWork", asOf: "2019-08-14" });
    const open = await search({ query: "WeWork", asOf: null });

    expect(seenAsOf).toEqual(["2019-08-14", null]);
    expect(documentsSeen[0].some((d) => /withdrew|bankruptcy/.test(d))).toBe(false);
    expect(asOfCase.map((p) => p.id).sort()).toEqual(["filing", "lease"]);
    expect(open.slice(0, 2).map((p) => p.id).sort()).toEqual(["bankrupt", "withdrawn"]);
  });
});

describe("the Voyage reranker", () => {
  type Call = { url: string; init: RequestInit };
  const fakeFetch = (...replies: (() => Response)[]) => {
    const calls: Call[] = [];
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return replies[Math.min(calls.length, replies.length) - 1]();
    };
    return { fetch: fetch as typeof globalThis.fetch, calls };
  };
  const ok = () => Response.json({ data: [{ index: 2, relevance_score: 0.4 }, { index: 0, relevance_score: 0.9 }], usage: { total_tokens: 321 } });

  it("asks /v1/rerank for the top k with truncation on, and returns the indexes most relevant first", async () => {
    const { fetch, calls } = fakeFetch(ok);

    const out = await voyageReranker({ apiKey: "k", model: "rerank-3-lite", fetch })("a question", ["d0", "d1", "d2"], 5);

    expect(out).toEqual({ order: [0, 2], tokens: 321, retries: 0 });
    expect(calls[0].url).toBe("https://api.voyageai.com/v1/rerank");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ query: "a question", documents: ["d0", "d1", "d2"], model: "rerank-3-lite", top_k: 5, truncation: true });
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer k");
  });

  it("waits 1 s, then 2 s, after a 429 and counts the retries", async () => {
    const limited = () => new Response("rate limited", { status: 429 });
    const { fetch, calls } = fakeFetch(limited, limited, ok);
    const waits: number[] = [];

    const out = await voyageReranker({ apiKey: "k", model: "rerank-3", fetch, sleep: async (ms) => void waits.push(ms) })("q", ["d0", "d1", "d2"], 5);

    expect(calls).toHaveLength(3);
    expect(waits).toEqual([1000, 2000]);
    expect(out.retries).toBe(2);
  });

  it("throws after its last retry, and at once on any other error", async () => {
    const limited = () => new Response("rate limited", { status: 429 });
    const sleep = async () => {};
    await expect(voyageReranker({ apiKey: "k", model: "rerank-3", fetch: fakeFetch(limited).fetch, sleep, retries: 2 })("q", ["d"], 5)).rejects.toThrow("Voyage rerank 429: rate limited");

    const { fetch, calls } = fakeFetch(() => new Response("bad key", { status: 401 }));
    await expect(voyageReranker({ apiKey: "k", model: "rerank-3", fetch, sleep })("q", ["d"], 5)).rejects.toThrow("Voyage rerank 401: bad key");
    expect(calls).toHaveLength(1);
  });
});

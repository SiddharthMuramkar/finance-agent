import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import questions from "../../scripts/library/eval/questions.json";
import { hindsightFlag, outcomeWordsIn, type HindsightProbe } from "./hindsight";
import { importLibrary, type LibraryFile } from "./ingest";
import { rowsOf, searchPassages } from "./search";

const probes = questions.hindsight as HindsightProbe[];
const signalProbes = probes.filter((p) => p.case);
/** Signal Cases set on a past date (spec Appendix A). rates-up-1 and compounding-1000 are worked examples with no as-of date: nothing to withhold. */
const DATED_SIGNAL_CASES = ["amazon-2000", "mega-millions-2018", "wework-2019"];

const news: LibraryFile = {
  source: {
    id: "a-news-blog",
    title: "A news blog",
    kind: "dated",
    licence: "All rights reserved",
    licenceUrl: "https://example.org/terms",
    credit: "A. Writer, A news blog",
    url: "https://example.org/news",
    fetchedOn: "2026-11-15",
  },
  passages: [
    { ref: "mm-before", heading: "A record jackpot", url: "https://example.org/news/1", publishedOn: "2018-10-20", text: "The Mega Millions jackpot has reached $1.537 billion; the cash option would pay $877.8 million now instead of 30 payments." },
    { ref: "mm-after", heading: "The winner", url: "https://example.org/news/2", publishedOn: "2019-03-08", text: "The Mega Millions winner claimed the prize and took the cash: $877,784,124 before tax, not the 30 payments." },
    { ref: "amz-after", heading: "Internet stocks", url: "https://example.org/news/3", publishedOn: "2001-01-05", text: "Amazon's share price fell to 14.88 as the dot-com bust hit internet stocks on the Nasdaq." },
    { ref: "ww-before", heading: "The filing", url: "https://example.org/news/4", publishedOn: "2019-08-14", text: "WeWork's IPO filing shows revenue of $1.54 billion and a run rate of $3 billion; its valuation was $47 billion in January." },
    { ref: "ww-after", heading: "Six weeks later", url: "https://example.org/news/5", publishedOn: "2019-10-01", text: "WeWork withdrew its IPO filing after investors balked at the valuation." },
  ],
};

const book: LibraryFile = {
  source: {
    id: "a-reference-book",
    title: "A reference book",
    kind: "timeless",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    credit: "B. Author, A reference book, CC BY 4.0",
    url: "https://example.org/book",
    fetchedOn: "2026-11-15",
  },
  passages: [
    { ref: "mm-ref", heading: "Lottery payouts", url: "https://example.org/book/1", text: "In 2019 the Mega Millions winner claimed the jackpot and chose the cash over the 30 annual payments." },
    { ref: "amz-ref", heading: "Platforms", url: "https://example.org/book/2", text: "Amazon Web Services, launched in 2006, changed how investors valued Amazon's share price." },
    { ref: "ww-ref", heading: "Leases", url: "https://example.org/book/3", text: "WeWork filed for bankruptcy in 2023, four years after its IPO filing." },
    // A lecture transcript whose heading carries the course's year, as every Yale ECON 252 heading says "(2011)".
    { ref: "lecture-7", heading: "Lecture 7: Efficient markets (2011)", url: "https://example.org/book/4", text: "In 1999 internet stocks on the Nasdaq traded at prices no earnings could justify, Amazon among them, and the bubble talk grew." },
  ],
};

async function libraryDb(extra: LibraryFile["passages"] = []): Promise<Db> {
  const db = await testDb();
  await importLibrary(db, news);
  await importLibrary(db, { ...book, passages: [...book.passages, ...extra] });
  return db;
}

const search = (db: Db, probe: HindsightProbe, asOf: string | null) => searchPassages(db, { query: probe.q, asOf, limit: 50 });

describe("hindsight probes for the Signal Cases (#25)", () => {
  it("every Signal Case set on a past date has probes, each with outcome words, run at the Case's as-of date", () => {
    expect([...new Set(signalProbes.map((p) => p.case))].sort()).toEqual(DATED_SIGNAL_CASES);
    for (const p of signalProbes) {
      expect(p.outcome.length).toBeGreaterThan(0);
      expect(p.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the as-of rule lets no passage with a Signal Case's outcome words through, while the same searches find them with no as-of limit", async () => {
    const db = await libraryDb();

    for (const caseSlug of DATED_SIGNAL_CASES) {
      const caseProbes = signalProbes.filter((p) => p.case === caseSlug);
      let shown = 0;
      let toldWithoutLimit = 0;
      for (const probe of caseProbes) {
        const before = await search(db, probe, probe.asOf);
        for (const r of before) expect({ caseSlug, ref: r.ref, flag: hindsightFlag(r, probe) }).toEqual({ caseSlug, ref: r.ref, flag: null });
        shown += before.length;
        toldWithoutLimit += (await search(db, probe, null)).filter((r) => outcomeWordsIn(r.text, probe.outcome).length).length;
      }
      // Not vacuous: the rule still shows what was known that day, and the Library does hold the ending.
      expect({ caseSlug, shown: shown > 0, toldWithoutLimit: toldWithoutLimit > 0 }).toEqual({ caseSlug, shown: true, toldWithoutLimit: true });
    }
  });

  it("flags what the year rule cannot catch: a reference passage that tells the ending without naming a year (tagging passages at ingest closes this after the beta)", async () => {
    const db = await libraryDb([{ ref: "ww-no-year", heading: "Run rates", url: "https://example.org/book/5", text: "WeWork withdrew its IPO when investors doubted its run rate revenue." }]);
    const probe = signalProbes.find((p) => p.case === "wework-2019")!;

    const leak = (await search(db, probe, probe.asOf)).find((r) => r.ref === "ww-no-year");

    expect(leak).toBeDefined();
    expect(hindsightFlag(leak!, probe)?.outcomeWords).toEqual(["withdrew its IPO"]);
  });
});

describe("the as-of year of a reference passage", () => {
  it("comes from the passage's text, not its heading, so a lecture headed (2011) about 1999 is shown for a Case in 2000", async () => {
    const db = await libraryDb([{ ref: "heading-only", heading: "Bubbles (2011)", url: "https://example.org/book/6", text: "Internet stocks on the Nasdaq rose far above what earnings could justify." }]);

    const stored = await rowsOf<{ ref: string; latest_year: number | null }>(db, sql`select ref, latest_year from library_passages where ref in ('lecture-7', 'heading-only') order by ref`);
    const amazon = signalProbes.find((p) => p.q.startsWith("internet stocks"))!;
    const shown = (await search(db, amazon, amazon.asOf)).map((r) => r.ref);

    expect(stored).toEqual([
      { ref: "heading-only", latest_year: null },
      { ref: "lecture-7", latest_year: 1999 },
    ]);
    expect(shown).toContain("lecture-7");
    expect(shown).toContain("heading-only");
  });
});

describe("outcome words", () => {
  it("match whole words or phrases, ignoring case, so AWS does not match laws", () => {
    expect(outcomeWordsIn("Securities laws and draws", ["AWS"])).toEqual([]);
    expect(outcomeWordsIn("Revenue from aws grew", ["AWS"])).toEqual(["AWS"]);
    expect(outcomeWordsIn("She took the cash: $877,784,124.", ["877,784,124", "Took the cash", "lump sum"])).toEqual(["877,784,124", "Took the cash"]);
  });

  it("a dated passage published after the as-of date, or a timeless one mentioning a later year, is flagged even without outcome words", () => {
    const probe = { asOf: "2019-08-14", outcome: ["failed IPO"] };
    expect(hindsightFlag({ kind: "dated", publishedOn: "2019-09-30", text: "Desks." }, probe)).toEqual({ laterYears: [], outcomeWords: [], datedAfterAsOf: true });
    expect(hindsightFlag({ kind: "timeless", publishedOn: null, text: "By 2023 it had a failed IPO behind it." }, probe)).toEqual({ laterYears: [2023], outcomeWords: ["failed IPO"], datedAfterAsOf: false });
    expect(hindsightFlag({ kind: "timeless", publishedOn: null, text: "In 2018 it leased desks." }, probe)).toBeNull();
  });

  it("a later year in a dated passage published by the as-of date is a plan, not hindsight: only its outcome words count", () => {
    const probe = { asOf: "1999-11-05", outcome: ["filed for bankruptcy"] };
    const filing = (text: string) => ({ kind: "dated" as const, publishedOn: "1999-11-05", text });

    expect(hindsightFlag(filing("We plan to open distribution centers in 26 markets by 2001; the notes are due 2008."), probe)).toBeNull();
    expect(hindsightFlag(filing("By 2001 Webvan had filed for bankruptcy."), probe)).toEqual({ laterYears: [], outcomeWords: ["filed for bankruptcy"], datedAfterAsOf: false });
    expect(hindsightFlag({ kind: "dated", publishedOn: "2001-07-10", text: "In 2001 it shut down." }, probe)).toEqual({ laterYears: [2001], outcomeWords: [], datedAfterAsOf: true });
  });
});

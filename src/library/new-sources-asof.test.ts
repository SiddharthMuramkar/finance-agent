import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import questions from "../../scripts/library/eval/questions.json";
import sources from "../../scripts/library/sources.json";
import { hindsightFlag, type HindsightProbe } from "./hindsight";
import { importLibrary, isBlockedSource, librarySourceInput } from "./ingest";
import { prepareDocuments, type SourceDocument } from "./prepare";
import { searchPassages } from "./search";

// The sources added in #38, through the same load path as `npm run library:load` (sources.json record + the extractor's
// documents -> prepareDocuments -> importLibrary) on PGlite, then searched under the as-of rule with the eval's hindsight
// probes. Documents are shaped as the extractors in scripts/library/sources.py write them; the text is made up.
const NEW_SOURCES = ["openstax-principles-finance-1e", "fomc-historical", "sec-amazon-1997-2000", "sec-webvan-1999-2001", "sec-wework-s1-2019", "investor-gov-explainers"];

const record = (id: string) => {
  const entry = sources.find((s) => s.id === id);
  if (!entry) throw new Error(`no source ${id}`);
  // The schema drops the extra keys (fetch), as the load script drops them.
  const { publishedOn, ...source } = entry as typeof entry & { publishedOn?: string };
  return { source: librarySourceInput.parse(source), publishedOn: publishedOn ?? null };
};

const doc = (ref: string, url: string, publishedOn: string | null, heading: string, paragraph: string): SourceDocument => ({
  ref,
  title: ref,
  url,
  publishedOn,
  sections: [{ heading, paragraphs: [paragraph] }],
});

const DOCUMENTS: Record<string, SourceDocument[]> = {
  "sec-amazon-1997-2000": [
    doc(
      "10-q-0000891020-99-001938",
      "https://www.sec.gov/Archives/edgar/data/1018724/000089102099001938/0000891020-99-001938.txt",
      "1999-11-15",
      "ITEM 2. MANAGEMENT'S DISCUSSION AND ANALYSIS",
      "Amazon.com net sales grew in the quarter while its operating losses widened. The Company's share price and valuation may stay volatile, as internet stocks on the Nasdaq trade on expectations.",
    ),
    doc(
      "10-k-0000891020-00-000622",
      "https://www.sec.gov/Archives/edgar/data/1018724/000089102000000622/0000891020-00-000622.txt",
      "2000-03-29",
      "ITEM 5. MARKET FOR THE REGISTRANT'S COMMON STOCK",
      "The Amazon.com share price and valuation moved widely in February and March as internet stocks on the Nasdaq fell.",
    ),
  ],
  "sec-webvan-1999-2001": [
    doc(
      "424b1-0000891618-99-004914",
      "https://www.sec.gov/Archives/edgar/data/1092657/0000891618-99-004914.txt",
      "1999-11-05",
      "USE OF PROCEEDS",
      "Webvan will use the proceeds of this offering to build distribution centres and warehouses, and expects its cash to fund the build-out.",
    ),
    doc(
      "10-k-0001012870-01-001485",
      "https://www.sec.gov/Archives/edgar/data/1092657/0001012870-01-001485.txt",
      "2001-04-02",
      "ITEM 7. LIQUIDITY AND CAPITAL RESOURCES",
      "Webvan's cash burn continues; without further funding we may have to cease operations at some distribution centres.",
    ),
  ],
  "sec-wework-s1-2019": [
    doc(
      "s-1-0001193125-19-220499",
      "https://www.sec.gov/Archives/edgar/data/1533523/000119312519220499/d781982ds1.htm",
      null,
      "PROSPECTUS SUMMARY",
      "The We Company, WeWork, files for its IPO with revenue run rate and valuation figures: private investors valued it at $47 billion in January 2019, before the filing.",
    ),
  ],
  "fomc-historical": [
    doc(
      "statement-19940204",
      "https://www.federalreserve.gov/fomc/19940204default.htm",
      "1994-02-04",
      "",
      "Chairman Alan Greenspan announced today that the Federal Open Market Committee decided to increase slightly the degree of pressure on reserve positions.",
    ),
  ],
  "investor-gov-explainers": [
    doc(
      "additional-resources-information-youth-teachers-classroom-resources-what-compound-interest",
      "https://www.investor.gov/additional-resources/information/youth/teachers-classroom-resources/what-compound-interest",
      null,
      "Rule of 72",
      "Compound interest is the interest you earn on interest. The Rule of 72 tells you about how long an investment takes to double: divide 72 by the rate of return.",
    ),
    doc(
      "introduction-investing-general-resources-news-alerts-alerts-bulletins-investor-bulletins-86",
      "https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-86",
      null,
      "",
      "In 2013 investors chasing yield heard talk of a bond bubble: when market interest rates rise, prices of fixed-rate bonds fall.",
    ),
  ],
};

async function libraryDb(): Promise<Db> {
  const db = await testDb();
  for (const [id, documents] of Object.entries(DOCUMENTS)) {
    const { source, publishedOn } = record(id);
    // As the load script does: a document without its own date takes the record's (the We Company S-1 is one document).
    const { passages } = prepareDocuments(documents.map((d) => ({ ...d, publishedOn: d.publishedOn ?? publishedOn })));
    await importLibrary(db, { source, passages });
  }
  return db;
}

const probes = questions.hindsight as HindsightProbe[];
const search = (db: Db, query: string, asOf: string | null) => searchPassages(db, { query, asOf, limit: 50 });

describe("the sources added in #38", () => {
  it.each(NEW_SOURCES)("%s has a record that loads and passes the BLOCKED check", (id) => {
    const entry = sources.find((s) => s.id === id)!;
    expect(librarySourceInput.safeParse(entry).success).toBe(true);
    expect(isBlockedSource(entry)).toBe(false);
  });

  it("every Case probe that touches them, run at its Case's date, gets results and none with a later date, a later year or an outcome word", async () => {
    const db = await libraryDb();
    const touched = probes.filter((p) => p.case === "amazon-2000" || p.case === "wework-2019" || /webvan/i.test(p.q));
    expect(touched.filter((p) => /webvan/i.test(p.q)).map((p) => p.asOf)).toEqual(["1999-11-05", "2001-04-02"]);

    for (const probe of touched) {
      const shown = await search(db, probe.q, probe.asOf);
      expect({ q: probe.q, shown: shown.length > 0 }).toEqual({ q: probe.q, shown: true });
      for (const r of shown) expect({ q: probe.q, ref: r.ref, flag: hindsightFlag(r, probe) }).toEqual({ q: probe.q, ref: r.ref, flag: null });
    }
  });

  it("each filing shows from its filing date on, and not a day before", async () => {
    const db = await libraryDb();
    const refs = async (q: string, asOf: string) => (await search(db, q, asOf)).map((r) => r.ref.split("#")[0]);

    expect(await refs("Amazon share price and valuation in February 2000", "2000-02-01")).toEqual(["10-q-0000891020-99-001938"]);
    expect(await refs("Amazon share price and valuation", "2000-03-29")).toContain("10-k-0000891020-00-000622");
    expect(await refs("Webvan cash burn and funding", "2001-04-01")).not.toContain("10-k-0001012870-01-001485");
    expect(await refs("WeWork IPO filing run rate revenue and valuation", "2019-08-13")).not.toContain("s-1-0001193125-19-220499");
    expect(await refs("WeWork IPO filing run rate revenue and valuation", "2019-08-14")).toContain("s-1-0001193125-19-220499");
    expect(await refs("pressure on reserve positions", "1994-02-03")).not.toContain("statement-19940204");
    expect(await refs("pressure on reserve positions", "1994-02-04")).toContain("statement-19940204");
  });

  it("a year-free Investor.gov explainer shows for an old Case; one that names a later year does not", async () => {
    const db = await libraryDb();
    const refs = async (q: string, asOf: string | null) => (await search(db, q, asOf)).map((r) => r.ref.split("#")[0]);

    expect(await refs("compound interest Rule of 72", "1987-10-16")).toContain("additional-resources-information-youth-teachers-classroom-resources-what-compound-interest");
    expect(await refs("bond bubble interest rates bond prices", "2000-02-01")).not.toContain("introduction-investing-general-resources-news-alerts-alerts-bulletins-investor-bulletins-86");
    expect(await refs("bond bubble interest rates bond prices", null)).toContain("introduction-investing-general-resources-news-alerts-alerts-bulletins-investor-bulletins-86");
  });
});

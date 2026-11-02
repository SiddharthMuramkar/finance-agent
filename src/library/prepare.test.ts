import { describe, expect, it } from "vitest";
import { cleanText, corruptionReasons, cutPassages, pagesNeedingVision, prepareDocuments, repairBrokenLigatures, type SourceDocument } from "./prepare";

const words = (n: number, word = "rate") => Array.from({ length: n }, () => word).join(" ") + ".";

describe("cleaning source text", () => {
  it("folds ligatures, joins words hyphenated across a line break and collapses spaces", () => {
    expect(cleanText("The eﬃcient  ﬁrm's dis-\ncount­ rate​\n\n is   fixed.")).toBe("The efficient firm's discount rate is fixed.");
  });
});

describe("corrupted text detection", () => {
  it("flags broken ligatures such as CreaAon, where a letter pair became a capital", () => {
    expect(corruptionReasons("CreaAon of value needs a calculaAon of present value and an esAmate of the discount rate.")).toContain("broken ligatures");
  });

  it("flags letters spaced apart, PDF character codes and replacement characters", () => {
    expect(corruptionReasons("T h e  p r e s e n t  v a l u e  o f  a  b o n d  i s  t h e  s u m")).toContain("letters spaced apart");
    expect(corruptionReasons("The (cid:12)rm discounts (cid:13)ows at the cost of capital (cid:14) each year.")).toContain("PDF character codes");
    expect(corruptionReasons("The �� rate is 5%.")).toContain("replacement characters");
  });

  it("passes ordinary finance prose with names, tickers and camel case", () => {
    expect(corruptionReasons("McKinsey and JPMorgan analysts priced the iPhone maker's bonds on NASDAQ; the PwC audit found the WACC was 8.2% in 2019.")).toEqual([]);
  });
});

describe("cutting passages", () => {
  const doc: SourceDocument = {
    ref: "m1",
    title: "Time Value of Money",
    url: "https://example.org/m1",
    publishedOn: null,
    sections: [
      { heading: "Present Value", paragraphs: [words(120), words(120), words(120)] },
      { heading: "Future Value", paragraphs: [words(50)] },
    ],
  };

  it("groups whole paragraphs up to the size limit, never across sections, with stable refs and the section in the heading", () => {
    const passages = cutPassages(doc, { maxWords: 260 });

    expect(passages.map((p) => [p.ref, p.heading, p.text.split(/\s+/).length])).toEqual([
      ["m1#1", "Time Value of Money: Present Value", 240],
      ["m1#2", "Time Value of Money: Present Value", 120],
      ["m1#3", "Time Value of Money: Future Value", 50],
    ]);
    expect(passages[0].url).toBe("https://example.org/m1");
  });

  it("splits a paragraph longer than the limit at sentence ends", () => {
    const long: SourceDocument = { ...doc, sections: [{ heading: "Long", paragraphs: [`${words(100)} ${words(100)} ${words(100)}`] }] };

    expect(cutPassages(long, { maxWords: 150 }).map((p) => p.text.split(/\s+/).length)).toEqual([100, 100, 100]);
  });

  it("keeps corrupted passages out of the load and reports them", () => {
    const bad: SourceDocument = { ...doc, ref: "m2", sections: [{ heading: "Broken", paragraphs: ["CreaAon of value needs a calculaAon and an esAmate of the discount rate."] }] };

    const { passages, rejected } = prepareDocuments([doc, bad]);

    expect(passages.map((p) => p.ref)).toEqual(["m1#1", "m1#2", "m1#3"]);
    expect(rejected).toEqual([{ ref: "m2#1", heading: "Time Value of Money: Broken", reasons: ["broken ligatures"] }]);
  });
});

describe("repairing broken ligatures", () => {
  const clean = "Creation of value follows the calculation of present value and an estimate of the discount rate. Estimation, creation and calculation recur.";
  const vocabulary = new Set(clean.toLowerCase().match(/[a-z]+/g));

  it("turns CreaAon back into Creation when the clean word is found elsewhere in the same source", () => {
    const fixed = repairBrokenLigatures("CreaAon of value needs a calculaAon and an esAmate of the discount rate.", vocabulary);

    expect(fixed.text).toBe("Creation of value needs a calculation and an estimate of the discount rate.");
    expect(fixed.fixed).toBe(3);
  });

  it("leaves a broken word alone when no clean spelling is known, so it is still flagged", () => {
    const fixed = repairBrokenLigatures("The vaAon of the zorbAon is large.", vocabulary);

    expect(fixed.text).toBe("The vaAon of the zorbAon is large.");
    expect(fixed.fixed).toBe(0);
    expect(corruptionReasons(fixed.text + " The vaAon of the zorbAon is large.")).toContain("broken ligatures");
  });

  it("separates words glued together by a table cell, such as firmStatus, when both words are known", () => {
    const known = new Set(["firm", "status", "capital", "stable"]);

    expect(repairBrokenLigatures("The firmStatus column and capitalStable row", known)).toEqual({ text: "The firm Status column and capital Stable row", fixed: 2 });
  });

  it("also separates a short known word glued to a name, such as ofDecember or underAmazon", () => {
    const known = new Set(["of", "under", "december", "amazon", "the"]);

    expect(repairBrokenLigatures("As ofDecember the notes issued underAmazon matured.", known).text).toBe("As of December the notes issued under Amazon matured.");
  });

  it("gives up quickly on a long run-together token instead of trying every combination", () => {
    const started = Date.now();

    expect(repairBrokenLigatures("ReposReverseRepoAgreementsAndSecuritiesLendingOperationsFacility", vocabulary).fixed).toBe(0);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("keeps company names written with two capitals, such as LatinWorks, RiskMetrics and MetLife", () => {
    const known = new Set(["latin", "works", "risk", "metrics", "met", "life"]);

    expect(repairBrokenLigatures("LatinWorks and RiskMetrics paid MetLife.", known)).toEqual({ text: "LatinWorks and RiskMetrics paid MetLife.", fixed: 0 });
  });

  it("does not touch camel case that is meant, such as iPhone or McKinsey", () => {
    expect(repairBrokenLigatures("McKinsey priced the iPhone maker and PwC audited it.", vocabulary).fixed).toBe(0);
  });

  it("prepareDocuments repairs a PDF's broken passages from the source's own words and reports how many it fixed", () => {
    const doc: SourceDocument = {
      ref: "paper",
      title: "A paper",
      url: "https://example.org/paper.pdf",
      publishedOn: "2012-01-01",
      sections: [
        { heading: "Intro", paragraphs: [clean] },
        { heading: "Body", paragraphs: ["CreaAon of value needs a calculaAon and an esAmate of the discount rate."] },
        { heading: "Hopeless", paragraphs: ["The vaAon of the zorbAon and the qixAon are large and the lorAon too."] },
      ],
    };

    const { passages, rejected, repaired } = prepareDocuments([doc]);

    expect(passages.map((p) => p.text)).toContain("Creation of value needs a calculation and an estimate of the discount rate.");
    expect(repaired).toBe(3);
    expect(rejected.map((r) => r.heading)).toEqual(["A paper: Hopeless"]);
  });
});

describe("pages that need vision", () => {
  it("picks pages with a figure but almost no text, as a chart or scanned slide leaves", () => {
    const pages = [
      { number: 1, text: "word ".repeat(300), images: 0 },
      { number: 2, text: "Figure 3 Equity risk premium", images: 1 },
      { number: 3, text: "", images: 2 },
      { number: 4, text: "word ".repeat(300), images: 3 },
      { number: 5, text: "Blank", images: 0 },
    ];

    expect(pagesNeedingVision(pages).map((p) => p.number)).toEqual([2, 3]);
  });
});

import { describe, expect, it } from "vitest";
import { cleanText, corruptionReasons, cutPassages, prepareDocuments, type SourceDocument } from "./prepare";

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

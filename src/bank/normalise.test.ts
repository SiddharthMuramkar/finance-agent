import { describe, expect, it } from "vitest";
import { fromBankRow, fromFinqaRow } from "./normalise";

// Invented rows in the shape of the upstream files; no real bank text is kept in the repo.
const eabRow = {
  id: "MBA-FIN-CF-0002",
  type: "multiple_choice",
  topic: "time value of money",
  stem: "Invented question?",
  options: [
    { key: "A", text: "One" },
    { key: "B", text: "Two" },
  ],
  answer: "B",
  explanation: "Because two.",
  review: { status: "self-checked" },
  bank_id: "mba-corporate-finance",
  bank_title: "MBA core - Corporate Finance",
  domain: "mba-core",
  license: "CC-BY-4.0",
  file: "bank/02-mba-core/corporate-finance.json",
};

const unipdRow = {
  id: "IMP-UNIPD-AFA-0004",
  topic: "Valuation",
  type: "multiple_choice",
  stem: "Invented imported question?",
  options: [
    { key: "A", text: "Eight" },
    { key: "B", text: "Nine" },
  ],
  answer: "B",
  explanation: "Nine.",
  source: { origin: "imported", attribution: "MBA @ UniPD (AlphaJack/MBA), CC0 1.0", url: "https://github.com/AlphaJack/MBA/blob/34ca53c/docs/courses/afa/exam.md", license: "CC0-1.0" },
  review: { status: "draft" },
  bank_id: "imported-afa",
  bank_title: "UniPD MBA: Advanced Financial Analysis",
  domain: "imported",
  license: "CC0-1.0",
};

describe("normalising Executive Assessment Bank rows", () => {
  it("turns an mba-core multiple-choice item into an unverified bank question with a permanent ID, licence and credit", () => {
    expect(fromBankRow(eabRow)).toMatchObject({
      id: "bank:eab:MBA-FIN-CF-0002",
      source: "eab",
      kind: "choice",
      prompt: "Invented question?",
      choices: [{ id: "A", text: "One" }, { id: "B", text: "Two" }],
      answer: "B",
      licence: "CC-BY-4.0",
      upstreamReview: "self-checked",
      verified: false,
    });
    const q = fromBankRow(eabRow);
    expect(q && "credit" in q && q.credit).toMatch(/Executive Assessment Bank.*CC-BY-4\.0/);
  });

  it("takes the Padova import's own credit, licence and link", () => {
    expect(fromBankRow(unipdRow)).toMatchObject({
      id: "bank:unipd:IMP-UNIPD-AFA-0004",
      source: "unipd",
      licence: "CC0-1.0",
      credit: "MBA @ UniPD (AlphaJack/MBA), CC0 1.0",
      sourceUrl: "https://github.com/AlphaJack/MBA/blob/34ca53c/docs/courses/afa/exam.md",
      verified: false,
    });
  });

  it("skips what is off topic or cannot be marked by code, and says why", () => {
    expect(fromBankRow({ ...eabRow, domain: "executive-assessment" })).toEqual({ skipped: "off topic (domain executive-assessment)" });
    expect(fromBankRow({ ...eabRow, type: "open_response" })).toEqual({ skipped: "not multiple choice (open_response)" });
    expect(fromBankRow({ ...eabRow, answer: "Z" })).toEqual({ skipped: "answer is not one of the options" });
    expect(fromBankRow({ ...eabRow, options: [{ key: "A", text: "Only" }] })).toEqual({ skipped: "fewer than two options" });
    expect(fromBankRow({ ...eabRow, answer: { value: 3 } })).toEqual({ skipped: "answer is not one of the options" });
  });
});

describe("normalising FinQA rows", () => {
  const row = {
    id: "ABC/2008/page_17.pdf-1",
    filename: "ABC/2008/page_17.pdf",
    pre_text: ["First sentence ."],
    post_text: ["Closing sentence ."],
    table: [
      ["company", "volume"],
      ["alpha", "10"],
    ],
    qa: { question: "what is the volume of alpha?", answer: "10", program: "add(10, const_0)", exe_ans: 10 },
  };

  it("keeps the passage and table as context and the gold program as the explanation, unverified", () => {
    const q = fromFinqaRow(row);
    expect(q).toMatchObject({
      id: "bank:finqa:ABC/2008/page_17.pdf-1",
      source: "finqa",
      kind: "numeric",
      prompt: "what is the volume of alpha?",
      answer: "10",
      licence: "MIT",
      verified: false,
      choices: null,
    });
    expect(q && "context" in q && q.context).toContain("First sentence .");
    expect(q && "context" in q && q.context).toContain("company | volume");
    expect(q && "explanation" in q && q.explanation).toContain("add(10, const_0)");
  });

  it("skips a row without a question or answer", () => {
    expect(fromFinqaRow({ ...row, qa: { question: "", answer: "10" } })).toEqual({ skipped: "no question or answer" });
  });
});

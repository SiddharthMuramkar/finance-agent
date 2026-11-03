import { describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import { caseDatasets } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { importBank } from "./ingest";
import type { BankQuestion } from "./normalise";
import { checkReferences, courseReferences } from "./references";

const bankRow = (id: string, over: Partial<BankQuestion> = {}): BankQuestion => ({
  id,
  source: "eab",
  bankTitle: "MBA core - Test",
  topic: "t",
  kind: "choice",
  prompt: "Q?",
  context: null,
  choices: [
    { id: "A", text: "x" },
    { id: "B", text: "y" },
  ],
  answer: "A",
  explanation: "e",
  licence: "CC-BY-4.0",
  credit: "c",
  sourceUrl: "https://example.org",
  upstreamReview: "draft",
  verified: false,
  verifiedNote: null,
  ...over,
});

function map(data = "[price-history, rates]") {
  const { map, errors } = parseCourseMap([
    {
      name: "t.yaml",
      text: `
id: t
title: T
stage: foundation
path: 1
cases: [{ id: c, title: C, asOf: 2018-10-24, data: ${data}, story: S, reveal: R }]
concept: C
principle: P
checks:
  - id: quiz
    kind: quiz
    questions: ["bank:eab:A", "bank:eab:B"]
    passRule: { correct: 1 }
  - id: talk
    kind: conversation
    prompt: Explain.
    passCriteria: Explains.
`,
    },
  ]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const dataset = (datasetId: string) => ({ caseId: "c", datasetId, label: "L", unit: "u", source: "s", sourceUrl: "https://example.org", checkedOn: "2026-11-02", checkNote: "n" });

describe("Course Map references", () => {
  it("lists every bank question a Check names and every Case Data dataset a Case names", () => {
    expect(courseReferences(map())).toEqual({
      bankQuestions: [
        { checkId: "quiz", id: "bank:eab:A" },
        { checkId: "quiz", id: "bank:eab:B" },
      ],
      caseData: [
        { caseId: "c", datasetId: "price-history" },
        { caseId: "c", datasetId: "rates" },
      ],
    });
  });
});

describe("laptop check of Course Map references", () => {
  it("passes when every bank question and Case Data dataset exists", async () => {
    const db = await testDb();
    await importBank(db, [bankRow("bank:eab:A"), bankRow("bank:eab:B")]);
    await db.insert(caseDatasets).values([dataset("price-history"), dataset("rates")]);
    expect(await checkReferences(db, map())).toEqual({ problems: [], bankQuestions: 2, caseData: 2, unverified: 2 });
  });

  it("names each missing question and dataset, with the Check or Case that uses it", async () => {
    const db = await testDb();
    await importBank(db, [bankRow("bank:eab:A")]);
    await db.insert(caseDatasets).values([dataset("price-history")]);
    const { problems } = await checkReferences(db, map());
    expect(problems).toEqual([
      'Check "quiz" lists bank:eab:B, which is not in the Question Bank',
      'Case "c" lists Case Data "rates", which is not in the database',
    ]);
  });

  it("rejects a bank question a quiz Check cannot use (a numeric one)", async () => {
    const db = await testDb();
    await importBank(db, [bankRow("bank:eab:A"), bankRow("bank:eab:B", { kind: "numeric", choices: null, answer: "10" })]);
    await db.insert(caseDatasets).values([dataset("price-history"), dataset("rates")]);
    expect((await checkReferences(db, map())).problems).toEqual(['Check "quiz" lists bank:eab:B, which is a numeric question and cannot be answered in a quiz Check']);
  });

  it("a Case that names no Case Data needs none", async () => {
    const db = await testDb();
    await importBank(db, [bankRow("bank:eab:A"), bankRow("bank:eab:B")]);
    expect((await checkReferences(db, map("[]"))).problems).toEqual([]);
  });
});

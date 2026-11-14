import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { questionBank } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { importBank, verifyBankQuestions } from "./ingest";
import { loadBankQuestions } from "./lookup";
import type { BankQuestion } from "./normalise";

const q = (n: number, over: Partial<BankQuestion> = {}): BankQuestion => ({
  id: `bank:eab:Q-${n}`,
  source: "eab",
  bankTitle: "MBA core - Test",
  topic: "tvm",
  kind: "choice",
  prompt: `Question ${n}?`,
  context: null,
  choices: [
    { id: "A", text: "No" },
    { id: "B", text: "Yes" },
  ],
  answer: "B",
  explanation: `Because ${n}.`,
  licence: "CC-BY-4.0",
  credit: "Executive Assessment Bank, CC-BY-4.0",
  sourceUrl: "https://example.org/bank",
  upstreamReview: "self-checked",
  verified: false,
  verifiedNote: null,
  ...over,
});

describe("Question Bank import", () => {
  it("stores questions with permanent ID, source, licence, credit and an unverified flag", async () => {
    const db = await testDb();
    expect(await importBank(db, [q(1), q(2)])).toEqual({ imported: 2 });
    const [row] = await db.select().from(questionBank).where(eq(questionBank.id, "bank:eab:Q-1"));
    expect(row).toMatchObject({ source: "eab", licence: "CC-BY-4.0", credit: "Executive Assessment Bank, CC-BY-4.0", verified: false, answer: "B" });
  });

  it("re-importing keeps the same IDs, corrects the text, and keeps a checked key checked", async () => {
    const db = await testDb();
    await importBank(db, [q(1)]);
    await verifyBankQuestions(db, ["bank:eab:Q-1"], "Worked by hand 2026-11-02");
    await importBank(db, [q(1, { prompt: "Reworded?" })]);
    const [row] = await db.select().from(questionBank);
    expect(row).toMatchObject({ prompt: "Reworded?", verified: true, verifiedNote: "Worked by hand 2026-11-02" });
  });

  it("a changed answer key drops the verified flag, because the check no longer applies", async () => {
    const db = await testDb();
    await importBank(db, [q(1)]);
    await verifyBankQuestions(db, ["bank:eab:Q-1"], "checked");
    await importBank(db, [q(1, { answer: "A" })]);
    const [row] = await db.select().from(questionBank);
    expect(row).toMatchObject({ answer: "A", verified: false, verifiedNote: null });
  });

  it("verifying an ID that is not in the bank is an error and changes nothing", async () => {
    const db = await testDb();
    await importBank(db, [q(1)]);
    await expect(verifyBankQuestions(db, ["bank:eab:Q-1", "bank:eab:nope"], "x")).rejects.toThrow(/bank:eab:nope/);
    expect((await db.select().from(questionBank))[0].verified).toBe(false);
  });

  it("loads only the choice questions asked for, as keyed questions with credit and verified flag", async () => {
    const db = await testDb();
    await importBank(db, [q(1), q(2), q(3, { kind: "numeric", choices: null, answer: "10" })]);
    const found = await loadBankQuestions(db, ["bank:eab:Q-1", "bank:eab:Q-3", "bank:eab:missing", "plain-id"]);
    expect([...found.keys()]).toEqual(["bank:eab:Q-1"]);
    expect(found.get("bank:eab:Q-1")).toMatchObject({ answer: "B", credit: "Executive Assessment Bank, CC-BY-4.0", verified: false, explanation: "Because 1." });
  });
});

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { GO_DEEPER } from "./chips";
import { rejectedSeqsOf, replyCheckSummaries } from "./reply-records";
import { runTutorTurn, type TurnInput } from "./turn";

/**
 * Seam: the Tutor Turn's record of its reply checks (ticket #248, go-live fixes). Code records the Reply kind it chose;
 * a Learner's own typed message is an answer to their question. Production may lack the new column for a while, so the
 * record fails soft without it.
 */

const me = OWNER_LEARNER_ID;

async function turn(db: Db, input: TurnInput): Promise<number> {
  const { client } = scriptedClient([{ content: [{ type: "text", text: "Present value is what money later is worth today." }] }]);
  let sessionId = 0;
  for await (const e of runTutorTurn({ db, client, learnerId: me }, input)) if (e.type === "done") sessionId = e.ref.sessionId;
  return sessionId;
}

async function kinds(db: Db): Promise<(string | null)[]> {
  const { rows } = (await db.execute(sql`select reply_kind from reply_checks order by id`)) as unknown as { rows: { reply_kind: string | null }[] };
  return rows.map((r) => r.reply_kind);
}

describe("the Reply kind in the reply-check record", () => {
  it("records answer_question for a typed message and go_deeper for the Go deeper chip", async () => {
    const db = await testDb();
    await turn(db, "What is present value?");
    await turn(db, GO_DEEPER);
    expect(await kinds(db)).toEqual(["answer_question", "go_deeper"]);
  });

  it("still saves and reads the record when the reply_kind column is missing", async () => {
    const db = await testDb();
    await db.execute(sql`alter table reply_checks drop column reply_kind`);
    const sessionId = await turn(db, "What is present value?");
    const summaries = await replyCheckSummaries(db, sessionId);
    expect(summaries.size).toBe(1);
    expect(await rejectedSeqsOf(db, sessionId)).toEqual(new Set());
  });
});

import { describe, expect, it } from "vitest";
import { messages, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { citationsAtRisk } from "./citation-impact";
import { importLibrary, type LibraryFile } from "./ingest";
import { passagesToEmbed } from "./ingest";

const file = (passages: { ref: string; text: string }[]): LibraryFile => ({
  source: { id: "a-blog", title: "A blog", kind: "dated", licence: "All rights reserved", licenceUrl: "https://example.org/terms", credit: "A. Writer", url: "https://example.org/blog", fetchedOn: "2026-11-03" },
  passages: passages.map((p) => ({ ...p, heading: "Post", url: "https://example.org/blog/1", publishedOn: "2018-10-20" })),
});

async function idsByRef(db: Db) {
  const rows = await passagesToEmbed(db, 100);
  return Object.fromEntries(rows.map((r) => [r.ref, r.id]));
}

async function cite(db: Db, seq: number, passageId: number) {
  const [{ id: sessionId }] = await db.insert(sessions).values({ instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: `f${seq}` }).returning({ id: sessions.id });
  await db.insert(messages).values({ sessionId, seq, role: "assistant", content: [{ type: "text", text: "Claim.", citations: [{ type: "search_result_location", source: `/passages/${passageId}`, start_block_index: 1, end_block_index: 2 }] }] });
  return sessionId;
}

describe("Citations at risk before a reload", () => {
  it("lists a cited passage whose text will change or vanish, and ignores unchanged and uncited ones", async () => {
    const db = await testDb();
    await importLibrary(db, file([{ ref: "post-1#1", text: "Same." }, { ref: "post-2#1", text: "Old text." }, { ref: "post-3#1", text: "Going away." }, { ref: "post-4#1", text: "Uncited old." }]));
    const id = await idsByRef(db);
    const s2 = await cite(db, 1, id["post-2#1"]);
    const s3 = await cite(db, 1, id["post-3#1"]);
    await cite(db, 2, id["post-1#1"]);

    const risk = await citationsAtRisk(db, "a-blog", [
      { ref: "post-1#1", text: "Same." },
      { ref: "post-2#1", text: "[picture] A table.\n\nOld text." },
      { ref: "post-4#1", text: "Uncited new." },
    ]);

    expect(risk).toEqual([
      { passageId: id["post-2#1"], ref: "post-2#1", heading: "Post", change: "changed", citedBy: [{ sessionId: s2, seq: 1 }] },
      { passageId: id["post-3#1"], ref: "post-3#1", heading: "Post", change: "removed", citedBy: [{ sessionId: s3, seq: 1 }] },
    ]);
  });

  it("does not mistake passage 1 for passage 12", async () => {
    const db = await testDb();
    const many = Array.from({ length: 12 }, (_, i) => ({ ref: `post-${i + 1}#1`, text: `Text ${i + 1}.` }));
    await importLibrary(db, file(many));
    const id = await idsByRef(db);
    await cite(db, 1, id["post-12#1"]);

    const risk = await citationsAtRisk(db, "a-blog", many.map((p) => (p.ref === "post-1#1" ? { ...p, text: "Changed." } : p)));

    expect(risk).toEqual([]);
  });
});

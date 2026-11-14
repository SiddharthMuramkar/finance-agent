import { describe, expect, it } from "vitest";
import { replyCheckLine } from "./under-the-hood";

/** The Under the hood line for the reply checks (spec #229, ticket #239). */
describe("replyCheckLine", () => {
  it("says the words, the failed checks, the retry and the fallback", () => {
    expect(replyCheckLine({ words: 42, failed: [], retried: false, fallback: false })).toBe("Reply checks: 42 words. Passed every check.");
    expect(replyCheckLine({ words: 40, failed: ["V1"], retried: true, fallback: false })).toBe("Reply checks: 40 words. Failed V1. Retried once, and the retry passed.");
    expect(replyCheckLine({ words: 80, failed: ["V1", "V3"], retried: true, fallback: true })).toBe("Reply checks: 80 words. Failed V1, V3. Retried once, then fell back.");
    expect(replyCheckLine({ words: 78, failed: ["V2"], retried: false, fallback: true })).toBe("Reply checks: 78 words. Failed V2. Fell back with no retry.");
  });
});

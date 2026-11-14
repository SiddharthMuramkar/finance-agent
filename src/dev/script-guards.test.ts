import { describe, expect, it } from "vitest";
import { assertLocalBase, assertNamedDatabase, assertTestDatabase, assertToolsLearner, textOf } from "../../scripts/script-guards.mjs";

describe("textOf", () => {
  it("reads a string content", () => expect(textOf({ content: "hi" })).toBe("hi"));
  it("joins two text blocks and skips the others", () =>
    expect(textOf({ content: [{ type: "text", text: "a" }, { type: "tool_use", name: "x" }, { type: "text", text: "b" }] })).toBe("a\nb"));
  it("is empty for anything else", () => expect(textOf({ content: null })).toBe(""));
});

describe("assertLocalBase", () => {
  it("accepts localhost and loopback addresses", () => {
    for (const base of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) expect(() => assertLocalBase(base)).not.toThrow();
  });
  it("refuses look-alikes", () => {
    for (const base of ["https://localhost.evil.test", "https://x.com/?a=localhost", "https://127.0.0.1.evil.test", "nonsense"]) {
      expect(() => assertLocalBase(base)).toThrow();
    }
  });
});

describe("assertTestDatabase", () => {
  const url = "postgres://u:p@ep-test-branch.neon.tech/db";
  const quiet = () => {};
  it("refuses without EVAL_DB_OK", () => expect(() => assertTestDatabase(url, {}, quiet)).toThrow(/EVAL_DB_OK=branch/));
  it("passes with EVAL_DB_OK=branch, and prints the host", () => {
    const lines: string[] = [];
    expect(() => assertTestDatabase(url, { EVAL_DB_OK: "branch" }, (l) => lines.push(l))).not.toThrow();
    expect(lines.join("\n")).toContain("ep-test-branch.neon.tech");
  });
  it("refuses the production host even with EVAL_DB_OK", () =>
    expect(() => assertTestDatabase(url, { EVAL_DB_OK: "branch", PROD_DB_HOST: "ep-test-branch.neon.tech" }, quiet)).toThrow(/production/));
});

describe("assertNamedDatabase", () => {
  const url = "postgres://u@db.example/x";
  const quiet = () => {};
  it("invites guard", () => {
    expect(() => assertNamedDatabase(url, {}, quiet)).toThrow(/INVITES_DB_OK=db\.example/);
    expect(() => assertNamedDatabase(url, { INVITES_DB_OK: "db.example" }, quiet)).not.toThrow();
    expect(() => assertNamedDatabase(url, { INVITES_DB_OK: "other.example" }, quiet)).toThrow(/other\.example/);
    const lines: string[] = [];
    assertNamedDatabase(url, { INVITES_DB_OK: "db.example" }, (l) => lines.push(l));
    expect(lines.join("\n")).toContain("db.example");
  });
});

describe("assertToolsLearner", () => {
  const client = (rows: Record<string, unknown>[]) => ({ query: async () => ({ rows }) });
  it("resolves for the tools Learner", async () => {
    await expect(assertToolsLearner(client([{ name: "tools", archived_at: null }]), 7)).resolves.toBeUndefined();
  });
  it("throws for another Learner or no row", async () => {
    await expect(assertToolsLearner(client([{ name: "owner", archived_at: null }]), 1)).rejects.toThrow(/owner/);
    await expect(assertToolsLearner(client([]), 9)).rejects.toThrow(/not found/);
  });
});

import { describe, expect, it } from "vitest";
import { loadCourseMap, type FixedQuickTry } from "./map";

// The steady-pace Quick tries that compare two stretches (#484, pre-merge MP-1) must be answered by dominance alone:
// the faster stretch grows at least as big a multiple in fewer years, so no factoring or division is needed. Their
// halfDone and fix lines may only restate the ask's own multiples, never factor them ("9 times is tripling twice").

const topic = loadCourseMap().topic("num-compounding")!;
const tryById = (id: string) => topic.checks.flatMap((c) => c.quickTries).find((q): q is FixedQuickTry => "id" in q && q.id === id)!;

const WORD_MULTIPLE: Record<string, number> = { doubled: 2, doubling: 2, tripled: 3, tripling: 3, quadrupled: 4 };

/** The growth multiples a text names, in order: "about 3 times" is 3, "tripled" is 3. */
const multiplesIn = (text: string) =>
  [...text.matchAll(/(\d+) times|\b(doubl(?:ed|ing)|tripl(?:ed|ing)|quadrupled)\b/g)].map((m) => (m[1] ? Number(m[1]) : WORD_MULTIPLE[m[2]]));

/** The year counts a text names, in order: "10 years", "the next 2", "its last 2 years". */
const yearsIn = (text: string) => [...text.matchAll(/(?:next|last|first) (\d+)|(\d+) years?/g)].map((m) => Number(m[1] ?? m[2]));

/** Ask names the slow stretch, then the fast one; the fast one must dominate: a multiple at least as big, in fewer years. */
function dominates(ask: string) {
  const [slowX, fastX] = multiplesIn(ask);
  const [slowY, fastY] = yearsIn(ask);
  return { slowX, fastX, slowY, fastY, ok: fastX >= slowX && fastY < slowY };
}

describe("the steady-pace stretch tries (MP-1)", () => {
  it("can tell a dominated pair from one that needs a sum", () => {
    expect(dominates("An index took 10 years to grow about 9 times. Then it more than tripled in its last 2 years.").ok).toBe(false);
    expect(dominates("An index grew about 3 times over its first 10 years. Then it more than tripled in just the next 2 years.").ok).toBe(true);
  });

  for (const id of ["cp-try-pace-half", "cp-try-pace-stretch"]) {
    it(`${id} is answered by dominance alone, with no factoring in its help`, () => {
      const q = tryById(id);
      const d = dominates(q.ask);
      expect(d, `${id}: ${q.ask}`).toMatchObject({ ok: true });
      const asked = new Set(multiplesIn(q.ask));
      const help = [q.halfDone ?? "", ...(q.choices ?? []).map((c) => c.mistake?.fix ?? "")];
      for (const line of help) {
        expect(line, id).not.toMatch(/twice|\bsquare|divid|\d\.\d|%/);
        for (const x of multiplesIn(line)) expect(asked.has(x), `${id} help names a multiple the ask does not: ${line}`).toBe(true);
      }
    });
  }
});

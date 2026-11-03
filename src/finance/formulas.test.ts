import { describe, expect, it } from "vitest";
import { calculate, CALCULATORS } from "./calculators";
import { FORMULA_IDS } from "./formula-ids";
import { FORMULAS, formulaById } from "./formulas";

const money = (result: ReturnType<typeof calculate>, label: string) => {
  if (!result.ok) throw new Error(result.error);
  return result.results.find((r) => r.label === label)!.value;
};

describe("formula registry", () => {
  it("holds exactly the IDs a Topic file may list", () => {
    expect(FORMULAS.map((f) => f.id)).toEqual([...FORMULA_IDS]);
  });

  it("every entry points at a calculator that runs on the entry's own inputs and yields each value it shows", () => {
    for (const f of FORMULAS) {
      expect(CALCULATORS.some((c) => c.id === f.calculator), `${f.id}: calculator`).toBe(true);
      expect(Object.keys(f.example).sort(), `${f.id}: example keys are the symbols`).toEqual(f.symbols.map((s) => s.key).sort());
      const run = calculate(f.calculator, f.example, "usd");
      if (!run.ok) throw new Error(`${f.id}: ${run.error}`);
      for (const out of [f.result, ...f.derived]) {
        expect(run.results.map((r) => r.label), `${f.id}: ${out.key}`).toContain(out.resultLabel);
      }
    }
  });

  it("writes only symbols it knows in its expression, and uses every symbol", () => {
    for (const f of FORMULAS) {
      const known = new Set([...f.symbols.map((s) => s.key), ...f.derived.map((d) => d.key), "result"]);
      const used = new Set(f.expression.flatMap((line) => [...line.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1])));
      for (const key of used) expect(known.has(key), `${f.id}: {${key}}`).toBe(true);
      for (const s of f.symbols) expect(used.has(s.key), `${f.id}: ${s.key} is never used`).toBe(true);
    }
  });

  it("names every symbol in plain words", () => {
    for (const f of FORMULAS) for (const s of f.symbols) expect(s.name.length, `${f.id}.${s.key}`).toBeGreaterThan(8);
    expect(formulaById("present-value")?.symbols.find((s) => s.key === "years")?.name).toBe("Years until the payment arrives");
    expect(formulaById("nope")).toBeUndefined();
  });
});

describe("growing yearly payments (the jackpot annuity)", () => {
  // Worked by hand, outside the code: $3,310 paid as 3 yearly payments growing 10% a year is
  // 1,000 + 1,100 + 1,210. At a 10% discount rate each payment is worth exactly 1,000 today
  // (1,000 / 1.0^0, 1,100 / 1.1^1, 1,210 / 1.1^2), so the present value is 3,000.
  it("splits $3,310 into $1,000, $1,100 and $1,210 and values them at $3,000 at a 10% rate", () => {
    const r = calculate("growing_annuity_present_value", { total: 3310, payments: 3, growthPercent: 10, ratePercent: 10 });
    expect(money(r, "First payment")).toBeCloseTo(1000, 6);
    expect(money(r, "Present value")).toBeCloseTo(3000, 6);
    expect(money(r, "Sum of payments")).toBe(3310);
  });

  it("is worth the plain total at a 0% rate", () => {
    const r = calculate("growing_annuity_present_value", { total: 3310, payments: 3, growthPercent: 10, ratePercent: 0 });
    expect(money(r, "Present value")).toBeCloseTo(3310, 6);
  });

  it("gives the 2018 Mega Millions first payment of about $23.1 million, as the Case's story says", () => {
    const r = calculate("growing_annuity_present_value", { total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 3 });
    expect(money(r, "First payment") / 1e6).toBeCloseTo(23.13, 1);
  });

  it("answers an error message for an impossible number of payments", () => {
    expect(calculate("growing_annuity_present_value", { total: 100, payments: 0, growthPercent: 5, ratePercent: 3 }).ok).toBe(false);
  });
});

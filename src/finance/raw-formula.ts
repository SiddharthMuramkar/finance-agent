// The one raw-formula detector (ADR 0002): finds a formula typed out as symbols or arithmetic, such as
// "PV = amount / (1 + r)^n" or "1,210 / 1.21 = 1,000". The course check, the behaviour runner and,
// later, the model comparison all call it, so there is one definition of "typed formula".
// No imports, so `scripts/check-course.mjs` can run it under plain Node.

/** What the detector leaves out before it looks: formula markers, code fences (widgets, sources) and links. */
const IGNORED = [/\{\{formula:[^}]*\}\}/g, /```[\s\S]*?```/g, /https?:\/\/\S+/g];

const SIGNS: { name: string; pattern: RegExp }[] = [
  // Any equals sign that is not part of >=, <=, != or ==: "PV = ...", "1,210 / 1.21 = 1,000".
  { name: "an equals sign", pattern: /(?<![<>!=])=(?!=)/ },
  // A power: "(1 + r)^n", "1.1^2".
  { name: "a power (^)", pattern: /[\w)\]]\s*\^\s*[\w(−-]/ },
  // Superscript digits or n after a number or bracket: "1.05²".
  { name: "a superscript power", pattern: /[\w)][²³¹⁰⁴-⁹ⁿ]/ },
  // The discount factor written out: "(1 + r)", "(1 + 0.10)", "(1 − g)".
  { name: "a bracket like (1 + r)", pattern: /\(\s*1\s*[+−-]\s*[\w.%]+\s*\)/ },
  // Arithmetic with spaced operators between figures: "1,100 / 1.10", "5,000 × 0.9". No spaces means a ratio or a date ("P/E", "50/50", "10/24/2018").
  { name: "spaced arithmetic", pattern: /\d[\d,.]*%?\s+[×÷*/]\s+[\d(]/ },
  // A division by a bracket: "amount / (1 + r)".
  { name: "a division by a bracket", pattern: /\S\s+[÷/]\s+\(/ },
  // Maths symbols and functions.
  { name: "a maths symbol", pattern: /[Σ∑∏√]|\bsqrt\(/ },
];

function visible(text: string): string {
  return IGNORED.reduce((t, p) => t.replace(p, " "), text);
}

/** Each typed-formula sign found in `text`, with a short quote of where. Empty when the text is clean. */
export function rawFormulaHits(text: string): string[] {
  const clean = visible(text);
  const hits: string[] = [];
  for (const { name, pattern } of SIGNS) {
    const m = pattern.exec(clean);
    if (!m) continue;
    const from = Math.max(0, m.index - 20);
    hits.push(`${name}: "…${clean.slice(from, m.index + m[0].length + 20).replace(/\s+/g, " ").trim()}…"`);
  }
  return hits;
}

export function hasRawFormula(text: string): boolean {
  return rawFormulaHits(text).length > 0;
}

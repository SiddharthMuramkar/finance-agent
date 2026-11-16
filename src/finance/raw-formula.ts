// The one raw-formula detector (ADR 0003): finds a formula typed out as symbols or arithmetic, such as
// "PV = amount / (1 + r)^n" or "1,210 / 1.21 = 1,000". The course check and the behaviour runner both
// call it, so there is one definition of "typed formula".
// No imports, so `scripts/check-course.mjs` can run it under plain Node.

/** What the detector leaves out before it looks: formula markers, code fences (widgets, sources), links and Markdown link targets (a Citation marker's `?blocks=3-5`). */
const IGNORED = [/\{\{formula:[^}]*\}\}/g, /```[\s\S]*?```/g, /https?:\/\/\S+/g, /\]\([^)]*\)/g];

const SIGNS: { name: string; pattern: RegExp }[] = [
  // Any equals sign that is not part of >=, <=, != or ==: "PV = ...", "1,210 / 1.21 = 1,000".
  { name: "an equals sign", pattern: /(?<![<>!=])=(?!=)/ },
  // A power: "(1 + r)^n", "1.1^2".
  { name: "a power (^)", pattern: /[\w)\]]\s*\^\s*[\w(−-]/ },
  // Superscript digits or n after a number or bracket: "1.05²".
  { name: "a superscript power", pattern: /[\w)][²³¹⁰⁴-⁹ⁿ]/ },
  // The discount factor written out: "(1 + r)", "(1 + 0.10)", "(1 − g)", "(1 - tax rate)".
  { name: "a bracket like (1 + r)", pattern: /\(\s*1\s*[+−-]\s*[\w.%][\w.%' ]*\)/ },
  // Arithmetic with spaced operators between figures: "1,100 / 1.10", "5,000 × 0.9". No spaces means a ratio or a date ("P/E", "50/50", "10/24/2018").
  { name: "spaced arithmetic", pattern: /\d[\d,.]*%?\s+[×÷*/]\s+[\d(]/ },
  // A division by a bracket: "amount / (1 + r)".
  { name: "a division by a bracket", pattern: /\S\s+[÷/]\s+\(/ },
  // A times or division sign between terms (review F10), narrowed so prose is left alone (review 3, L16). The signs × and
  // ÷ are maths symbols, so they count between any terms: "profit × (1 - t)". The letter x counts only with a symbol-like operand: a
  // single letter ("S x u", "D x the change"), a bracket ("beta x (premium + CRP)", "(E/V) x Re") or figures on both
  // sides ("1.60 x 4%"). "The x axis", "20 x earnings" and "5x" are prose.
  {
    name: "a times sign between terms",
    pattern:
      /[\w)%][ \t]+[×÷][ \t]+[\w(]|(?:(?<![\w'])[A-Za-z]|\))[ \t]+x[ \t]+(?!ax[ie]s\b)[\w(]|[\w)%][ \t]+x[ \t]+(?:[A-Za-z](?![\w'])|\()|\d%?[ \t]+x[ \t]+\d/,
  },
  // A plus between terms, with a symbol-like operand: single letters ("C + I + G"), figures on both sides ("6.5% + 1.60"),
  // a bracket, or inside a bracket with another sign ("(market value of equity + debt - cash)"). Prose writes "and";
  // "Tata Motors + JLR", "(Tata Motors + JLR)" and "18+" are left alone.
  {
    name: "a plus between terms",
    pattern:
      /(?<![\w'])[A-Za-z][ \t]+\+[ \t]+[\w(]|[\w)%][ \t]+\+[ \t]+[A-Za-z](?![\w'])|\d%?[ \t]+\+[ \t]+\d|\)[ \t]+\+[ \t]+[\w(]|[\w)%][ \t]+\+[ \t]+\(|\([^()]*[\w%][ \t]+\+[ \t]+[^()]*?[ \t][−\-x×/÷+][ \t][^()]*\)|\([^()]*[ \t][−\-x×/÷][ \t][^()]*?[\w%][ \t]+\+[ \t]+[^()]*\)/,
  },
  // A chain of two or more spaced x or + signs between words in one clause: "probability of survival x going concern
  // value + probability of distress x distress sale value".
  { name: "a chain of operators between words", pattern: /[\w)%][ \t]+[x×+][ \t]+[^.,;:!?\n]{1,60}?[ \t]+[x×+][ \t]+[\w(]/ },
  // A minus or division between single capitals or a bracket: "(X - M)", "E / V". A spaced hyphen between words is a dash.
  { name: "a minus or division between letters", pattern: /(?<![\w'])[A-Z][ \t]+[−/÷-][ \t]+(?:[A-Z](?![\w'])|\()/ },
  // A division between words, when what it divides by is a bracket or two or more words: "pre-money valuation / shares
  // outstanding". A single word each side is an either-or ("price / value"); "and/or" and "P/E" have no spaces.
  { name: "a division between words", pattern: /[a-z)%][ \t]+\/[ \t]+(?:\(|[a-z][\w'-]*[ \t]+[a-z])/i },
  // Maths symbols and functions: "√", "sqrt(", and a payoff typed as "max(S - K, 0)" or "min(...)" (review 2, G30).
  { name: "a maths symbol", pattern: /[Σ∑∏√]|\b(?:sqrt|max|min)\(/i },
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

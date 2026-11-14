import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The accent families. `globals.css` maps family colours to Tailwind utilities (`--color-violet-ink: var(--violet-ink)`), so
// one colour has three spellings: `text-[var(--violet-ink)]`, the shorthand `text-(--violet-ink)` and `text-violet-ink`.
// The two family rules catch every spelling the same way.
const FAMILY = "(?:mint|coral|sun|violet|you|src)";
/** A family colour as text: the base or its -ink. */
const INK = `${FAMILY}(?:-ink)?`;
/** A family -tint or -tag token (and -tag-ink). */
const TINT = `${FAMILY}-(?:tint|tag)`;
/** Tailwind's colour utilities: each names a colour after its dash. */
const PAINT = "(?:bg|text|border(?:-[xytrblse])?|outline|ring(?:-offset)?|inset-ring|shadow|inset-shadow|fill|stroke|from|via|to|decoration|divide|accent|caret)";
/** `token` as a Tailwind value: `[var(--token)]` or `(--token)`, either with a `color:` hint, or the bare utility name. */
const value = (token: string) => `(?:\\[(?:color:)?var\\(--${token}\\)\\]|\\((?:color:)?--${token}\\)|${token}(?![\\w-]))`;
/** `var(--token)` in quotes, as a JSX attribute (`fill="…"`, `fill={"…"}`) or a style value. */
const quoted = (token: string) => `\\{?["'\`]var\\(--${token}\\)["'\`]`;

const RULES: Record<string, RegExp> = {
  familyFill: new RegExp(`\\((?:color:)?--${TINT}|(?<![\\w-])${PAINT}-${TINT}(?:-ink)?(?![\\w-])`),
  // Text in HTML (`text-…`, `color:`) and in SVG (`fill` on `<text>`, `<tspan>` or `<textPath>`, as an attribute or a class).
  familyText: new RegExp(
    `(?<![\\w-])text-${value(INK)}|color:\\s*${quoted(INK)}|<(?:text|tspan|textPath)\\b[^>]*(?:\\bfill=${quoted(INK)}|\\bfill-${value(INK)}|\\bfill:\\s*${quoted(INK)})`,
  ),
  shadow: /shadow-\[|shadow-(?:sm|md|lg|xl|2xl|inner)\b|boxShadow:/,
  pill: /rounded-(?:2xl|3xl)\b|rounded[a-z-]*-\[(?:1[3-9]|[2-9]\d|[1-9]\d{2,})px\]|rounded[a-z-]*-\[(?:0?\.(?:7[6-9]|[89])\d*|0?\.75\d*[1-9]\d*|[1-9]\d*(?:\.\d+)?)rem\]/,
  lift: /--lip\b|--lip-colour|"--face":|"--rim":|(?<=["'` ])pressable(?=["'` ])|border-b-\[3px\]|(?:hover|active):(?:-?translate|-?scale)/,
  // A rotate utility behind any variant (hover:, md:), but not a disclosure chevron's group-open:rotate-90.
  tilt: /(?<![\w:-])(?!group-open:)(?:[a-z0-9-]+:)*-?rotate-\d|rotate:/,
  decorativeMotion: /story-bounce|story-pop|story-bubble-in|choice-pop|animate-ring-pulse|animate-fade-rise|animate-widget-stage-in|animate-bounce|animate-pulse|animate-ping|scale\(0\./,
  heavy: /font-(?:bold|extrabold|black|serif)\b|fontWeight[=:{]\s*\{?\s*[789]00/,
  colourLiteral: /["']#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/,
};

const KNOWN: Record<string, string[]> = {};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".generated.json") ? [path] : [];
  });
}

/** Every property that each `@keyframes <name>` block names, in every stop: braces are matched and comments dropped. */
function keyframeProperties(css: string, name: string): string[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...plain.matchAll(new RegExp(`@keyframes\\s+${name}\\s*\\{`, "g"))].flatMap((match) => {
    const start = match.index + match[0].length;
    let end = start;
    for (let depth = 1; end < plain.length && depth > 0; end++) depth += plain[end] === "{" ? 1 : plain[end] === "}" ? -1 : 0;
    return [...plain.slice(start, end - 1).matchAll(/\{([^{}]*)\}/g)].flatMap(([, stop]) =>
      stop.split(";").map((declaration) => declaration.trim()).filter(Boolean).map((declaration) => declaration.split(":")[0].trim()),
    );
  });
}

function sources(): string[] {
  const widgets = files("src/widgets");
  const panels = readdirSync("src/app")
    .filter((name) => name.startsWith("widget-") && /\.tsx$/.test(name) && !/\.test\./.test(name))
    .map((name) => join("src/app", name));
  return [...widgets, ...panels];
}

describe("the minimal Widget look", () => {
  // Every pair the spec lists (A10a "The rules"): each rule must catch what it names and nothing near it.
  const PAIRS: Record<string, { hit: string[]; miss: string[] }> = {
    // Every spelling of one colour: `var(--…)`, Tailwind's `(--…)` shorthand, and the utility `globals.css` maps (`--color-…`).
    familyFill: {
      hit: [
        "var(--mint-tint)", "bg-[var(--sun-tag)]", "var(--you-tag-ink)",
        "bg-(--mint-tint)", "bg-(color:--sun-tag)", "bg-mint-tint", "hover:bg-violet-tag", "from-coral-tint/40", "border-l-src-tag", "text-you-tag-ink",
      ],
      miss: ["var(--mint)", "var(--mint-ink)", "bg-mint", "bg-(--mint)", "bg-mint-ink", "border-sun", "bg-accent-tint", "bg-[var(--accent-tint)]"],
    },
    familyText: {
      hit: [
        "text-[var(--violet-ink)]", "text-[var(--sun)]", 'color: "var(--coral-ink)"', '<text x={4} fill="var(--sun-ink)">',
        "text-violet-ink", "hover:text-sun", "text-you", "text-src/80", "text-(--sun-ink)", "text-(color:--mint)", "text-[color:var(--coral)]", "color: 'var(--violet)'",
        '<text x={1} fill="var(--you)">', '<text fill="var(--src)">', '<text fill="var(--sun)">', '<tspan fill="var(--mint-ink)">', '<text className="fill-violet-ink">', '<text className="fill-(--coral)">',
      ],
      miss: [
        'stroke="var(--sun-ink)"', "border-[var(--sun)]", "text-[var(--success)]",
        "border-sun", "border-(--sun-ink)", "stroke-violet-ink", "fill-[var(--you)]", '<rect fill="var(--sun)">', '<text fill="var(--ink)">', "text-success", "text-sm",
      ],
    },
    shadow: {
      hit: ["shadow-[0_2px_0]", "shadow-[inset_0_-2px_0_var(--rule)]", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl", "shadow-inner", "boxShadow: x"],
      miss: ["shadow-none"],
    },
    pill: {
      hit: ["rounded-2xl", "rounded-3xl", "rounded-[16px]", "rounded-[999px]", "rounded-t-[13px]", "rounded-b-[2.5rem]", "rounded-[0.9rem]", "rounded-[1rem]"],
      miss: ["rounded-xl", "rounded-full", "rounded-[12px]", "rounded-[0.75rem]", "rounded-[8px]"],
    },
    lift: {
      hit: ["--lip", "--lip-colour", '"--face": x', '"--rim": x', 'className="pressable"', "border-b-[3px]", "hover:-translate-y-0.5", "active:translate-y-px", "hover:scale-105", "active:scale-95"],
      miss: ["--line", "translate-y-1", "border-b"],
    },
    tilt: {
      hit: ["rotate-6", "-rotate-3", "hover:rotate-3", "md:-rotate-2", 'style={{ rotate: "6deg" }}', 'className="rotate-1"'],
      miss: ["group-open:rotate-90", "rotateY(180deg)"],
    },
    decorativeMotion: {
      hit: ["story-bounce", "story-pop", "story-bubble-in", "choice-pop", "animate-ring-pulse", "animate-fade-rise", "animate-widget-stage-in", "animate-bounce", "animate-pulse", "animate-ping", "scale(0.96)"],
      miss: ["story-step", "jar-in", "scale(1)"],
    },
    heavy: {
      hit: ["font-bold", "font-extrabold", "font-black", "font-serif", "fontWeight={700}", "fontWeight={800}", "fontWeight: 900"],
      miss: ["<strong>", "<b>", "font-medium", "fontWeight={500}"],
    },
    colourLiteral: { hit: ['"#c9a227"', "'#fff'", "rgb(0 0 0)", "rgba(0,0,0,.5)", "hsl(0 0% 0%)"], miss: ["#457", "// see #457"] },
  };

  it("each rule catches what it names, and nothing near it", () => {
    expect(Object.keys(PAIRS).sort()).toEqual(Object.keys(RULES).sort());
    for (const [name, { hit, miss }] of Object.entries(PAIRS)) {
      for (const example of hit) expect(RULES[name].test(example), `${name} should catch ${example}`).toBe(true);
      for (const example of miss) expect(RULES[name].test(example), `${name} should pass ${example}`).toBe(false);
    }
  });

  it("no Widget file breaks a rule, and KNOWN is empty", () => {
    const found: Record<string, string[]> = {};
    for (const file of sources()) {
      const text = readFileSync(file, "utf8");
      const broken = Object.entries(RULES)
        .filter(([name, rule]) => (name === "colourLiteral" ? file.startsWith("src/widgets/primitives/") : !file.includes("/plot/") && !file.endsWith("annuity-plot.tsx") && !file.endsWith("history-plot.tsx") || name !== "familyText") && rule.test(text))
        .map(([name]) => name);
      if (broken.length) found[file] = broken;
    }
    expect(KNOWN).toEqual({});
    expect(found).toEqual({});
  });

  it("globals.css keeps only motion with meaning", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const name of ["story-bounce", "story-pop", "story-bubble-in", "choice-pop", "ring-pulse", "fade-rise", "widget-stage-in"]) {
      expect(css).not.toMatch(new RegExp(`@(?:keyframes|utility) ${name}\\b`));
    }
    for (const name of ["story-step", "jar-in", "jar-out", "flow-draw", "flow-ride"]) expect(css).toContain(`@keyframes ${name}`);
    expect(css).toContain('.lingo-inner[data-flipped="true"]');
    // The check itself sees every stop, every property and every block of that name; each of these must be caught.
    const REGRESSIONS: Record<string, [css: string, properties: string[]]> = {
      "a second stop": ["@keyframes jar-in {\n  from {\n    opacity: 0;\n  }\n  to { transform: scale(1.1); }\n}", ["opacity", "transform"]],
      "a translate": ["@keyframes jar-in {\n  from {\n    opacity: 0;\n    translate: 0 4px;\n  }\n}", ["opacity", "translate"]],
      "a scale": ["@keyframes jar-in { from { opacity: 0; scale: 0.6; } }", ["opacity", "scale"]],
      "a later block of the same name": ["@keyframes jar-in { from { opacity: 0; } }\n@keyframes jar-in { 50% { rotate: 3deg; } }", ["opacity", "rotate"]],
    };
    for (const [regression, [sample, properties]] of Object.entries(REGRESSIONS)) {
      expect(keyframeProperties(sample, "jar-in"), regression).toEqual(properties);
    }
    expect(keyframeProperties("@keyframes jar-in-slow { from { scale: 0.6; } }\n@keyframes jar-in { /* no transform */ from { opacity: 0; } }", "jar-in")).toEqual(["opacity"]);
    for (const name of ["story-step", "jar-in", "jar-out"]) {
      const properties = keyframeProperties(css, name);
      expect(properties, name).toContain("opacity");
      expect(properties.filter((property) => property !== "opacity"), `${name} names only opacity`).toEqual([]);
    }
  });
});

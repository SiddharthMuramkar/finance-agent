// scripts/check-theme-contrast.mjs
// Zero-dependency guard for the app's one Light theme (decision #17; docs/specs/value-it-signal-spec.md §2.4, §3.1).
// Run: node scripts/check-theme-contrast.mjs [path/to/tokens.css] [colour-only.json]. Exits 1 if any rule fails.
// It checks that: there is no Dark theme left; the spec's colours are declared as literals with the spec's values; every
// other colour name points at a spec token (token-first: no new literal colour); and the spec's §2.4 tables hold, its
// contrast ratios and its colour separation under normal vision and three kinds of colour blindness.
import { readFileSync } from 'node:fs';

const CSS_PATH = process.argv[2] ?? 'src/app/globals.css'; // <-- the file that defines the :root token block

// Fills need 3:1 against their surface only when colour ALONE carries the meaning (WCAG 2.2 SC 1.4.11). A fill that is
// decorative, or always paired with a text label, an icon, a sign or a pattern (spec §2.2 rule 1), is exempt. The kit's
// chart series are listed: a series' mark is needed to read the chart and a legend does not exempt it, so each series
// token (CHART_SERIES in src/widgets/genui-theme.tsx; a test keeps the copies equal) is checked on each chart surface. A
// JSON array of pairs as the second argument checks that list instead (the tests use it).
const CHART_SERIES = ['line-strong', 'ink', 'blue', 'muted'];
const CHART_SURFACES = ['paper', 'raised', 'wash', 'frame'];
const COLOUR_ONLY = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : CHART_SERIES.flatMap(f => CHART_SURFACES.map(b => [f, b]));

// Spec §3.1, frozen: these change only with the spec.
const SPEC = {
  paper: '#ffffff', wash: '#f5f7fb', 'wash-2': '#e9edf5', grid: '#e9edf4',
  ink: '#0b0d12', 'ink-2': '#30353f', muted: '#5f6571', faint: '#8b919b', rule: '#e2e5ea', line: '#c6cad2',
  blue: '#1f3fae', 'blue-hover': '#1a3596', 'blue-pressed': '#152b7a', 'on-blue': '#ffffff', 'blue-tint': '#eef2fc', 'blue-tint-2': '#e3e9fa', 'blue-line': '#a9b8ec',
  gain: '#0faa7b', 'gain-deep': '#087f5b', 'gain-ink': '#0b7a5a', 'gain-tint': '#e7f7f0', 'gain-line': '#9ee0c6',
  loss: '#be1e3a', 'loss-ink': '#a3152e', 'loss-tint': '#fcebee', 'loss-line': '#f0a9b5',
  wait: '#f97316', 'wait-ink': '#a84b00', 'wait-tint': '#fff1e3', 'wait-line': '#fbc592',
  overlay: 'rgba(255,255,255,.9)',
};
// The only other literal colours: the app's strong line for control edges, the translucent whites on a Band (spec F1),
// and the Widgets' drop shadow (not colour-checked).
const CHROME = { 'line-strong': '#868c97', 'on-band-2': 'rgb(255 255 255 / 0.72)', 'band-rule': 'rgb(255 255 255 / 0.18)', shadow: 'rgb(11 13 18 / 0.22)' };
// Every other colour name, and the spec token it points at (decision #17): you is blue, src is ink (the record), mint is
// gain, coral is loss, sunflower is the record, violet is neutral, and success, warning and danger are gain, careful and
// loss. Older names follow their newer names.
const POINTS = {
  raised: 'paper', frame: 'paper',
  accent: 'blue', 'accent-fill': 'blue', ring: 'blue', 'accent-hover': 'blue-hover', 'accent-pressed': 'blue-pressed', 'accent-deep': 'blue-pressed',
  'on-accent': 'on-blue', 'accent-tint': 'blue-tint', 'accent-tint-2': 'blue-tint-2', 'accent-line': 'blue-line',
  fill: 'blue', 'on-fill': 'on-blue', 'fill-hover': 'blue-hover', 'fill-active': 'blue-pressed', dim: 'rule', 'on-dim': 'faint',
  success: 'gain-ink', 'success-tint': 'gain-tint', warning: 'wait-ink', 'warning-tint': 'wait-tint',
  danger: 'loss', 'danger-tint': 'loss-tint', 'danger-hover': 'loss-ink', 'on-danger': 'on-blue', data: 'line',
  mint: 'gain', 'mint-ink': 'gain-ink', 'mint-tint': 'gain-tint', 'mint-tag': 'gain-tint',
  coral: 'loss', 'coral-ink': 'loss-ink', 'coral-tint': 'loss-tint', 'coral-tag': 'loss-tint', 'coral-fill': 'loss', 'coral-deep': 'loss-ink',
  sun: 'ink', 'sun-ink': 'ink', 'sun-tint': 'wash', 'sun-tag': 'wash-2',
  violet: 'muted', 'violet-ink': 'ink-2', 'violet-tint': 'wash', 'violet-tag': 'wash-2',
  you: 'blue', 'you-line': 'blue', 'you-tint': 'blue-tint', 'you-tag': 'blue-tint-2', 'you-tag-ink': 'blue',
  src: 'ink', 'src-line': 'ink', 'src-tint': 'wash', 'src-tag': 'wash-2', 'src-tag-ink': 'ink',
  bg: 'paper', field: 'raised', bubble: 'wash', hairline: 'rule', border: 'line', edge: 'line-strong',
  brand: 'accent', 'brand-main': 'accent-fill', 'brand-hover': 'accent-hover', 'brand-pressed': 'accent-pressed', 'brand-deep': 'accent-deep',
  'brand-ink': 'on-accent', 'brand-tint': 'accent-tint', 'brand-soft': 'accent-tint', 'brand-line': 'accent-line',
  royal: 'blue', band: 'royal', 'on-band': 'on-blue', 'on-band-button-ink': 'ink', 'band-card': 'paper', 'key-number': 'accent',
};

// ---------- parsing ----------
const norm = s => s.replace(/\s+/g, '').replace(/'/g, '"').toLowerCase();
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
function rootBlock(css) {
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (norm(m[1].split(';').pop()) === ':root' && /--paper\s*:/.test(m[2])) {
      const t = {};
      for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);?/g)) t[d[1]] = d[2].trim();
      return { tokens: t, scheme: (/(?:^|[;\s])color-scheme\s*:\s*([^;]+)/.exec(m[2])?.[1] ?? '').trim() };
    }
  }
  return null;
}
const NAMED = { white: '#ffffff', black: '#000000' };
function parseColor(v) {
  v = (NAMED[v] ?? v ?? '').trim();
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : (m[5] ? +m[4] / 100 : +m[4]) };
  return null; // var(), color-mix() etc. are not colours here
}
// A token's value with any var(--other) followed, the way the page resolves it.
function resolve(t, k, depth = 0) {
  const v = (t[k] ?? '').trim(), m = v.match(/^var\(\s*--([\w-]+)\s*\)$/);
  return m && depth < 8 ? resolve(t, m[1], depth + 1) : v;
}
const same = (a, b) => !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.002;
// ---------- colour maths (WCAG 2, OKLab, Machado 2009) ----------
const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const over = (fg, bg) => fg.a >= 1 ? fg : { r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)), g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)), b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)), a: 1 };
const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const wcag = (x, y) => { const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p); return (h + 0.05) / (l + 0.05); };
function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
// Machado, Oliveira and Fernandes (2009) at full severity, applied to linear RGB (spec §2.4).
const VISION = {
  normal: null,
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const clamp01 = x => Math.min(1, Math.max(0, x));
const seen = ({ r, g, b }, matrix) => { const v = [r, g, b].map(lin); return matrix ? matrix.map(row => clamp01(row[0] * v[0] + row[1] * v[1] + row[2] * v[2])) : v; };
const separation = (x, y, matrix) => { const [p, q] = [oklab(seen(x, matrix)), oklab(seen(y, matrix))]; return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const L = c => oklab(seen(c, null))[0];

// ---------- the spec's tables (§2.4) ----------
// Contrast ratios: [fg, bg, the spec's ratio, minimum, use]. The minimum is 7 for body text, 4.5 for text, 3 for a graphic,
// and 0 for the two marks the spec measures below 3:1 and pairs with labels or hatching instead. Each pair must also equal
// the spec's ratio to two decimals, so no spec colour can drift without the table changing with it.
const SPEC_CONTRAST = [
  ['ink-2', 'paper', 12.30, 7, 'body text'],
  ['ink', 'paper', 19.43, 7, 'headings'],
  ['muted', 'paper', 5.86, 4.5, 'muted text'],
  ['muted', 'wash', 5.46, 4.5, 'muted text on wash'],
  ['faint', 'paper', 3.17, 3, 'faint text (axis ends only)'],
  ['blue', 'paper', 8.82, 4.5, 'blue text'],
  ['blue', 'blue-tint', 7.87, 4.5, 'blue text on blue-tint'],
  ['gain-ink', 'gain-tint', 4.81, 4.5, 'pill text'],
  ['loss-ink', 'loss-tint', 6.75, 4.5, 'pill text'],
  ['wait-ink', 'wait-tint', 5.16, 4.5, 'pill text'],
  ['on-blue', 'blue', 8.82, 4.5, 'white on a blue fill'],
  ['on-blue', 'loss', 6.11, 4.5, 'white on a red fill'],
  ['on-blue', 'gain-deep', 5.00, 4.5, 'white on a deep-green fill'],
  ['on-blue', 'ink', 19.43, 4.5, 'white on a black fill'],
  ['ink', 'gain', 6.53, 4.5, 'ink on a green fill (segmented-bar label)'],
  ['gain', 'wash', 2.77, 0, 'green bars: below 3:1, so direct labels, tooltip and table view are required'],
  ['wait', 'wash', 2.61, 0, 'orange claim bar: below 3:1, so always hatched with a 1.5px orange outline and a label'],
  ['loss', 'wash', 5.70, 3, 'red bars'],
];
// Colour separation: OKLab distance x 100 under each vision, [a, b, normal, deuteranopia, protanopia, tritanopia, why
// exempt]. Target: at least 15 under normal vision and at least 8 under colour blindness. Each figure must equal the
// spec's to one decimal; a pair below a target passes only with the spec's reason.
const SPEC_SEPARATION = [
  ['gain', 'loss', 34.1, 13.0, 27.7, 35.4],
  ['gain', 'wait', 28.1, 13.8, 10.6, 32.2],
  ['loss', 'wait', 20.8, 19.9, 22.7, 14.0],
  ['blue', 'gain', 33.9, 30.8, 32.3, 23.5],
  ['blue', 'loss', 32.5, 27.7, 20.1, 31.4],
  ['blue', 'wait', 44.8, 43.8, 33.6, 37.3],
  ['gain', 'gain-deep', 12.8, 12.6, 13.3, 12.9, 'the same meaning (gain) at a second level, never a new meaning'],
  ['loss', 'gain-deep', 28.9, 5.7, 14.4, 31.1, 'never adjacent data marks: they meet only as a wrong-answer chip with a cross icon'],
];

// ---------- app pairs ----------
const SURF = ['paper', 'wash', 'raised', 'frame'];
const ACCENT_TINTS = ['accent-tint', 'accent-tint-2'];
const STATUS_TINTS = ['success-tint', 'warning-tint', 'danger-tint'];
const FAMILIES = ['mint', 'coral', 'sun', 'violet'];
const TINTS = [...FAMILIES.map(a => `${a}-tint`), 'you-tint', 'src-tint'];
const TAGS = FAMILIES.map(a => `${a}-tag`);
const TEXT = [ // [fg, bg, minimum WCAG ratio]
  ...[...SURF, ...ACCENT_TINTS, ...STATUS_TINTS, ...TINTS, ...TAGS].map(b => ['ink', b, 7]),
  ...SURF.map(b => ['ink-2', b, 7]),
  ...[...SURF, 'rule', ...ACCENT_TINTS, ...STATUS_TINTS, ...TINTS].map(b => ['muted', b, 4.5]),
  ['faint', 'paper', 3],
  ...[...SURF, ...ACCENT_TINTS].map(b => ['accent', b, 4.5]),
  ...['accent-fill', 'accent-hover', 'accent-pressed'].map(b => ['on-accent', b, 4.5]),
  ...['fill', 'fill-hover', 'fill-active'].map(b => ['on-fill', b, 4.5]),
  ...['danger', 'danger-hover'].map(b => ['on-danger', b, 4.5]),
  ...['success', 'warning', 'danger'].flatMap(k => ['paper', 'raised', `${k}-tint`].map(b => [k, b, 4.5])),
  ...FAMILIES.flatMap(a => ['paper', 'raised', `${a}-tint`, `${a}-tag`].map(b => [`${a}-ink`, b, 4.5])),
  ['you', 'paper', 4.5], ['src', 'paper', 4.5], ['you-tag-ink', 'you-tag', 4.5], ['src-tag-ink', 'src-tag', 4.5],
  // Not text, 3:1: a control's edge and the focus ring on every surface a control sits on, and the fills on the page.
  ...['line-strong', 'ring'].flatMap(f => ['paper', 'raised', 'wash'].map(b => [f, b, 3])),
  ['accent-fill', 'paper', 3], ['fill', 'paper', 3],
];
// The pairs on a Band (spec F1, F5) and the key-number colour on every surface it sits on: [fg, bg, minimum, ratio, use].
// A translucent colour (white at 72% or 18%) is laid over its surface before it is measured.
const BAND_PAIRS = [
  ['on-band', 'band', 4.5, 8.82, 'text, a button\'s outline and the focus ring on a Band'],
  ['on-band-2', 'band', 4.5, 5.36, 'secondary text on a Band'],
  ['on-band-button-ink', 'on-band', 4.5, 19.43, 'the label of a white button on a Band'],
  ['band-rule', 'band', 0, 1.58, 'a decorative rule on a Band, which carries no meaning'],
  ['key-number', 'paper', 4.5, 8.82, 'eyebrows, key numbers, sliders and links'],
  ['key-number', 'wash', 4.5, 8.23, 'the same, on a washed surface'],
  ['key-number', 'raised', 4.5, 8.82, 'the same, on a raised surface'],
  ['key-number', 'frame', 4.5, 8.82, 'the same, inside a Widget'],
  ['key-number', 'accent-tint', 4.5, 7.87, 'the same, on a selected row'],
  ['ink', 'band-card', 7, 19.43, 'text on a card on a Band'],
  ['key-number', 'band-card', 4.5, 8.82, 'a key number on a card on a Band'],
];

// ---------- run ----------
const css = readFileSync(CSS_PATH, 'utf8');
const fails = [];
const out = [];
const check = (ok, msg) => { out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

out.push('\n[one Light theme]');
const code = stripComments(css);
check(!/\.dark\b/.test(code), 'no .dark selector (there is no Dark theme)');
check(!/@custom-variant\s+dark\b/.test(code), 'no dark variant');
check(!/prefers-color-scheme\s*:\s*dark/.test(code), 'no prefers-color-scheme: dark (the computer\'s setting is never read)');
check(!/data-theme\s*=\s*["']?dark/.test(code), 'no [data-theme="dark"] selector');

const root = rootBlock(css), raw = root?.tokens;
if (!raw) {
  check(false, `no ":root { --paper: … }" block in ${CSS_PATH}`);
} else {
  check(norm(root.scheme) === 'light', 'color-scheme is light');

  out.push('\n[spec §3.1 tokens]');
  for (const [k, v] of Object.entries(SPEC)) check(same(parseColor(raw[k]), parseColor(v)), `--${k} is ${v} (spec §3.1)`);
  for (const [k, v] of Object.entries(CHROME)) check(same(parseColor(raw[k]), parseColor(v)), `--${k} is unchanged (${v})`);

  out.push('\n[every other colour points at a spec token]');
  for (const [k, now] of Object.entries(POINTS)) check(norm(raw[k] ?? '') === `var(--${now})`, `--${k} points at --${now}`);
  for (const [k, v] of Object.entries(raw)) {
    if (parseColor(v) && !(k in SPEC) && !(k in CHROME)) check(false, `--${k} is a literal colour (${v}) outside the spec block: point it at a spec token`);
  }

  const C = k => parseColor(resolve(raw, k));
  const missing = [...new Set([...SPEC_CONTRAST, ...TEXT, ...BAND_PAIRS, ...COLOUR_ONLY].flatMap(([f, b]) => [f, b]))].filter(k => !C(k));
  for (const k of missing) check(false, `--${k} is missing or not a colour ("${resolve(raw, k)}")`);
  if (!missing.length) {
    const bg = C('paper'), S = k => over(C(k), bg);
    const ratio = (f, b) => { const under = S(b); return wcag(over(C(f), under), under); };

    out.push('\n[spec §2.4 contrast]');
    for (const [f, b, want, min, use] of SPEC_CONTRAST) {
      const r = ratio(f, b);
      check(r >= min && Math.abs(r - want) < 0.01, `--${f} on --${b} ${r.toFixed(2)}:1 (${min ? `min ${min}` : 'below 3:1 by design'}, spec ${want.toFixed(2)}): ${use}`);
    }

    out.push('\n[spec §2.4 colour separation, OKLab x 100]');
    for (const [a, b, ...rest] of SPEC_SEPARATION) {
      const why = typeof rest[rest.length - 1] === 'string' ? rest.pop() : null;
      Object.keys(VISION).forEach((vision, i) => {
        const d = separation(S(a), S(b), VISION[vision]), want = rest[i], floor = vision === 'normal' ? 15 : 8;
        const meets = d >= floor;
        check(Math.abs(d - want) < 0.05 && (meets || !!why), `--${a} and --${b} ${d.toFixed(1)} under ${vision} (target ${floor}, spec ${want.toFixed(1)})${meets ? '' : `: below target, ${why ?? 'with no reason in the spec'}`}`);
      });
    }

    out.push('\n[app pairs]');
    for (const [f, b, min] of TEXT) { const r = ratio(f, b); check(r >= min, `--${f} on --${b} ${r.toFixed(2)}:1 (min ${min})`); }
    for (const [f, b, min, want, use] of BAND_PAIRS) {
      const r = ratio(f, b);
      check(r >= min && Math.abs(r - want) < 0.01, `--${f} on --${b} ${r.toFixed(2)}:1 (${min ? `min ${min}` : 'decorative, no minimum'}, spec ${want}): ${use}`);
    }
    for (const [f, b] of COLOUR_ONLY) {
      if (!(f in raw) || !(b in raw)) { check(false, `colour-only pair [${f}, ${b}] names a fill token and a surface token`); continue; }
      const r = ratio(f, b); check(r >= 3, `--${f} on --${b} ${r.toFixed(2)}:1 (min 3, colour alone carries the meaning)`);
    }
    // --accent-deep (= --brand-deep) is frozen but no longer drawn: Widget controls are flat (ADR 0014). It keeps its old
    // promise, darker than the primary's face.
    check(L(S('accent-deep')) < L(S('accent-fill')), '--accent-deep is darker than --accent-fill');
    const order = ['paper', 'raised', 'wash', 'rule', 'line', 'line-strong'].map(k => L(S(k)));
    check(order[0] >= order[1] && order[1] >= order[2] && order[2] > order[3] && order[3] > order[4] && order[4] > order[5],
      'surfaces and lines order (paper ≥ raised ≥ wash > rule > line > line-strong)');
  }
}
out.push(`\nFills that carry meaning by colour alone: ${COLOUR_ONLY.length ? COLOUR_ONLY.map(([f, b]) => `--${f} on --${b}`).join(', ') : 'none'}`);
console.log(out.join('\n'));
if (fails.length) { console.error(`\n${fails.length} theme rule(s) failed in ${CSS_PATH}`); process.exit(1); }
console.log('\nAll checks pass.');

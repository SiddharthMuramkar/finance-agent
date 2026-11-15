// scripts/check-theme-contrast.mjs
// Zero-dependency guard for the two colour themes, Light and Dark. Run: node scripts/check-theme-contrast.mjs [path/to/tokens.css] [colour-only.json]
// Exits 1 if any rule fails. Rules: ADR 0015 (docs/adr/0015-one-light-theme-colour-language.md), which amends
// Appendix A.3 of docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md, and the Band and key-number pairs of
// the valuation-first spec (spec 2026-11-12, decisions F1 and F5, Appendix C).
import { readFileSync } from 'node:fs';

const CSS_PATH = process.argv[2] ?? 'src/app/globals.css'; // <-- the file that defines the :root token blocks

// Fills need 3:1 against their surface only when colour ALONE carries the meaning (WCAG 2.2 SC 1.4.11; spec §4 rule 4,
// §6.2, Appendix A.3, issue #457). A fill that is decorative, or always paired with a text label or an icon, is exempt. Each
// [fill, surface] listed here is checked at 3:1 in both themes. The Widget accent fills (--mint, --coral, --sun, --violet)
// are not listed: every use is paired or decorative (the inventory in src/dev/accent-fill-uses.test.ts). The kit's chart
// series are listed: a series' mark is needed to read the chart and a legend does not exempt it, so each series token
// (CHART_SERIES in src/widgets/genui-theme.tsx; a test keeps the copies equal) is checked on each chart surface. A JSON
// array of pairs as the second argument checks that list instead (the tests use it).
const CHART_SERIES = ['ink-2', 'mint-ink', 'sun-ink', 'violet', 'coral-ink', 'line-strong'];
const CHART_SURFACES = ['paper', 'raised', 'wash', 'frame'];
const COLOUR_ONLY = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : CHART_SERIES.flatMap(f => CHART_SURFACES.map(b => [f, b]));

// The semantic tokens (ADR 0015), declared as a literal colour in both themes.
const SEMANTIC = ['paper', 'wash', 'raised', 'frame', 'ink', 'ink-2', 'muted', 'faint', 'rule', 'line', 'line-strong',
  'accent', 'accent-fill', 'ring', 'accent-hover', 'accent-pressed', 'accent-deep', 'on-accent', 'accent-tint', 'accent-tint-2', 'accent-line',
  'fill', 'on-fill', 'fill-hover', 'fill-active', 'dim', 'on-dim',
  'success', 'success-tint', 'warning', 'warning-tint', 'danger', 'danger-tint', 'danger-hover', 'on-danger', 'data'];
// The Widget accent families, unchanged since ADR 0015 and frozen in both themes.
const FAMILY = ['mint', 'mint-ink', 'mint-tint', 'mint-tag', 'coral', 'coral-ink', 'coral-tint', 'coral-tag', 'coral-fill', 'coral-deep',
  'sun', 'sun-ink', 'sun-tint', 'sun-tag', 'violet', 'violet-ink', 'violet-tint', 'violet-tag',
  'you', 'you-line', 'you-tint', 'you-tag', 'you-tag-ink', 'src', 'src-line', 'src-tint', 'src-tag', 'src-tag-ink'];
const TOKENS = [...SEMANTIC, ...FAMILY];

// Old names: declared once, in Light only, as var(--new); they resolve on <html>, so they follow the theme. Declaring any
// of them in Dark is a failure.
const OLD = { bg: 'paper', field: 'raised', bubble: 'wash', hairline: 'rule', border: 'line', edge: 'line-strong',
  brand: 'accent', 'brand-main': 'accent-fill', 'brand-hover': 'accent-hover', 'brand-pressed': 'accent-pressed', 'brand-deep': 'accent-deep',
  'brand-ink': 'on-accent', 'brand-tint': 'accent-tint', 'brand-soft': 'accent-tint', 'brand-line': 'accent-line' };
// Two new names that follow another the same way (spec F1, F5): --band is --royal, and --key-number (eyebrows, step
// numbers, a Widget's key number) is the Theme's --accent, so it is #1f3fae in Light and #6aa1ff in Dark. Declaring
// either in Dark would let it split from the name it follows, so that fails too.
const FOLLOWS = { band: 'royal', 'key-number': 'accent' };
// Theme-independent: declared once, in Light, as a literal colour, and never in Dark. --royal is the Band's blue; the
// rest is what sits on a Band (F1): white text, white at 72% for secondary text, white at 18% for a decorative rule, and
// the ink label of a white button.
const INVARIANT = { royal: '#1f3fae', 'on-band': '#ffffff', 'on-band-2': 'rgb(255 255 255 / 0.72)', 'band-rule': 'rgb(255 255 255 / 0.18)',
  'on-band-button-ink': '#0b0d12' };
// The one Band token that follows the Theme: a card on a Band is white in Light and the Theme's --frame in Dark (F1).
const BAND_CARD = { light: '#ffffff', dark: 'var(--frame)' };

// Light is frozen: its values are ADR 0015's and change only with a note there. Dark freezes the Widget families, and its
// accent #6aa1ff since spec F5 (Appendix C's Dark rows are measured on it).
const LIGHT_FROZEN = { paper: '#ffffff', wash: '#f6f7f9', raised: '#ffffff', frame: '#ffffff', ink: '#0b0d12', 'ink-2': '#30353f', muted: '#5f6571', faint: '#8b919b',
  rule: '#e2e5ea', line: '#c6cad2', 'line-strong': '#868c97',
  accent: '#1f3fae', 'accent-fill': '#1f3fae', ring: '#1f3fae', 'accent-hover': '#1a3596', 'accent-pressed': '#152b7a', 'accent-deep': '#152b7a', 'on-accent': '#ffffff',
  'accent-tint': '#eef2fc', 'accent-tint-2': '#e3e9fa', 'accent-line': '#a9b8ec',
  fill: '#1f3fae', 'on-fill': '#ffffff', 'fill-hover': '#1a3596', 'fill-active': '#152b7a', dim: '#e2e5ea', 'on-dim': '#8b919b',
  success: '#18794e', 'success-tint': '#edf7f1', warning: '#a15c07', 'warning-tint': '#fdf5e6', danger: '#b42318', 'danger-tint': '#fdf1ef', 'danger-hover': '#9a1d14', 'on-danger': '#ffffff', data: '#c6cad2',
  mint: '#12b886', 'mint-ink': '#0b7a5a', 'mint-tint': '#ddf7ec', 'mint-tag': '#d2f4e6', coral: '#ff6b57', 'coral-ink': '#bd2f1e', 'coral-tint': '#ffe6e1', 'coral-tag': '#ffddd6', 'coral-fill': '#bd2f1e', 'coral-deep': '#8f2012',
  sun: '#ffc233', 'sun-ink': '#8a5a00', 'sun-tint': '#fff1c9', 'sun-tag': '#ffe49a', violet: '#8b5cf6', 'violet-ink': '#6d3ad9', 'violet-tint': '#ebe2ff', 'violet-tag': '#e4d9ff',
  you: '#0b7a5a', 'you-line': '#12b886', 'you-tint': '#ddf7ec', 'you-tag': '#d2f4e6', 'you-tag-ink': '#0b7a5a',
  src: '#8a5a00', 'src-line': '#ffc233', 'src-tint': '#fff1c9', 'src-tag': '#ffe49a', 'src-tag-ink': '#8a5a00' };
const DARK_FROZEN = { accent: '#6aa1ff', mint: '#66cdaa', 'mint-ink': '#66cdaa', 'mint-tint': '#66cdaa14', 'mint-tag': '#1e3b3a', coral: '#f28b7d', 'coral-ink': '#f28b7d', 'coral-tint': '#f28b7d14', 'coral-tag': '#43262f', 'coral-fill': '#c04332', 'coral-deep': '#7e2a20',
  sun: '#e8be5c', 'sun-ink': '#e8be5c', 'sun-tint': '#e8be5c14', 'sun-tag': '#3f3727', violet: '#b09af2', 'violet-ink': '#b09af2', 'violet-tint': '#b09af214', 'violet-tag': '#33294f',
  you: '#66cdaa', 'you-line': '#66cdaa', 'you-tint': '#66cdaa14', 'you-tag': '#1e3b3a', 'you-tag-ink': '#66cdaa',
  src: '#e8be5c', 'src-line': '#e8be5c', 'src-tint': '#e8be5c14', 'src-tag': '#3f3727', 'src-tag-ink': '#e8be5c' };

const THEMES = [
  { id: 'light', kind: 'light', selector: ':root', frozen: LIGHT_FROZEN },
  { id: 'dark', kind: 'dark', selector: ':root.dark', frozen: DARK_FROZEN },
];

// ---------- parsing ----------
const norm = s => s.replace(/\s+/g, '').replace(/'/g, '"');
function block(css, selector) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (norm(m[1].split(';').pop()) === norm(selector) && /--paper\s*:/.test(m[2])) {
      const t = {};
      for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);?/g)) t[d[1]] = d[2].trim();
      return t;
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
  m = v.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i);
  if (m) {
    const L = m[2] ? +m[1] / 100 : +m[1];
    const a = m[5] === undefined ? 1 : (m[6] ? +m[5] / 100 : +m[5]);
    return { ...oklchToRgb(L, +m[3], +m[4]), a };
  }
  return null; // var(), color-mix() etc. are not resolved here: tokens must be literal colours
}
// A token's value with any var(--other) followed, the way the page resolves it on <html>: Dark's block over Light's.
function resolve(t, k, depth = 0) {
  const v = (t[k] ?? '').trim(), m = v.match(/^var\(\s*--([\w-]+)\s*\)$/);
  return m && depth < 8 ? resolve(t, m[1], depth + 1) : v;
}
const same = (a, b) => !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.002;
// ---------- colour maths (WCAG 2, APCA 0.0.98G-4g, OKLCH) ----------
const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const unlin = c => { c = Math.min(1, Math.max(0, c)); return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); };
function oklchToRgb(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return { r: unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), b: unlin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s) };
}
function oklch({ r, g, b }) {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, C: Math.hypot(1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s) };
}
const over = (fg, bg) => fg.a >= 1 ? fg : { r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)), g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)), b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)), a: 1 };
const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const wcag = (x, y) => { const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p); return (h + 0.05) / (l + 0.05); };
function apca(txt, bg) {
  const Y = ({ r, g, b }) => 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.0721750 * (b / 255) ** 2.4;
  let yt = Y(txt), yb = Y(bg);
  if (yt < 0.022) yt += (0.022 - yt) ** 1.414; if (yb < 0.022) yb += (0.022 - yb) ** 1.414;
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14; return s > -0.1 ? 0 : (s + 0.027) * 100;
}
// ---------- rules ----------
const ACCENTS = ['mint', 'coral', 'sun', 'violet'];
const TINTS = [...ACCENTS.map(a => `${a}-tint`), 'you-tint', 'src-tint'];
const TAGS = ACCENTS.map(a => `${a}-tag`);
const SURF = ['paper', 'wash', 'raised', 'frame'];
const STATUS_TINTS = ['success-tint', 'warning-tint', 'danger-tint'];
const ACCENT_TINTS = ['accent-tint', 'accent-tint-2'];
const TEXT = [ // [fg, bg, minimum WCAG ratio], ADR 0015 (amends Appendix A.3)
  ...[...SURF, ...ACCENT_TINTS, ...STATUS_TINTS, ...TINTS, ...TAGS].map(b => ['ink', b, 7]),
  ...SURF.map(b => ['ink-2', b, 7]),
  ...[...SURF, 'rule', ...ACCENT_TINTS, ...STATUS_TINTS, ...TINTS].map(b => ['muted', b, 4.5]),
  ['faint', 'paper', 3],
  ...[...SURF, ...ACCENT_TINTS].map(b => ['accent', b, 4.5]),
  ...['accent-fill', 'accent-hover', 'accent-pressed'].map(b => ['on-accent', b, 4.5]),
  ...['fill', 'fill-hover', 'fill-active'].map(b => ['on-fill', b, 4.5]),
  ...['danger', 'danger-hover'].map(b => ['on-danger', b, 4.5]),
  ...['success', 'warning', 'danger'].flatMap(k => ['paper', 'raised', `${k}-tint`].map(b => [k, b, 4.5])),
  ...ACCENTS.flatMap(a => ['paper', 'raised', `${a}-tint`, `${a}-tag`].map(b => [`${a}-ink`, b, 4.5])),
  ['you', 'paper', 4.5], ['src', 'paper', 4.5], ['you-tag-ink', 'you-tag', 4.5], ['src-tag-ink', 'src-tag', 4.5],
  // Not text, 3:1: a control's edge and the focus ring on every surface a control sits on, and the fills on the page.
  ...['line-strong', 'ring'].flatMap(f => ['paper', 'raised', 'wash'].map(b => [f, b, 3])),
  ['accent-fill', 'paper', 3], ['fill', 'paper', 3],
];
// Appendix C (spec F1, F5): the pairs on a Band, and the key-number colour on every surface it sits on. Each row is
// [fg, bg, minimum, Appendix C's ratio by theme, what the pair is for]. The minimum is 4.5 for text, 3 for a graphic, and 0
// for a decorative rule, which is listed but has no minimum. Where Appendix C gives a ratio for a theme, the pair must
// also be that ratio to two decimals, so neither blue (#1f3fae, #6aa1ff) can drift without the table changing with it.
// A translucent colour (white at 72% or 18%) is laid over its surface before it is measured. Mint and sunflower are each
// Theme's own (Appendix C's figures are Light's), since a mark on a Band takes var(--mint) or var(--sun) like any other.
const BAND_PAIRS = [
  ['on-band', 'band', 4.5, { light: 8.82, dark: 8.82 }, 'text, a button\'s outline and the focus ring on a Band'],
  ['on-band-2', 'band', 4.5, { light: 5.36, dark: 5.36 }, 'secondary text on a Band'],
  ['on-band-button-ink', 'on-band', 4.5, { light: 19.43, dark: 19.43 }, 'the label of a white button on a Band'],
  ['sun', 'band', 4.5, { light: 5.47 }, 'a history mark on a Band, if one is needed'],
  ['mint', 'band', 3, { light: 3.46 }, 'graphics only on a Band, never text'],
  ['band-rule', 'band', 0, { light: 1.58, dark: 1.58 }, 'a decorative rule on a Band, which carries no meaning'],
  ['key-number', 'paper', 4.5, { light: 8.82, dark: 7.64 }, 'eyebrows, key numbers, sliders and links'],
  ['key-number', 'wash', 4.5, { light: 8.23 }, 'the same, on a washed surface'],
  ['key-number', 'raised', 4.5, { light: 8.82, dark: 6.55 }, 'the same, on a raised surface'],
  ['key-number', 'frame', 4.5, { light: 8.82, dark: 7.44 }, 'the same, inside a Widget'],
  ['key-number', 'accent-tint', 4.5, { light: 7.87, dark: 6.74 }, 'the same, on a selected row'],
  ['ink', 'band-card', 7, { light: 19.43 }, 'text on a card on a Band'],
  ['key-number', 'band-card', 4.5, { light: 8.82, dark: 7.44 }, 'a key number on a card on a Band'],
];
const css = readFileSync(CSS_PATH, 'utf8');
const LIGHT_RAW = block(css, ':root') ?? {};
const fails = [];
const out = [];
const check = (ok, msg) => { out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

for (const th of THEMES) {
  out.push(`\n[${th.id}] ${th.selector}`);
  const raw = block(css, th.selector);
  if (!raw) { check(false, `${th.id}: no "${th.selector} { --paper: … }" block in ${CSS_PATH}`); continue; }
  if (th.kind === 'light') { // the old names follow their new names, declared here once, as are the theme-independent colours
    for (const [old, now] of Object.entries({ ...OLD, ...FOLLOWS })) check(norm(raw[old] ?? '') === norm(`var(--${now})`), `${th.id}: --${old} follows --${now}`);
    for (const [k, v] of Object.entries(INVARIANT)) check(same(parseColor(raw[k]), parseColor(v)), `${th.id}: --${k} is unchanged (${v})`);
  } else { // and never again in Dark
    for (const k of [...Object.keys(OLD), ...Object.keys(INVARIANT)]) if (k in raw) check(false, `${th.id}: --${k} is an old or theme-independent name: declare it once in Light`);
    for (const [k, now] of Object.entries(FOLLOWS)) if (k in raw) check(false, `${th.id}: --${k} follows --${now} from Light: declare it there only`);
  }
  check(norm(raw['band-card'] ?? '').toLowerCase() === norm(BAND_CARD[th.kind]), `${th.id}: --band-card is ${BAND_CARD[th.kind]} (a card on a Band)`);
  const C = {};
  for (const k of TOKENS) { C[k] = parseColor(raw[k]); if (!C[k]) check(false, `${th.id}: --${k} is missing or not a literal colour ("${raw[k]}")`); }
  if (TOKENS.some(k => !C[k])) continue;
  const bg = C.paper, S = k => over(C[k], bg);
  for (const [k, v] of Object.entries(th.frozen)) { const a = C[k], b = parseColor(v); check(a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.002, `${th.id}: --${k} is unchanged (${v})`); }
  for (const [f, b, min] of TEXT) { const r = wcag(S(f), S(b)); check(r >= min, `${th.id}: --${f} on --${b} ${r.toFixed(2)}:1 (min ${min})`); }
  for (const [f, b] of COLOUR_ONLY) {
    if (!TOKENS.includes(f) || !TOKENS.includes(b)) { check(false, `${th.id}: colour-only pair [${f}, ${b}] names a fill token and a surface token`); continue; }
    const r = wcag(S(f), S(b)); check(r >= 3, `${th.id}: --${f} on --${b} ${r.toFixed(2)}:1 (min 3, colour alone carries the meaning)`);
  }
  const all = th.kind === 'light' ? raw : { ...LIGHT_RAW, ...raw }, B = k => parseColor(resolve(all, k));
  for (const [f, b, min, ratios, use] of BAND_PAIRS) {
    const missing = [f, b].filter(k => !B(k));
    if (missing.length) { for (const k of missing) check(false, `${th.id}: --${k} is missing or not a colour ("${resolve(all, k)}"), for --${f} on --${b}`); continue; }
    const under = over(B(b), bg), r = wcag(over(B(f), under), under), want = ratios[th.id];
    const ok = r >= min && (want === undefined || Math.abs(r - want) < 0.01);
    check(ok, `${th.id}: --${f} on --${b} ${r.toFixed(2)}:1 (${min ? `min ${min}` : 'decorative, no minimum'}${want === undefined ? '' : `, Appendix C ${want}`}): ${use}`);
  }
  const L = k => oklch(S(k)).L;
  // --accent-deep (= --brand-deep) is frozen but no longer drawn: Widget controls are flat (ADR 0015). It keeps its old
  // promise, darker than the primary's face, so the frozen value stays coherent.
  check(L('accent-deep') < L('accent-fill'), `${th.id}: --accent-deep is darker than --accent-fill`);
  if (th.kind === 'dark') {
    const r = wcag(S('ink'), bg), lc = Math.abs(apca(S('ink'), bg));
    check(r >= 15 && r <= 19.5, `${th.id}: body text --ink on --paper ${r.toFixed(2)}:1 is between 15 and 19.5`);
    check(lc >= 75, `${th.id}: body text APCA Lc ${lc.toFixed(1)} (min 75)`);
    check(L('paper') >= 0.12 && L('paper') <= 0.2, `${th.id}: --paper OKLCH lightness ${L('paper').toFixed(3)} is within 0.12–0.20 (near-black, never pure black)`);
    const RISE = ['paper', 'frame', 'wash', 'raised', 'rule', 'line', 'line-strong'];
    check(RISE.every((k, i) => i === 0 || L(RISE[i - 1]) < L(k)), `${th.id}: surfaces and lines get lighter as they rise (${RISE.join(' < ')})`);
    for (const k of [...RISE, 'ink', 'ink-2', 'muted', 'faint']) { const c = oklch(S(k)).C; check(c <= 0.01, `${th.id}: --${k} chroma ${c.toFixed(3)} (max 0.010, neutral greys, no navy)`); }
    for (const k of ['you', 'you-line', 'src', 'src-line', ...ACCENTS, ...ACCENTS.map(a => `${a}-ink`)]) { const c = oklch(S(k)).C; check(c <= 0.135, `${th.id}: --${k} chroma ${c.toFixed(3)} (max 0.135, no neon)`); }
    for (const k of ['accent', 'accent-fill', 'accent-hover', 'success', 'warning', 'danger']) { const c = oklch(S(k)).C; check(c <= 0.17, `${th.id}: --${k} chroma ${c.toFixed(3)} (max 0.17)`); }
    for (const k of TINTS) check(C[k].a <= 0.1, `${th.id}: --${k} alpha ${C[k].a.toFixed(2)} (max 0.10)`);
  } else {
    check(L('paper') >= L('raised') && L('raised') >= L('wash') && L('wash') > L('rule') && L('rule') > L('line') && L('line') > L('line-strong'),
      `${th.id}: light surfaces and lines order (paper ≥ raised ≥ wash > rule > line > line-strong)`);
  }
}
out.push(`\nFills that carry meaning by colour alone: ${COLOUR_ONLY.length ? COLOUR_ONLY.map(([f, b]) => `--${f} on --${b}`).join(', ') : 'none (each use is paired with a text label or an icon, so fills are not checked; Appendix A.3)'}`);
console.log(out.join('\n'));
if (fails.length) { console.error(`\n${fails.length} theme rule(s) failed in ${CSS_PATH}`); process.exit(1); }
console.log(`\nAll themes pass.`);

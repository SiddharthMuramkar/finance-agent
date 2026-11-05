// scripts/check-theme-contrast.mjs
// Zero-dependency guard for the two colour themes, Light and Dark. Run: node scripts/check-theme-contrast.mjs [path/to/tokens.css]
// Exits 1 if any rule fails. Rules: docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md, Appendix A.3.
import { readFileSync } from 'node:fs';

const CSS_PATH = process.argv[2] ?? 'src/app/globals.css'; // <-- the file that defines the :root token blocks

const TOKENS = ['bg', 'field', 'bubble', 'hairline', 'border', 'edge', 'data', 'muted', 'ink',
  'brand-main', 'brand', 'brand-hover', 'brand-pressed', 'brand-deep', 'ring', 'brand-ink', 'brand-tint', 'brand-soft', 'brand-line',
  'mint', 'mint-ink', 'mint-tint', 'mint-tag', 'coral', 'coral-ink', 'coral-tint', 'coral-tag', 'coral-fill', 'coral-deep',
  'sun', 'sun-ink', 'sun-tint', 'sun-tag', 'violet', 'violet-ink', 'violet-tint', 'violet-tag',
  'you', 'you-line', 'you-tint', 'you-tag', 'you-tag-ink', 'src', 'src-line', 'src-tint', 'src-tag', 'src-tag-ink', 'danger'];

// Light is frozen: its values are Appendix A.1's and change only with a note in ADR 0012.
const LIGHT_FROZEN = { bg: '#f6f8ff', field: '#ffffff', bubble: '#e6ecff', hairline: '#e4e9f7', border: '#c5cee6', edge: '#6677a3', data: '#c5cee6', muted: '#44527a', ink: '#121a33',
  'brand-main': '#2f5bea', brand: '#2449c4', 'brand-hover': '#2a52d6', 'brand-pressed': '#2347be', 'brand-deep': '#1e3a8a', ring: '#2f5bea', 'brand-ink': '#ffffff', 'brand-tint': '#dce6ff', 'brand-soft': '#dce6ff', 'brand-line': '#afc3f7',
  mint: '#12b886', 'mint-ink': '#0b7a5a', 'mint-tint': '#ddf7ec', 'mint-tag': '#d2f4e6', coral: '#ff6b57', 'coral-ink': '#bd2f1e', 'coral-tint': '#ffe6e1', 'coral-tag': '#ffddd6', 'coral-fill': '#bd2f1e', 'coral-deep': '#8f2012',
  sun: '#ffc233', 'sun-ink': '#8a5a00', 'sun-tint': '#fff1c9', 'sun-tag': '#ffe49a', violet: '#8b5cf6', 'violet-ink': '#6d3ad9', 'violet-tint': '#ebe2ff', 'violet-tag': '#e4d9ff',
  you: '#0b7a5a', 'you-line': '#12b886', 'you-tint': '#ddf7ec', 'you-tag': '#d2f4e6', 'you-tag-ink': '#0b7a5a',
  src: '#8a5a00', 'src-line': '#ffc233', 'src-tint': '#fff1c9', 'src-tag': '#ffe49a', 'src-tag-ink': '#8a5a00', danger: '#bd2f1e' };

const THEMES = [
  { id: 'light', kind: 'light', selector: ':root', frozen: LIGHT_FROZEN },
  { id: 'dark', kind: 'dark', selector: ':root.dark' },
];

// ---------- parsing ----------
const norm = s => s.replace(/\s+/g, '').replace(/'/g, '"');
function block(css, selector) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (norm(m[1].split(';').pop()) === norm(selector) && /--bg\s*:/.test(m[2])) {
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
  m = v.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i);
  if (m) {
    const L = m[2] ? +m[1] / 100 : +m[1];
    const a = m[5] === undefined ? 1 : (m[6] ? +m[5] / 100 : +m[5]);
    return { ...oklchToRgb(L, +m[3], +m[4]), a };
  }
  return null; // var(), color-mix() etc. are not resolved here: tokens must be literal colours
}
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
const TEXT = [ // [fg, bg, minimum WCAG ratio], Appendix A.3
  ...['bg', 'field', 'bubble', 'brand-tint', ...TINTS, ...TAGS].map(b => ['ink', b, 7]),
  ...['bg', 'field', 'hairline', 'bubble', 'brand-tint', ...TINTS].map(b => ['muted', b, 4.5]),
  ['brand', 'bg', 4.5], ['brand', 'field', 4.5], ['brand', 'brand-tint', 4.5],
  ...['brand-main', 'brand-hover', 'brand-pressed', 'coral-fill'].map(b => ['brand-ink', b, 4.5]),
  ...ACCENTS.flatMap(a => ['bg', 'field', `${a}-tint`, `${a}-tag`].map(b => [`${a}-ink`, b, 4.5])),
  ['you', 'bg', 4.5], ['src', 'bg', 4.5], ['danger', 'bg', 4.5], ['you-tag-ink', 'you-tag', 4.5], ['src-tag-ink', 'src-tag', 4.5],
  ['edge', 'bg', 3], ['edge', 'field', 3], ['ring', 'bg', 3], ['ring', 'field', 3], ['brand-main', 'bg', 3], ['coral-fill', 'bg', 3],
];
const css = readFileSync(CSS_PATH, 'utf8');
const fails = [];
const out = [];
const check = (ok, msg) => { out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

for (const th of THEMES) {
  out.push(`\n[${th.id}] ${th.selector}`);
  const raw = block(css, th.selector);
  if (!raw) { check(false, `${th.id}: no "${th.selector} { --bg: … }" block in ${CSS_PATH}`); continue; }
  const C = {};
  for (const k of TOKENS) { C[k] = parseColor(raw[k]); if (!C[k]) check(false, `${th.id}: --${k} is missing or not a literal colour ("${raw[k]}")`); }
  if (TOKENS.some(k => !C[k])) continue;
  const bg = C.bg, S = k => over(C[k], bg);
  if (th.frozen) { // Light must stay exactly as it is today
    for (const [k, v] of Object.entries(th.frozen)) { const a = S(k), b = parseColor(v); check(a.r === b.r && a.g === b.g && a.b === b.b, `${th.id}: --${k} is unchanged (${v})`); }
  }
  for (const [f, b, min] of TEXT) { const r = wcag(S(f), S(b)); check(r >= min, `${th.id}: --${f} on --${b} ${r.toFixed(2)}:1 (min ${min})`); }
  const L = k => oklch(S(k)).L;
  if (th.kind === 'dark') {
    const r = wcag(S('ink'), bg), lc = Math.abs(apca(S('ink'), bg));
    check(r >= 9 && r <= 15, `${th.id}: body text --ink on --bg ${r.toFixed(2)}:1 is between 9 and 15 (readable, no glare)`);
    check(lc >= 75, `${th.id}: body text APCA Lc ${lc.toFixed(1)} (min 75)`);
    check(L('bg') >= 0.2 && L('bg') <= 0.34, `${th.id}: --bg OKLCH lightness ${L('bg').toFixed(3)} is within 0.20–0.34 (never near-black)`);
    check(L('bg') < L('field') && L('field') < L('hairline') && L('hairline') < L('border'), `${th.id}: surfaces get lighter as they rise (bg < field < hairline < border)`);
    for (const k of ['brand', 'you', 'you-line', 'src', 'src-line', 'danger', ...ACCENTS, ...ACCENTS.map(a => `${a}-ink`)]) { const c = oklch(S(k)).C; check(c <= 0.135, `${th.id}: --${k} chroma ${c.toFixed(3)} (max 0.135, no neon)`); }
    { const c = oklch(S('brand-main')).C; check(c <= 0.2, `${th.id}: --brand-main chroma ${c.toFixed(3)} (a button fill, max 0.20)`); }
    for (const k of TINTS) check(C[k].a <= 0.1, `${th.id}: --${k} alpha ${C[k].a.toFixed(2)} (max 0.10)`);
  } else {
    check(L('field') >= L('bg') && L('bg') > L('hairline') && L('hairline') > L('border'), `${th.id}: light surfaces order (field ≥ bg > hairline > border)`);
  }
}
console.log(out.join('\n'));
if (fails.length) { console.error(`\n${fails.length} theme rule(s) failed in ${CSS_PATH}`); process.exit(1); }
console.log(`\nAll themes pass.`);

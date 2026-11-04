// scripts/check-theme-contrast.mjs
// Zero-dependency guard for the four colour themes. Run: node scripts/check-theme-contrast.mjs [path/to/tokens.css]
// Exits 1 if any rule fails. Rules come from docs/specs/2026-11-04-themes-and-topic-bar.md (T-01).
import { readFileSync } from 'node:fs';

const CSS_PATH = process.argv[2] ?? 'src/app/globals.css'; // <-- the file that defines the :root token blocks

const TOKENS = ['bg', 'field', 'bubble', 'hairline', 'border', 'data', 'muted', 'ink', 'brand', 'brand-hover', 'brand-pressed', 'ring', 'brand-ink', 'brand-tint', 'brand-line',
  'you', 'you-line', 'you-tint', 'you-tag', 'you-tag-ink', 'src', 'src-line', 'src-tint', 'src-tag', 'src-tag-ink', 'danger'];

// Light is frozen: its values must not change.
const LIGHT_FROZEN = { bg: '#fafaf9', field: '#ffffff', bubble: '#e7e5e4', hairline: '#e7e5e4', border: '#d6d3d1', data: '#d6d3d1', muted: '#79716b', ink: '#1c1917',
  brand: '#002366', 'brand-hover': '#001e57', 'brand-pressed': '#00184a', ring: '#002366', 'brand-ink': '#ffffff', 'brand-tint': '#f0f5ff', 'brand-line': '#c2cde2',
  you: '#00786f', 'you-line': '#009689', 'you-tint': '#f5fcf9', 'you-tag': '#cbfbf1', 'you-tag-ink': '#0b4f4a',
  src: '#e17100', 'src-line': '#fe9a00', 'src-tint': '#fdfbf2', 'src-tag': '#fef3c6', 'src-tag-ink': '#7b3306', danger: '#c10007' };

const THEMES = [
  { id: 'light', kind: 'light', selector: ':root', frozen: LIGHT_FROZEN },
  { id: 'paper', kind: 'light', selector: ':root[data-theme="paper"]' },
  { id: 'midnight', kind: 'dark', selector: ':root.dark' },
  { id: 'forest', kind: 'dark', selector: ':root.dark[data-theme="forest"]' },
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
const TEXT = [ // [fg, bg, minimum WCAG ratio]
  ['ink', 'bg', 7], ['ink', 'field', 7], ['ink', 'bubble', 7], ['ink', 'src-tint', 7], ['ink', 'you-tint', 7],
  ['muted', 'bg', 4.5], ['muted', 'field', 4.5], ['muted', 'hairline', 4.5], ['muted', 'src-tint', 4.5], ['muted', 'you-tint', 4.5],
  ['brand', 'bg', 4.5], ['brand', 'field', 4.5], ['brand', 'brand-tint', 4.5], ['brand-ink', 'brand', 4.5],
  ['you', 'bg', 4.5], ['src', 'bg', 4.5], ['danger', 'bg', 4.5], ['you-tag-ink', 'you-tag', 4.5], ['src-tag-ink', 'src-tag', 4.5],
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
    continue;
  }
  for (const [f, b, min] of TEXT) { const r = wcag(S(f), S(b)); check(r >= min, `${th.id}: --${f} on --${b} ${r.toFixed(2)}:1 (min ${min})`); }
  { const r = wcag(S('ring'), bg); check(r >= 3, `${th.id}: --ring vs --bg ${r.toFixed(2)}:1 (min 3, focus must be visible)`); }
  const L = k => oklch(S(k)).L;
  if (th.kind === 'dark') {
    const r = wcag(S('ink'), bg), lc = Math.abs(apca(S('ink'), bg));
    check(r >= 9 && r <= 15, `${th.id}: body text --ink on --bg ${r.toFixed(2)}:1 is between 9 and 15 (readable, no glare)`);
    check(lc >= 75, `${th.id}: body text APCA Lc ${lc.toFixed(1)} (min 75)`);
    check(L('bg') >= 0.2 && L('bg') <= 0.34, `${th.id}: --bg OKLCH lightness ${L('bg').toFixed(3)} is within 0.20–0.34 (never near-black)`);
    check(L('bg') < L('field') && L('field') < L('hairline') && L('hairline') < L('border'), `${th.id}: surfaces get lighter as they rise (bg < field < hairline < border)`);
    for (const k of ['brand', 'you', 'you-line', 'src', 'src-line', 'danger']) { const c = oklch(S(k)).C; check(c <= 0.135, `${th.id}: --${k} chroma ${c.toFixed(3)} (max 0.135, no neon)`); }
    for (const k of ['you-tint', 'src-tint']) check(C[k].a <= 0.1, `${th.id}: --${k} alpha ${C[k].a.toFixed(2)} (max 0.10)`);
  } else {
    check(L('field') >= L('bg') && L('bg') > L('hairline') && L('hairline') > L('border'), `${th.id}: light surfaces order (field ≥ bg > hairline > border)`);
  }
}
console.log(out.join('\n'));
if (fails.length) { console.error(`\n${fails.length} theme rule(s) failed in ${CSS_PATH}`); process.exit(1); }
console.log(`\nAll themes pass.`);

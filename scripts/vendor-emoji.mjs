// Vendors the Fluent Emoji 3D subset (spec 2026-11-05, ticket E1). A dev tool: run by hand, never in the build.
//   node scripts/vendor-emoji.mjs
// Reads src/emoji/subset.json ([{ name, folder }]), fetches each emoji's 3D PNG and metadata.json from
// github.com/microsoft/fluentui-emoji at ONE pinned commit, converts the PNG to a 160 x 160 WebP with cwebp (ffmpeg as the
// fallback; no npm image dependency) and writes:
//   public/emoji/<unicode>.webp        the pictures (people use the Default tone only)
//   public/emoji/LICENSE-fluent-emoji.txt   the upstream MIT text
//   public/emoji/SOURCES.md            name, unicode, upstream path and the commit, per file
//   src/emoji/registry-data.ts         the generated data behind src/emoji/registry.ts
// It fails on a folder that is missing upstream. Commit the output.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The pinned upstream commit (microsoft/fluentui-emoji, main on 5 Nov 2026). Change it only to re-vendor on purpose. */
const SHA = "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc";
const REPO = "microsoft/fluentui-emoji";
const RAW = `https://raw.githubusercontent.com/${REPO}/${SHA}`;
const OUT = "public/emoji";
const SIZE = 160;

/** Plain alt text where Fluent's own name runs past four words. */
const ALT_OVERRIDE = { "chart-increasing-with-yen": "rising yen chart" };

const subset = JSON.parse(readFileSync("src/emoji/subset.json", "utf8"));
const enc = (path) => path.split("/").map(encodeURIComponent).join("/");
const get = async (url) => {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 404) throw new Error(`404 ${url}`);
  }
  throw new Error(`could not fetch ${url}`);
};

const treeRes = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${SHA}?recursive=1`, { headers: { "user-agent": "vendor-emoji" } });
if (!treeRes.ok) throw new Error(`tree request failed: ${treeRes.status}`);
const tree = await treeRes.json();
if (tree.truncated) throw new Error("upstream tree was truncated");
const paths = tree.tree.filter((e) => e.type === "blob").map((e) => e.path);

const converters = [
  ["cwebp", (src, dst) => ["-quiet", "-q", "80", "-alpha_q", "100", "-resize", String(SIZE), String(SIZE), src, "-o", dst]],
  ["ffmpeg", (src, dst) => ["-y", "-loglevel", "error", "-i", src, "-vf", `scale=${SIZE}:${SIZE}`, "-q:v", "80", dst]],
];
function convert(src, dst) {
  for (const [bin, args] of converters) {
    try {
      execFileSync(bin, args(src, dst), { stdio: "pipe" });
      return;
    } catch (e) {
      if (bin === converters.at(-1)[0]) throw new Error(`could not convert ${src}: ${e.message}`);
    }
  }
}

mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "vendor-emoji-"));
const rows = [];
try {
  for (const { name, folder } of subset) {
    const base = `assets/${folder}`;
    const toned = paths.some((p) => p.startsWith(`${base}/Default/3D/`));
    const dir = toned ? `${base}/Default` : base;
    const png = paths.find((p) => p.startsWith(`${dir}/3D/`) && p.endsWith(".png"));
    if (!png || !paths.includes(`${base}/metadata.json`)) throw new Error(`${name}: no 3D folder "${folder}" upstream at ${SHA}`);
    const meta = JSON.parse((await get(`${RAW}/${enc(`${base}/metadata.json`)}`)).toString("utf8"));
    const unicode = String(meta.unicode).trim().toLowerCase().split(/\s+/).join("-");
    const src = join(work, `${name}.png`);
    writeFileSync(src, await get(`${RAW}/${enc(png)}`));
    const file = `${unicode}.webp`;
    convert(src, join(OUT, file));
    const alt = ALT_OVERRIDE[name] ?? String(meta.cldr ?? meta.tts ?? name.replaceAll("-", " ")).toLowerCase();
    const words = name.split("-");
    const keywords = [...new Set([...words, ...(meta.keywords ?? []).map((k) => String(k).toLowerCase()), ...alt.split(/\s+/)])].filter((k) => k.length > 1);
    rows.push({ name, unicode, file, alt, keywords, upstream: png, bytes: statSync(join(OUT, file)).size });
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const seen = new Map();
for (const r of rows) {
  if (seen.has(r.file)) throw new Error(`${r.name} and ${seen.get(r.file)} share ${r.file}`);
  seen.set(r.file, r.name);
}

writeFileSync(join(OUT, "LICENSE-fluent-emoji.txt"), (await get(`${RAW}/LICENSE`)).toString("utf8").replace(/\r\n/g, "\n"));

const sources = [
  "# Emoji sources",
  "",
  `Fluent Emoji 3D by Microsoft (MIT, see LICENSE-fluent-emoji.txt), https://github.com/${REPO}, pinned at commit \`${SHA}\`.`,
  `Each picture is the upstream 3D PNG converted to a ${SIZE} x ${SIZE} WebP by \`scripts/vendor-emoji.mjs\` (people: Default tone only).`,
  "",
  "| Name | Unicode | File | Upstream path | Bytes |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.name} | ${r.unicode.replaceAll("-", " ")} | ${r.file} | ${r.upstream} | ${r.bytes} |`),
  "",
].join("\n");
writeFileSync(join(OUT, "SOURCES.md"), sources);

const q = (s) => JSON.stringify(s);
const data = [
  "// GENERATED by scripts/vendor-emoji.mjs from src/emoji/subset.json. Do not edit by hand; re-run the script.",
  `// Fluent Emoji 3D by Microsoft, MIT License, pinned at ${SHA}.`,
  "",
  "export const EMOJI_DATA = {",
  ...rows.map((r) => `  ${q(r.name)}: { unicode: ${q(r.unicode)}, file: ${q(r.file)}, alt: ${q(r.alt)}, keywords: [${r.keywords.map(q).join(", ")}] },`),
  "} as const;",
  "",
].join("\n");
writeFileSync("src/emoji/registry-data.ts", data);
const total = rows.reduce((n, r) => n + r.bytes, 0);
console.log(`Vendored ${rows.length} emoji, ${total} bytes, from ${SHA}.`);

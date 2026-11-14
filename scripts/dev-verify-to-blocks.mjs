// One-off helper (kept for the record of how the Case valuation blocks were written): reads the verified research in
// docs/research/verify-*.json and prints, for each Case with a valuation, the `valuation:` block in the Topic file's
// shape, with what the engine gives against the published value. `--write` inserts the blocks into the Topic files.
// Run: node scripts/dev-verify-to-blocks.mjs [--write]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { Document, isScalar, isSeq, visit } from "yaml";
import { valuationBlock, valueCase, matchesPublished } from "../src/finance/valuation-case.ts";

const NOTE_KEYS = ["marginNote", "marginRule", "salesToCapitalNote", "taxNote", "costOfCapitalNote", "cashNote", "debtNote", "optionsNote", "sharesNote", "baseRevenueNote"];

function toBlock(v, illustration) {
  const sales = Array.isArray(v.salesToCapital) ? v.salesToCapital : null;
  const perCompany = v.per === "company";
  const margin = v.marginPercent ? { marginPercent: v.marginPercent, afterPercent: v.afterPercent } : { ...v.margin };
  const failure = v.failure
    ? {
        chancePercent: v.failure.chancePercent,
        recovered: v.failure.recovered ?? 0,
        ...(v.failure.recoveredPercentOfValue !== undefined ? { recoveredPercentOfValue: v.failure.recoveredPercentOfValue } : {}),
      }
    : undefined;
  const pub = v.published ?? {};
  const published = {
    ...(illustration ? {} : { valuePerShare: perCompany ? pub.equityValue : pub.valuePerShare }),
    ...(Array.isArray(pub.fcff) && pub.fcff.length === 10 ? { fcff: pub.fcff } : {}),
    ...(pub.note ? { note: pub.note } : {}),
  };
  const notes = NOTE_KEYS.filter((k) => typeof v[k] === "string").map((k) => v[k]);
  if (v.failure?.note) notes.push(v.failure.note);
  if (v.failure?.recoveredNote) notes.push(v.failure.recoveredNote);
  const block = {
    currency: v.currency,
    unit: v.unit,
    baseRevenue: v.baseRevenue,
    growthPercent: v.growthPercent,
    margin,
    taxPercent: v.taxPercent,
    ...(v.taxPercentByYear ? { taxPercentByYear: v.taxPercentByYear } : {}),
    lossesCarried: v.lossesCarried ?? 0,
    salesToCapital: sales ? sales[0] : v.salesToCapital,
    ...(sales && sales.some((s) => s !== sales[0]) ? { salesToCapitalByYear: sales } : {}),
    costOfCapitalPercent: v.costOfCapitalPercent,
    growthAfterPercent: v.growthAfterPercent,
    returnOnCapitalAfterPercent: v.returnOnCapitalAfterPercent,
    cash: v.cash,
    debt: v.debt,
    options: v.options ?? 0,
    shares: perCompany ? 1 : v.shares,
    per: v.per ?? "share",
    ...(failure && failure.chancePercent > 0 ? { failure } : failure && failure.recovered > 0 ? { failure } : {}),
    price: {
      value: v.price.value,
      date: v.price.date,
      ...(v.price.note ? { note: v.price.note } : {}),
      ...(v.price.placeholder ? { placeholder: true } : {}),
    },
    ...(illustration ? { illustration: true } : {}),
    published,
    ...(notes.length ? { notes } : {}),
    sources: v.sources.map((s) => ({ title: s.title, url: s.url })),
    reproduces: false,
  };
  const parsed = valuationBlock.parse(block);
  block.reproduces = matchesPublished(parsed);
  return block;
}

const dir = "docs/research";
const out = [];
for (const f of readdirSync(dir).filter((x) => x.startsWith("verify-")).sort()) {
  const data = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  for (const c of data.cases) {
    const v = c.valuation ?? {};
    if (!v.baseRevenue) continue;
    const block = toBlock(v, c.illustration === true || v.illustration === true);
    const valued = valueCase(valuationBlock.parse(block));
    out.push({ caseId: c.caseId, topicFile: c.topicFile, block, value: valued.ok ? valued.valuePerShare : valued.error });
  }
}
for (const o of out) console.log(o.caseId.padEnd(34), String(o.value).slice(0, 12).padEnd(13), "published", o.block.published.valuePerShare ?? "-", "reproduces", o.block.reproduces, o.block.illustration ? "(illustration)" : "");
if (process.argv.includes("--json")) console.log(JSON.stringify(out.map((o) => ({ caseId: o.caseId, topicFile: o.topicFile, block: o.block }))));

// Cases whose block is the same valuation as another Case's borrow it by id, so its figures are written once (spec C2).
const BORROWS = {
  "amazon-cost-of-equity-2000": "amazon-dcf-2000",
  "wework-iwg-multiples-2019": "wework-leases-2019",
  "wework-s1-2019": "wework-leases-2019",
  "webvan-1999-analyse": "webvan-centre-npv-2000",
};
// Written by hand: Amazon's block already exists in val-dcf, and Zomato's Case is new.
const BY_HAND = new Set(["amazon-dcf-2000", "zomato-ipo-2021"]);

if (process.argv.includes("--write")) {
  for (const o of out.filter((x) => !BY_HAND.has(x.caseId))) {
    const path = o.topicFile;
    const lines = readFileSync(path, "utf8").split("\n");
    const start = lines.findIndex((l) => l === `  - id: ${o.caseId}`);
    if (start < 0) { console.error(`no Case ${o.caseId} in ${path}`); continue; }
    let end = start + 1;
    while (end < lines.length && !/^  - id: /.test(lines[end]) && !/^\S/.test(lines[end])) end++;
    while (end > start + 1 && lines[end - 1].trim() === "") end--;
    const existing = lines.slice(start, end).findIndex((l) => /^    valuation:/.test(l));
    if (existing >= 0) { console.error(`Case ${o.caseId} already has a valuation block; left as is`); continue; }
    if (BORROWS[o.caseId]) {
      lines.splice(end, 0, `    # The same valuation as Case ${BORROWS[o.caseId]}, whose block holds the figures and their sources (spec C2).`, `    valuationFrom: ${BORROWS[o.caseId]}`);
    } else {
      const doc = new Document({ valuation: o.block });
      // Number paths on one line, as the Amazon block in val-dcf writes them.
      visit(doc, { Seq: (_, node) => { if (isSeq(node) && node.items.every((i) => isScalar(i) && typeof i.value === "number")) node.flow = true; } });
      const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd().split("\n").map((l) => `    ${l}`);
      lines.splice(end, 0, "    # Valuation inputs from docs/research/verify-*.json (spec B1, C2); npm run course:doc copies them into the registry.", ...yaml);
    }
    writeFileSync(path, lines.join("\n"));
    console.error(`wrote ${o.caseId} into ${path}`);
  }
}

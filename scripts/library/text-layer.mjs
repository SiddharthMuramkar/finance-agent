// Checks PDF text layers for the Python extractors (scripts/library/sources.py), with the same tests
// the load uses (src/library/prepare.ts). Reads JSON on stdin:
//   { "reference": [documents with clean text], "docs": [PDF documents to check] }
// and prints { "<ref>": [reasons] } for each checked document; an empty list means it may be loaded.
// The vocabulary for the joined-word check comes from the reference documents only.
import { readFileSync } from "node:fs";
import { cleanText, textLayerReasons, wordsOf } from "../../src/library/prepare.ts";

const { reference, docs } = JSON.parse(readFileSync(0, "utf8"));
const vocabulary = wordsOf(reference.flatMap((d) => d.sections.flatMap((s) => s.paragraphs.map(cleanText))).join(" "));
process.stdout.write(JSON.stringify(Object.fromEntries(docs.map((d) => [d.ref, textLayerReasons(d, vocabulary)]))));

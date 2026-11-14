// Embeds Library passages that have no embedding yet with Voyage (voyage-4, 1024 dimensions), from
// the laptop. Run:  npm run library:embed
// Needs VOYAGE_API_KEY in .env; without it, Library search stays keyword-only and says so. Voyage's
// first 200M tokens are free; the OpenStax finance book is about 0.26M tokens. Safe to re-run: it
// only embeds what is missing (a reload empties the embedding of a passage whose text changed).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { passagesToEmbed, saveEmbeddings } from "../src/library/ingest.ts";
import { VOYAGE_MODEL, voyageEmbed } from "../src/library/voyage.ts";

const apiKey = process.env.VOYAGE_API_KEY;
if (!apiKey) {
  console.error("VOYAGE_API_KEY is not set in .env, so nothing was embedded. Search keeps working on keywords alone.");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const db = drizzle({ client: neon(url) });
const BATCH = 64;
let done = 0;
let tokens = 0;
for (;;) {
  const todo = await passagesToEmbed(db, BATCH);
  if (!todo.length) break;
  let result;
  for (let attempt = 0; ; attempt++) {
    try {
      result = await voyageEmbed({ apiKey }, todo.map((p) => `${p.heading}\n\n${p.text}`), "document");
      break;
    } catch (error) {
      if (attempt >= 5) throw error;
      const wait = 2 ** attempt * 2000;
      console.log(`${error.message.slice(0, 80)}; retrying in ${wait / 1000} s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  await saveEmbeddings(db, todo.map((p, i) => ({ id: p.id, embedding: result.embeddings[i], model: VOYAGE_MODEL })));
  done += todo.length;
  tokens += result.tokens;
  console.log(`Embedded ${done} passages (${tokens} tokens so far).`);
}
console.log(`Done: ${done} passages embedded with ${VOYAGE_MODEL}, ${tokens} tokens.`);

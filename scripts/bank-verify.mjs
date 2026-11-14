// Marks Question Bank questions as checked by a person. Run:
//   npm run bank:verify -- "<how the keys were checked>" <bank:id> [<bank:id> ...]
// Unchecked questions still work in Checks; the Learner is told their key is unchecked.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { verifyBankQuestions } from "../src/bank/ingest.ts";

const [note, ...ids] = process.argv.slice(2);
if (!note || !ids.length) {
  console.error('Usage: npm run bank:verify -- "<how the keys were checked>" <bank:id> [<bank:id> ...]');
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (npm run passes --env-file=.env).");
const result = await verifyBankQuestions(drizzle({ client: neon(url) }), ids, note);
console.log(`Marked ${result.verified} question(s) as verified.`);

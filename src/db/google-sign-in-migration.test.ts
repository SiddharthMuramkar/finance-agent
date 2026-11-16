import { afterAll, describe, expect, it } from "vitest";
import { closeBeforeExpand, databaseBefore, migrateToLatest } from "@/test/before-expand";

afterAll(closeBeforeExpand);

// The Better Auth tables and learners.auth_user_id it added are gone again after the Clerk contract migration
// (0040_clerk_contract, issue #33), so only the Learners are compared; clerk-contract-migration.test.ts checks the drop.
describe("the Google sign-in migration", () => {
  it("keeps every Learner, through to the latest migration", async () => {
    const { client } = await databaseBefore("_google_sign_in");
    await client.exec(`INSERT INTO learners (name) VALUES ('tools'), ('test');`);
    const before = await client.query<{ id: number; name: string }>("select id, name from learners order by id");
    expect(before.rows).toHaveLength(3); // owner (made by the expand migration), tools, test
    await migrateToLatest(client);
    const after = await client.query<{ id: number; name: string }>("select id, name from learners order by id");
    expect(after.rows).toEqual(before.rows);
  });
});

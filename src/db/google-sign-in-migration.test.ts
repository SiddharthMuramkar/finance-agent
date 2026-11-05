import { afterAll, describe, expect, it } from "vitest";
import { closeBeforeExpand, databaseBefore, migrateToLatest } from "@/test/before-expand";

afterAll(closeBeforeExpand);

describe("the Google sign-in migration", () => {
  it("keeps every Learner and links none of them", async () => {
    const { client } = await databaseBefore("_google_sign_in");
    await client.exec(`INSERT INTO learners (name) VALUES ('tools'), ('test');`);
    const before = await client.query<{ id: number; name: string }>("select id, name from learners order by id");
    expect(before.rows).toHaveLength(3); // owner (made by the expand migration), tools, test
    await migrateToLatest(client);
    const after = await client.query<{ id: number; name: string; auth_user_id: string | null }>("select id, name, auth_user_id from learners order by id");
    expect(after.rows.map(({ id, name }) => ({ id, name }))).toEqual(before.rows);
    expect(after.rows.every((r) => r.auth_user_id === null)).toBe(true);
    for (const table of ["user", "session", "account", "verification", "invites"]) {
      expect((await client.query<{ n: number }>(`select count(*)::int as n from "${table}"`)).rows[0].n).toBe(0);
    }
  });
});

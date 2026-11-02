import { EventEmitter } from "node:events";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import type { Db } from "@/db/types";
import { archiveTopic, withIdleHours, type Query } from "./simulated-learner";

/** The script's raw query function, over the in-memory database. */
function queryOf(db: Db): Query {
  const client = (db as unknown as { $client: { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> } }).$client;
  return async (text, params = []) => (await client.query(text, params)).rows;
}

/** A database where the setting is saved as 6 hours, as the app saves it. */
async function settingsDb() {
  const query = queryOf(await testDb());
  await query("insert into settings (key, value) values ('session_idle_hours', '6')");
  return query;
}

async function idleHours(query: Query) {
  const [row] = await query("select value from settings where key = 'session_idle_hours'");
  return row?.value;
}

/** Stands in for `process`: signals can be sent to it, and exit is recorded instead of ending the test run. */
function fakeProcess() {
  const proc = Object.assign(new EventEmitter(), { exited: null as number | null, exit: (code: number) => void (proc.exited = code) });
  return proc;
}

describe("Simulated Learner database helpers", () => {
  it("puts session_idle_hours back when the run is interrupted by Ctrl-C in the middle of a turn", async () => {
    const query = await settingsDb();
    const before = await idleHours(query);
    expect(before).toBe("6");
    const proc = fakeProcess();
    let release!: () => void;
    const turn = new Promise<void>((r) => (release = r));

    const running = withIdleHours(query, "0", () => turn, proc);
    await new Promise((r) => setTimeout(r, 20));
    expect(await idleHours(query)).toBe("0");

    proc.emit("SIGINT");
    await new Promise((r) => setTimeout(r, 20));
    expect(await idleHours(query)).toBe(before);
    expect(proc.exited).toBe(130);
    release();
    await running;
  });

  it("puts session_idle_hours back after a turn that finishes or throws, and stops listening for signals", async () => {
    const query = await settingsDb();
    const before = await idleHours(query);
    expect(before).toBe("6");
    const proc = fakeProcess();
    await withIdleHours(query, "0", async () => undefined, proc);
    await expect(withIdleHours(query, "0", async () => Promise.reject(new Error("boom")), proc)).rejects.toThrow("boom");
    expect(await idleHours(query)).toBe(before);
    expect(proc.listenerCount("SIGINT")).toBe(0);
    expect(proc.listenerCount("SIGTERM")).toBe(0);
  });

  it("--reset leaves the Learner's current Topic alone when it is a different Topic", async () => {
    const db = await testDb();
    const query = queryOf(db);
    await db.execute(sql`insert into learner_state (id, current_topic_id) values (1, 'bond-prices') on conflict (id) do update set current_topic_id = 'bond-prices'`);
    await archiveTopic(query, "present-value", ["pv-check"], "archived-test");
    const [state] = await query("select current_topic_id from learner_state where id = 1");
    expect(state.current_topic_id).toBe("bond-prices");
  });

  it("--reset clears the current Topic when it is the Topic being reset, so the app starts it afresh", async () => {
    const db = await testDb();
    const query = queryOf(db);
    await db.execute(sql`insert into learner_state (id, current_topic_id) values (1, 'present-value') on conflict (id) do update set current_topic_id = 'present-value'`);
    await archiveTopic(query, "present-value", ["pv-check"], "archived-test");
    const [state] = await query("select current_topic_id from learner_state where id = 1");
    expect(state.current_topic_id).toBeNull();
  });
});

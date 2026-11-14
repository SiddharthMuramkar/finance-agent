import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDb } from "./client";
import * as schema from "./schema";
import type { Db } from "./types";

type Env = Record<string, string | undefined>;

let http: Db | undefined;

/**
 * The database for a write that is one statement and must never queue behind a Tutor turn: a Widget state save
 * (spec 2026-11-12, A9). In production it is Neon's HTTP driver: each statement is its own HTTPS request, committed on
 * its own, so it never waits for a client of the app's WebSocket pool (src/db/client.ts) that a turn in the same
 * function instance holds or keeps busy. It has no interactive transactions, so only single-statement writes use it.
 *
 * The browser test bed (`E2E` set) and anything with no `DATABASE_URL` (the unit tests) get the app's own database
 * from getDb(), so they keep their in-memory PGlite and getDb()'s production guard.
 */
export function oneWriteDb(env: Env = process.env): Db {
  if (env.E2E || !env.DATABASE_URL) return getDb();
  http ??= drizzle({ client: neon(env.DATABASE_URL), schema }) as unknown as Db;
  return http;
}

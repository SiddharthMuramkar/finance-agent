import { afterAll, afterEach, beforeEach } from "vitest";
import { closeAllTestDbs, closeDbsSince, markTestDbs } from "./pglite";

// Runs for every test file. Vitest runs afterEach and afterAll hooks in reverse order of
// registration (sequence.hooks "stack"), so these run after the file's own hooks, which still
// have their database. A database made in a test or beforeEach is closed when that test ends
// (each is a whole WASM Postgres heap, and one file makes 60+); one made in beforeAll lives
// until the file's end.
let mark = markTestDbs();
beforeEach(() => {
  mark = markTestDbs();
});
afterEach(() => closeDbsSince(mark));
afterAll(closeAllTestDbs);

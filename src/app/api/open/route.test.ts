import { describe, expect, it, vi } from "vitest";
import { OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";

const as = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => OWNER_LEARNER_ID }));

const { POST } = await import("./route");

describe("opening a Topic", () => {
  it("sends a passed Topic without a Session to the Notebook", async () => {
    as.db = await testDb();
    await as.db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId: "present-value", step: "principle", status: "passed" });
    const body = new FormData();
    body.set("topic", "present-value");
    const res = await POST(new Request("http://localhost/api/open", { method: "POST", body }));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/notebook");
  });
});

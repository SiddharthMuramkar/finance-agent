import { afterEach, describe, expect, it, vi } from "vitest";
import { send as sendNote } from "./notes/own-lines";
import { send as sendProfile } from "./profile/profile-form";

afterEach(() => vi.unstubAllGlobals());

describe("a dropped network request in the client forms", () => {
  it("gives the Learner a message instead of throwing (notes)", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    expect(await sendNote("POST", { topicId: "t", text: "x" })).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });

  it("gives the Learner a message instead of staying on saving (profile)", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    expect(await sendProfile("/api/profile", "PUT", {})).toContain("Could not reach");
  });
});

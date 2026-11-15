import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BOT_PROTECTED } from "./bot-protection";

/** The browser side of BotID Basic (issue #33): it must protect the request src/app/api/turn/route.ts checks. */

const initBotId = vi.hoisted(() => vi.fn());
vi.mock("botid/client/core", () => ({ initBotId }));

describe("the browser protects the request the server checks (issue #33)", () => {
  it("protects only POST /api/turn, a route that exists", () => {
    expect(BOT_PROTECTED).toEqual([{ path: "/api/turn", method: "POST" }]);
    expect(existsSync("src/app/api/turn/route.ts")).toBe(true);
  });

  it("instrumentation-client starts BotID with BOT_PROTECTED before the app runs", async () => {
    await import("@/instrumentation-client");
    expect(initBotId).toHaveBeenCalledWith({ protect: BOT_PROTECTED });
  });
});

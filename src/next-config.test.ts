import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("The main address (Home) is never cached as a page", () => {
  it("is private and no-store, so one address can serve two pages keyed by the cookie", async () => {
    const rules = await nextConfig.headers!();
    const value = rules
      .filter((r) => r.source === "/")
      .flatMap((r) => r.headers)
      .find((h) => h.key === "Cache-Control")?.value;
    expect(value).toMatch(/private/);
    expect(value).toMatch(/no-store/);
    expect(value).not.toMatch(/public|s-maxage/);
  });
});

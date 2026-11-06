import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("/progress is a permanent redirect", () => {
  it("sends the old Progress address to the Course Map with a 308", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects.find((r) => r.source === "/progress")).toEqual({ source: "/progress", destination: "/course", permanent: true });
  });
});

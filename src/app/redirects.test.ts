import { describe, expect, it } from "vitest";
import type { Redirect } from "next/dist/lib/load-custom-routes";
import nextConfig from "../../next.config";

describe("/progress is a permanent redirect", () => {
  it("sends the old Progress address to the Course Map with a 308", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects.find((r) => r.source === "/progress")).toEqual({ source: "/progress", destination: "/course", permanent: true });
  });
});

describe("old pages redirect to the Notebook", () => {
  it("sends /sessions and /notes to /notebook, and /notes?all=1 to /notebook?all=1 (listed first)", async () => {
    const redirects = await nextConfig.redirects!();
    const notesAll: Redirect = { source: "/notes", has: [{ type: "query" as const, key: "all", value: "1" }], destination: "/notebook?all=1", permanent: true };
    expect(redirects).toContainEqual(notesAll);
    expect(redirects).toContainEqual({ source: "/sessions", destination: "/notebook", permanent: true });
    expect(redirects).toContainEqual({ source: "/notes", destination: "/notebook", permanent: true });
    expect(redirects.findIndex((r) => r.source === "/notes" && "has" in r)).toBeLessThan(redirects.findIndex((r) => r.source === "/notes" && !("has" in r)));
    expect(redirects.every((r) => r.permanent === true)).toBe(true);
  });
});

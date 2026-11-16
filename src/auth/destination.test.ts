import { describe, expect, it } from "vitest";
import { destinationOrDefault, safeDestination } from "./destination";

// Where a sign-in lands (issue #33): `next` may name any page of the site except a sign-in page or an API route, so a
// signed-in visit to /sign-in?next=/sign-in can never loop, and a crafted `next` can never leave the site.

describe("safeDestination", () => {
  it("keeps a page of the site, with its query", () => {
    expect(safeDestination("/course")).toBe("/course");
    expect(safeDestination("/passages/12?from=map")).toBe("/passages/12?from=map");
    expect(safeDestination("/signed")).toBe("/signed");
    expect(safeDestination("/joinery")).toBe("/joinery");
  });

  it("refuses every sign-in page and every step under it: Clerk's sign-in and sign-up, the Waitlist, the old /login", () => {
    for (const next of ["/sign-in", "/sign-in/factor-one", "/sign-in?next=/course", "/sign-up", "/sign-up/verify", "/join", "/join/x", "/login", "/login?wrong=1"]) {
      expect(safeDestination(next), next).toBeNull();
    }
  });

  it("refuses a sign-in page reached through dot segments", () => {
    for (const next of ["/a/../sign-in", "/course/../../sign-up", "/./join", "/x/../login"]) expect(safeDestination(next), next).toBeNull();
  });

  it("refuses API routes and anything that could leave the site", () => {
    for (const next of ["/api/turn", "/api", "//evil.example", "/\\evil", "/%2f%2fevil", "https://evil.example", "/\t/evil.example", "course", 42, undefined]) {
      expect(safeDestination(next), String(next)).toBeNull();
    }
  });
});

describe("destinationOrDefault", () => {
  it("is the Study Workspace when next is missing or unsafe", () => {
    expect(destinationOrDefault(null)).toBe("/study");
    expect(destinationOrDefault("/sign-in")).toBe("/study");
    expect(destinationOrDefault("/join")).toBe("/study");
    expect(destinationOrDefault("/notebook")).toBe("/notebook");
  });
});

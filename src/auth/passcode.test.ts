import { describe, expect, it } from "vitest";
import { accessToken, hasAccess, passcodeMatches } from "./passcode";

describe("Passcode access", () => {
  it("accepts only the exact passcode", () => {
    expect(passcodeMatches("correct horse", "correct horse")).toBe(true);
    expect(passcodeMatches("correct hors", "correct horse")).toBe(false);
    expect(passcodeMatches("", "correct horse")).toBe(false);
  });

  it("grants access only with a cookie signed by the current secret", async () => {
    const token = await accessToken("secret-one");
    expect(await hasAccess(token, "secret-one")).toBe(true);
    expect(await hasAccess(token, "secret-two")).toBe(false);
    expect(await hasAccess("forged", "secret-one")).toBe(false);
    expect(await hasAccess(undefined, "secret-one")).toBe(false);
  });
});

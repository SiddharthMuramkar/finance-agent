import { describe, expect, it } from "vitest";
import { learnerToken, nameForPasscode, passcodeList, passcodeMatches, signedLearnerId } from "./passcode";

describe("Passcode access", () => {
  it("accepts only the exact passcode", () => {
    expect(passcodeMatches("correct horse", "correct horse")).toBe(true);
    expect(passcodeMatches("correct hors", "correct horse")).toBe(false);
    expect(passcodeMatches("", "correct horse")).toBe(false);
  });
});

describe("The passcode list", () => {
  it("reads name and passcode pairs, one per comma or line", () => {
    const list = passcodeList({ PASSCODES: "owner: correct horse battery,\n test:staple gun\ntools : x:y:z", PASSCODE: "old one" });
    expect([...list]).toEqual([
      ["owner", "correct horse battery"],
      ["test", "staple gun"],
      ["tools", "x:y:z"],
    ]);
  });

  it("while only the old single passcode is set, lists it as the owner's", () => {
    expect([...passcodeList({ PASSCODE: "old one" })]).toEqual([["owner", "old one"]]);
    expect([...passcodeList({ PASSCODES: "  ", PASSCODE: "old one" })]).toEqual([["owner", "old one"]]);
    expect([...passcodeList({})]).toEqual([]);
  });

  it("skips a pair with no name or no passcode", () => {
    expect([...passcodeList({ PASSCODES: "owner:abc, :nameless, nopasscode:, justtext" })]).toEqual([["owner", "abc"]]);
  });

  it("names the Learner whose passcode was typed, or nobody", () => {
    const list = passcodeList({ PASSCODES: "owner:correct horse, test:staple gun" });
    expect(nameForPasscode("correct horse", list)).toBe("owner");
    expect(nameForPasscode("staple gun", list)).toBe("test");
    expect(nameForPasscode("staple", list)).toBeNull();
    expect(nameForPasscode("", list)).toBeNull();
    expect(nameForPasscode("old one", passcodeList({ PASSCODES: "owner:new", PASSCODE: "old one" }))).toBeNull();
  });
});

describe("The sign-in cookie", () => {
  it("carries the Learner id, signed by the current secret", async () => {
    const token = await learnerToken(7, "secret-one");
    expect(await signedLearnerId(token, "secret-one")).toBe(7);
    expect(await signedLearnerId(token, "secret-two")).toBeNull();
    expect(await signedLearnerId(undefined, "secret-one")).toBeNull();
    expect(await signedLearnerId(token, "")).toBeNull();
  });

  it("refuses a tampered Learner id or signature", async () => {
    const token = await learnerToken(7, "secret-one");
    const [, signature] = token.split(".");
    expect(await signedLearnerId(`8.${signature}`, "secret-one")).toBeNull();
    const flipped = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    expect(await signedLearnerId(`7.${flipped}`, "secret-one")).toBeNull();
    expect(await signedLearnerId(`07.${signature}`, "secret-one")).toBeNull();
    expect(await signedLearnerId("forged", "secret-one")).toBeNull();
  });

  it("refuses an old cookie that carries no Learner", async () => {
    // The old cookie was the bare HMAC of a fixed label: 64 hex characters, no Learner id.
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret-one"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("finance-agent-access")));
    const old = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(await signedLearnerId(old, "secret-one")).toBeNull();
  });
});

import { afterEach, expect, it, vi } from "vitest";

/**
 * `currentSignIn` is read once per server render (React `cache`): a page asks through both signedInLearner and its
 * header's currentAccount (src/app/account.ts), and that must be one sign-in read, not two. Vitest loads React's
 * client build, where `cache` passes calls straight through, so here `cache` is React's server contract, one result
 * per render, and the sign-in is counted at its seam `currentIdentity`.
 */
const reads = vi.hoisted(() => ({ identity: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    let result: { value: R } | undefined;
    return (...args: A) => (result ??= { value: fn(...args) }).value;
  },
}));
vi.mock("@/auth/identity", () => ({
  currentIdentity: async () => {
    reads.identity++;
    return null;
  },
}));
vi.mock("@/db/client", () => ({ getDb: () => undefined }));

afterEach(() => vi.unstubAllEnvs());

it("reads the sign-in once however many times a render asks", async () => {
  vi.stubEnv("VERCEL", "1"); // the passcode door is shut, so a signed-out read touches no cookie
  const { currentLearner, currentSignIn, isSignedIn } = await import("./session");
  expect(await currentSignIn()).toEqual({ kind: "signed-out" });
  expect(await currentLearner()).toBeNull();
  expect(await isSignedIn()).toBe(false);
  expect(reads.identity).toBe(1);
});

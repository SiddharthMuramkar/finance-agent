import { cookies } from "next/headers";
import type { Identity } from "@/auth/identity";
import { e2eEnabled } from "./e2e-mode";

/**
 * The browser test bed's sign-in people (issue #33). Clerk is off in the test bed (clerkOn), so a test signs a browser
 * in as one of these through POST /api/dev-e2e `{person}`, which sets the signed `fa_e2e_person` cookie; the proxy and
 * `currentIdentity()` then read it in place of a Clerk session. Loaded only behind `NODE_ENV !== "production"` and
 * `e2eEnabled`, so a production build carries none of it.
 */

/** Who each test-bed person is, as a Clerk session would say. The owner is the admin, as the owner is in Clerk. */
export const E2E_PEOPLE = {
  owner: { userId: "user_e2e_owner", email: "owner@e2e.example", firstName: "Owner E2E", admin: true },
  asha: { userId: "user_e2e_asha", email: "asha@e2e.example", firstName: "Asha E2E", admin: false },
  /** A Learner who has passed the Spine (spec #68): the dev-e2e route passes every Spine Topic when Ravi signs in. */
  ravi: { userId: "user_e2e_ravi", email: "ravi@e2e.example", firstName: "Ravi E2E", admin: false },
} as const satisfies Record<string, Identity>;

export type E2ePerson = keyof typeof E2E_PEOPLE;

declare global {
  /** The test people, set when this file loads, so scripts/check-no-e2e-in-build.mjs can tell if it reached a build. */
  var __faE2ePeople: typeof E2E_PEOPLE | undefined;
}
globalThis.__faE2ePeople = E2E_PEOPLE;

/** The cookie that says which test-bed person this browser is. */
export const E2E_PERSON_COOKIE = "fa_e2e_person";

/** How the test bed sets and ends that cookie: the test server is plain http on localhost, so it is never Secure. */
export const E2E_PERSON_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: false, path: "/" } as const;

export const isE2ePerson = (value: unknown): value is E2ePerson => typeof value === "string" && Object.hasOwn(E2E_PEOPLE, value);

const encoder = new TextEncoder();

async function signature(person: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`finance-agent-e2e-person:${person}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value for a person: "<person>.<HMAC of the person under SESSION_SECRET>". */
export async function e2ePersonToken(person: E2ePerson, secret: string): Promise<string> {
  return `${person}.${await signature(person, secret)}`;
}

/** The person a cookie names when its signature is right and the test bed is on; otherwise null. */
export async function e2eIdentityFromCookie(cookie: string | undefined, secret: string, env: Record<string, string | undefined> = process.env): Promise<Identity | null> {
  if (!e2eEnabled(env) || !cookie || !secret) return null;
  const match = /^([a-z]+)\.([0-9a-f]{64})$/.exec(cookie);
  if (!match || !isE2ePerson(match[1])) return null;
  if (match[2] !== (await signature(match[1], secret))) return null;
  return { ...E2E_PEOPLE[match[1]] };
}

/** This request's test-bed person, from its cookie. */
export async function e2eIdentity(): Promise<Identity | null> {
  const jar = await cookies();
  return e2eIdentityFromCookie(jar.get(E2E_PERSON_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
}

/** The cookie that proves a passcode was entered, and whose Learner it opened. */
export const ACCESS_COOKIE = "fa_access";

/** The flags sign-in and sign-out both set it with; sign-out must repeat them, with no Domain, or the real cookie would survive. */
export const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

/** The name the owner's Learner has; while only the old single passcode is set, it signs in as this name. */
export const OWNER_NAME = "owner";

const encoder = new TextEncoder();

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Compares in constant time for equal-length input, so timing doesn't leak the passcode. */
export function passcodeMatches(input: string, expected: string) {
  if (!input || !expected) return false;
  return equalBytes(encoder.encode(input), encoder.encode(expected));
}

/** Each listed name and its passcode, in the order listed. */
export type PasscodeList = ReadonlyMap<string, string>;

/**
 * The passcode list from the environment. PASSCODES holds "name:passcode" pairs separated by commas
 * or new lines (a name has no colon; a passcode has no comma). While PASSCODES is unset or empty,
 * the old single PASSCODE signs in as the owner.
 */
export function passcodeList(env: Record<string, string | undefined> = process.env): PasscodeList {
  const list = new Map<string, string>();
  const pairs = (env.PASSCODES ?? "").trim();
  if (!pairs) {
    if (env.PASSCODE) list.set(OWNER_NAME, env.PASSCODE);
    return list;
  }
  for (const pair of pairs.split(/[,\n]/)) {
    const colon = pair.indexOf(":");
    if (colon < 0) continue;
    const name = pair.slice(0, colon).trim();
    const passcode = pair.slice(colon + 1).trim();
    if (name && passcode && !list.has(name)) list.set(name, passcode);
  }
  return list;
}

/** The name whose passcode was typed, or null. Every passcode is compared, so timing doesn't say which one nearly matched. */
export function nameForPasscode(input: string, list: PasscodeList): string | null {
  let found: string | null = null;
  for (const [name, passcode] of list) {
    if (passcodeMatches(input, passcode) && found === null) found = name;
  }
  return found;
}

async function signature(learnerId: number, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`finance-agent-learner:${learnerId}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value for a Learner: "<id>.<HMAC of the id under SESSION_SECRET>". Rotating the secret signs everyone out. */
export async function learnerToken(learnerId: number, secret: string) {
  return `${learnerId}.${await signature(learnerId, secret)}`;
}

/**
 * The Learner id the cookie carries, when its signature is right; otherwise null. Old cookies, which
 * carried no Learner, are refused. Whether that Learner may still sign in is checked separately.
 */
export async function signedLearnerId(cookie: string | undefined, secret: string): Promise<number | null> {
  if (!cookie || !secret) return null;
  const match = /^([1-9]\d{0,9})\.([0-9a-f]{64})$/.exec(cookie);
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isSafeInteger(id) || id > 2_147_483_647) return null;
  return equalBytes(encoder.encode(match[2]), encoder.encode(await signature(id, secret))) ? id : null;
}

/** The cookie that proves the passcode was entered. */
export const ACCESS_COOKIE = "fa_access";

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

/** An HMAC of a fixed label under SESSION_SECRET. Rotating the secret signs everyone out. */
export async function accessToken(secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode("finance-agent-access")));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hasAccess(cookie: string | undefined, secret: string) {
  if (!cookie || !secret) return false;
  return equalBytes(encoder.encode(cookie), encoder.encode(await accessToken(secret)));
}

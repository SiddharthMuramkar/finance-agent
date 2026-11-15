// A Clerk session token lives 60 seconds, and Clerk's browser SDK renews it on a timer that a background tab may skip.
// A request from a tab left idle can then reach the proxy with an expired token and get 401, though the person is still
// signed in (issue #33). fetchWithFreshSession asks Clerk for a fresh token (which also renews the session cookie the
// proxy reads) and sends the same request once more. Without Clerk (the passcode door) a 401 is the answer as it is.

/** The part of Clerk's browser SDK (`window.Clerk`, which ClerkProvider loads) this file uses. */
type ClerkGlobal = { session?: { getToken: (options: { skipCache: boolean }) => Promise<string | null> } | null };

/** A fresh session token from Clerk, or null: no Clerk on the page, no session, or the renewal failed. */
async function freshToken(): Promise<string | null> {
  const clerk = (globalThis as { Clerk?: ClerkGlobal }).Clerk;
  if (!clerk?.session) return null;
  try {
    return await clerk.session.getToken({ skipCache: true });
  } catch {
    return null;
  }
}

/**
 * `fetch`, with one more try after a 401 once Clerk has renewed the session. The body must be one that can be sent
 * twice (a string, as every caller sends): a stream is used up by the first try. Any other answer comes back as it is.
 */
export async function fetchWithFreshSession(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401 || (await freshToken()) === null) return res;
  return fetch(input, init);
}

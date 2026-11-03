/** Where the Learner lands after the passcode when there is no safe destination. */
export const DEFAULT_DESTINATION = "/study";

// Any origin works: only "does it stay on this origin" matters, so a fixed stand-in avoids needing the real host.
const BASE = "https://site.invalid";
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f]/;
// "%2F" or "%5C" in any case: a slash or backslash a decoder further along could turn into "//" or "/\".
const ENCODED_SLASH = /%(?:2f|5c)/i;

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/**
 * The destination rule: a `next` value is safe only if it is a path on this site that is
 * neither the sign-in page nor an API route. Returns the resolved path and query (never the
 * original text), or null when the value isn't safe. The value is used as delivered, never
 * decoded; an encoded slash or backslash is refused, so no later decoding can make a "//".
 */
export function safeDestination(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (ENCODED_SLASH.test(next)) return null;
  // The URL parser silently drops tabs and newlines, so "/\t/evil.example" would otherwise leave the site.
  if (WHITESPACE_OR_CONTROL.test(next)) return null;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  // Checked on the resolved path, so dot segments such as "/a/../login" can't slip past.
  if (under(url.pathname, "/login") || under(url.pathname, "/api")) return null;
  return url.pathname + url.search;
}

/** The safe destination, or the Study Workspace when `next` is missing or unsafe. */
export const destinationOrDefault = (next: unknown) => safeDestination(next) ?? DEFAULT_DESTINATION;

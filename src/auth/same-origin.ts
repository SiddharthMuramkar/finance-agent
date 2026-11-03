/**
 * True only for a request this site's own pages sent. Sec-Fetch-Site decides when present; otherwise the
 * Origin header must equal the origin the request was sent to (never a hard-coded domain). Sign out and
 * Start over check it, so another site can't post a form that signs the Learner out or starts them over.
 */
export function sameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin";
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

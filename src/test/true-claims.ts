/** Phrases the public pages must not say. "Archived, not deleted" does not match. */
const FALSE_CLAIMS = [
  /every (fact|number|figure)\b[^.]*\bha(s|ve) a source/i,
  /\b(data|record|account|progress)\b[^.]{0,20}\b(is|are|gets|will be) deleted/i,
  /\bdelete (your|all)\b/i,
  /\bno tracking\b|\b(don't|do not) track\b/i,
  /\blessons?\b/i,
  /\buser\b/i,
  /chatbot/i,
  /\b(should|you must) (buy|sell|invest)\b/i,
  /with every reply/i,
];

/** The banned phrases a block of public copy contains. */
export function falseClaims(text: string): string[] {
  return FALSE_CLAIMS.filter((rule) => rule.test(text)).map((rule) => rule.source);
}

export async function fetchWithFreshSession(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

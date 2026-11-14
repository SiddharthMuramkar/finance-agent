// Packages only (no "@/" paths), so the embedding script uses the same adapter from the laptop.

/** voyage-4 (balanced), 1024 dimensions: the size of the library_passages.embedding column. */
export const VOYAGE_MODEL = "voyage-4";
export const VOYAGE_DIMENSIONS = 1024;
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

export type VoyageOptions = {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  /** Gives up after this long; a query embedding must not hold up the Tutor's turn. */
  timeoutMs?: number;
};

/** Embeds texts with Voyage: `document` for passages, `query` for searches. Throws on any failure. */
export async function voyageEmbed(options: VoyageOptions, input: string[], inputType: "document" | "query"): Promise<{ embeddings: number[][]; tokens: number }> {
  const response = await (options.fetch ?? globalThis.fetch)(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ input, model: VOYAGE_MODEL, input_type: inputType, output_dimension: VOYAGE_DIMENSIONS }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  });
  if (!response.ok) throw new Error(`Voyage ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as { data: { index: number; embedding: number[] }[]; usage?: { total_tokens?: number } };
  const embeddings = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  return { embeddings, tokens: body.usage?.total_tokens ?? 0 };
}

/** The Tutor's query embedder: one short call with a tight time limit. */
export function voyageQueryEmbedder(options: VoyageOptions) {
  return async (query: string): Promise<number[]> => (await voyageEmbed({ timeoutMs: 5_000, ...options }, [query], "query")).embeddings[0];
}

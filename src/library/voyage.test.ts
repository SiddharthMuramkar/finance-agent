import { describe, expect, it } from "vitest";
import { voyageEmbed, voyageQueryEmbedder } from "./voyage";

type Call = { url: string; init: RequestInit };

function fakeFetch(answer: () => Response) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return answer();
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

describe("Voyage embeddings", () => {
  it("asks voyage-4 for 1024-dimension document embeddings and returns them in input order", async () => {
    const { fetch, calls } = fakeFetch(() =>
      Response.json({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], usage: { total_tokens: 7 } }),
    );

    const out = await voyageEmbed({ apiKey: "k", fetch }, ["first", "second"], "document");

    expect(out).toEqual({ embeddings: [[1, 0], [0, 1]], tokens: 7 });
    expect(calls[0].url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ input: ["first", "second"], model: "voyage-4", input_type: "document", output_dimension: 1024 });
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer k");
  });

  it("throws on an error answer, so search can fall back to keywords", async () => {
    const { fetch } = fakeFetch(() => new Response("rate limited", { status: 429 }));

    await expect(voyageQueryEmbedder({ apiKey: "k", fetch })("a question")).rejects.toThrow("Voyage 429");
  });
});

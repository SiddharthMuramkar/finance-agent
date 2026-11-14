import { describe, expect, it, vi } from "vitest";
import { postStoryToNotebook, storyNoteText } from "./story-to-notebook";
import type { SavedStory } from "./value-levers-model";

const story: SavedStory = {
  title: "My Valuation story: Amazon, Feb 2000, against the price of 3 Feb 2000",
  lines: ["How big it gets: revenue in year 10 $60bn", "Worth: $84 a share"],
  settings: { revenue: 60, margin: 12.5, salesToCapital: 3, risk: 12.84, failure: 0 },
  value: 84.07,
};

describe("saving a Valuation story to the Notebook (C4, Spine Topic 15)", () => {
  it("writes the title, then each line on its own row", () => {
    expect(storyNoteText(story)).toBe(`${story.title}\nHow big it gets: revenue in year 10 $60bn\nWorth: $84 a share`);
  });

  it("adds the note as a new line and returns its id", async () => {
    const send = vi.fn(async () => Response.json({ id: 7 }));
    expect(await postStoryToNotebook("spine-15-value-yourself", story, undefined, send as unknown as typeof fetch)).toEqual({ id: 7 });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method]).toEqual(["/api/notes", "POST"]);
    expect(JSON.parse(init.body as string)).toEqual({ topicId: "spine-15-value-yourself", text: storyNoteText(story) });
  });

  it("replaces the same line on a second save (PATCH), not adding another", async () => {
    const send = vi.fn(async () => Response.json({ id: 7, text: "x" }));
    expect(await postStoryToNotebook("t", story, 7, send as unknown as typeof fetch)).toEqual({ id: 7 });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method]).toEqual(["/api/notes", "PATCH"]);
    expect(JSON.parse(init.body as string)).toEqual({ id: 7, text: storyNoteText(story) });
  });

  it("falls back to a fresh add when the line to replace is gone", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "gone" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: 9 }));
    expect(await postStoryToNotebook("t", story, 7, send as unknown as typeof fetch)).toEqual({ id: 9 });
    expect(send.mock.calls.map((c) => (c[1] as RequestInit).method)).toEqual(["PATCH", "POST"]);
  });

  it("says null, without throwing, when the server refuses or the network fails", async () => {
    const refused = vi.fn(async () => Response.json({ error: "no" }, { status: 400 }));
    expect(await postStoryToNotebook("t", story, undefined, refused as unknown as typeof fetch)).toBeNull();
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await postStoryToNotebook("t", story, undefined, down as unknown as typeof fetch)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { CitationMarks, displayText } from "./citations";
import { CitationSplitter, citationOf, markerFor, parseMarker, renderMarkers, splitCited, type CitedSegment, type PassageResolver } from "./cite-markers";

/** Passages 12 (four sentences) and 14 (two) are known; any other id is not. */
const passages: PassageResolver = (id) => ({ 12: { title: "Present value", sentences: 4 }, 14: { title: "Bonds", sentences: 2 } })[id];

/** The stored citation for sentences from..to of a passage. */
const cite = (id: number, from: number, to: number = from) => ({
  type: "search_result_location",
  source: `/passages/${id}`,
  title: id === 12 ? "Present value" : "Bonds",
  start_block_index: from,
  end_block_index: to + 1,
});
const seg = (text: string, ...citations: ReturnType<typeof cite>[]): CitedSegment => ({ text, citations });

describe("the citation marker grammar", () => {
  it("reads a sentence range or one sentence of a passage", () => {
    expect(parseMarker("12:2-3")).toEqual([{ id: 12, from: 2, to: 3 }]);
    expect(parseMarker("12:4")).toEqual([{ id: 12, from: 4, to: 4 }]);
  });

  it("reads tolerantly: spaces, dashes, a p or passage before the id, § before the numbers, several references", () => {
    for (const body of [" 12 : 2 - 3 ", "12:2–3", "12:2—3", "p12:2-3", "P 12:2-3", "passage 12:2-3", "Passage 12: §2-§3", "12:§2 – §3", "12:3-2"]) {
      expect(parseMarker(body), body).toEqual([{ id: 12, from: 2, to: 3 }]);
    }
    expect(parseMarker("12:2-3; 14:1")).toEqual([
      { id: 12, from: 2, to: 3 },
      { id: 14, from: 1, to: 1 },
    ]);
    // A reference without an id takes the one before it.
    expect(parseMarker("12:2, 4")).toEqual([
      { id: 12, from: 2, to: 2 },
      { id: 12, from: 4, to: 4 },
    ]);
  });

  it("is not a marker without an id and a sentence number", () => {
    for (const body of ["", "12", ":2", "12:", "12:2-", "12:two", "see 12:2", "2, 12:3", "12:2-3 and more"]) expect(parseMarker(body), body).toBeNull();
  });

  it("turns sentences a..b into the end-exclusive block range a..b+1 the passage view reads", () => {
    expect(citationOf({ id: 12, from: 2, to: 3 }, passages)).toEqual(cite(12, 2, 3));
    expect(citationOf({ id: 12, from: 2, to: 3 }, passages)).toMatchObject({ start_block_index: 2, end_block_index: 4 });
    expect(citationOf({ id: 12, from: 4, to: 4 }, passages)).toMatchObject({ start_block_index: 4, end_block_index: 5 });
    // A range past the last sentence is cut there; one wholly past it, an unknown passage, or only the header (§0) cites nothing.
    expect(citationOf({ id: 14, from: 1, to: 9 }, passages)).toEqual(cite(14, 1, 2));
    expect(citationOf({ id: 14, from: 3, to: 4 }, passages)).toBeUndefined();
    expect(citationOf({ id: 99, from: 1, to: 1 }, passages)).toBeUndefined();
    expect(citationOf({ id: 12, from: 0, to: 0 }, passages)).toBeUndefined();
    expect(markerFor(12, 2, 3)).toBe("⟦12:2-3⟧");
    expect(markerFor(12, 4)).toBe("⟦12:4⟧");
  });

  it("shows the cited range as the reply's link to the passage view", () => {
    const blocks = splitCited("Money today is worth more ⟦12:2-3⟧, so we discount.", passages).map((s) => ({ type: "text", text: s.text, citations: s.citations }));
    expect(displayText(blocks, new CitationMarks())).toBe("Money today is worth more[1](/passages/12?blocks=2-4), so we discount.");
  });
});

describe("splitting a reply at its markers", () => {
  it("leaves text without markers whole", () => {
    expect(splitCited("Plain text.\nOn two lines.", passages)).toEqual([seg("Plain text.\nOn two lines.")]);
    expect(splitCited("", passages)).toEqual([]);
  });

  it("gives a marker's citations to the text before it, takes the marker out, and starts a new block after it", () => {
    expect(splitCited("Money today is worth more.⟦12:2⟧ So we discount.", passages)).toEqual([seg("Money today is worth more.", cite(12, 2)), seg(" So we discount.")]);
  });

  it("drops the white space just before a marker", () => {
    expect(splitCited("Worth more. ⟦12:2⟧ Next.", passages)).toEqual([seg("Worth more.", cite(12, 2)), seg(" Next.")]);
    expect(splitCited("Worth more.\n⟦12:2⟧\nNext.", passages)).toEqual([seg("Worth more.", cite(12, 2)), seg("\nNext.")]);
  });

  it("gives consecutive markers to the same block, once each", () => {
    expect(splitCited("Claim.⟦12:2⟧⟦14:1⟧ ⟦12:3-4⟧ ⟦12:2⟧ More.", passages)).toEqual([seg("Claim.", cite(12, 2), cite(14, 1), cite(12, 3, 4)), seg(" More.")]);
    expect(splitCited("Claim. ⟦12:2; 14:1-2⟧", passages)).toEqual([seg("Claim.", cite(12, 2), cite(14, 1, 2))]);
    expect(splitCited("Claim.⟦12:2, 2⟧", passages)).toEqual([seg("Claim.", cite(12, 2))]);
  });

  it("ends a block at a paragraph break, which starts the next", () => {
    expect(splitCited("One.\n\nTwo.⟦12:1⟧\n \nThree.", passages)).toEqual([seg("One."), seg("\n\nTwo.", cite(12, 1)), seg("\n \nThree.")]);
  });

  it("drops a marker with no text before it in its block: at the start, or straight after a paragraph break", () => {
    expect(splitCited("⟦12:2⟧ Hello.", passages)).toEqual([seg(" Hello.")]);
    expect(splitCited("One.\n\n⟦12:2⟧ Two.", passages)).toEqual([seg("One."), seg("\n\n Two.")]);
    // A dropped marker changes nothing else: a fence after it still opens at its line start.
    expect(splitCited("⟦12:2⟧```widget\n```", passages)).toEqual([seg("```widget\n```")]);
    expect(splitCited("One.\n\n⟦12:2⟧```widget\n```", passages)).toEqual([seg("One."), seg("\n\n```widget\n```")]);
  });

  it("drops a marker for a passage the searches never returned, keeping the text around it as written", () => {
    expect(splitCited("A claim ⟦99:1⟧ goes on.", passages)).toEqual([seg("A claim  goes on.")]);
    expect(splitCited("A claim.⟦99:1⟧⟦12:1⟧", passages)).toEqual([seg("A claim.", cite(12, 1))]);
  });

  it("keeps brackets that are not a marker as text", () => {
    expect(splitCited("A ⟦note⟧ here.", passages)).toEqual([seg("A ⟦note⟧ here.")]);
    expect(splitCited("Cut off ⟦12:", passages)).toEqual([seg("Cut off ⟦12:")]);
    expect(splitCited("Odd ⟦12:2\n⟧ end.", passages)).toEqual([seg("Odd ⟦12:2\n⟧ end.")]);
    expect(splitCited("Nested ⟦⟦12:2⟧ end.", passages)).toEqual([seg("Nested ⟦", cite(12, 2)), seg(" end.")]);
  });

  it("keeps a fenced Widget as one uncited block whose markers are text, with the text before it a block of its own", () => {
    const widget = "```widget\n{\"label\": \"⟦12:2⟧\"}\n\n```";
    expect(splitCited(`Look:⟦12:1⟧\n${widget}\nAfter.⟦14:1⟧`, passages)).toEqual([seg("Look:", cite(12, 1)), seg(`\n${widget}`), seg("\nAfter.", cite(14, 1))]);
    expect(splitCited(`Before\n${widget}`, passages)).toEqual([seg("Before"), seg(`\n${widget}`)]);
    // Only a fence line counts; a fence never closed runs to the end.
    expect(splitCited("Inline ```code``` ⟦12:1⟧", passages)).toEqual([seg("Inline ```code```", cite(12, 1))]);
    expect(splitCited("Start\n```widget\nstill ⟦12:1⟧", passages)).toEqual([seg("Start"), seg("\n```widget\nstill ⟦12:1⟧")]);
  });

  it("holds back a marker still being written, and gives it back as text once it proves not to be one", () => {
    const s = new CitationSplitter(passages);
    expect(s.push("Worth more ⟦1")).toEqual([]);
    expect(s.push("2:2")).toEqual([]);
    expect(s.push("⟧ and")).toEqual([seg("Worth more", cite(12, 2))]);
    expect(s.push(" ⟦not")).toEqual([]);
    expect(s.push(" one⟧.")).toEqual([]);
    expect(s.end()).toEqual([seg(" and ⟦not one⟧.")]);
  });

  it("holds back a fence still being written", () => {
    const s = new CitationSplitter(passages);
    expect(s.push("Text⟦12:1⟧\n``")).toEqual([]);
    expect(s.push("`widget\nbody\n")).toEqual([seg("Text", cite(12, 1))]);
    expect(s.push("``")).toEqual([]);
    expect(s.push("`\nafter")).toEqual([seg("\n```widget\nbody\n```")]);
    expect(s.end()).toEqual([seg("\nafter")]);
  });
});

/** A small seeded random generator, so a failing case can be replayed. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  "Money",
  " today",
  " is worth more.",
  " ",
  "\n",
  "\n\n",
  "  \n \n",
  "⟦12:2⟧",
  "⟦12:2-3⟧",
  "⟦ p14 : §1 – §2 ⟧",
  "⟦12:1; 14:2⟧",
  "⟦99:1⟧",
  "⟦",
  "⟧",
  "⟦12:",
  "⟦note⟧",
  "```",
  "```widget\n",
  "\n```\n",
  "`",
  "``",
  "§3",
  "x",
  "\t",
];

function randomText(next: () => number): string {
  let text = "";
  const n = Math.floor(next() * 30);
  for (let i = 0; i < n; i++) text += PIECES[Math.floor(next() * PIECES.length)];
  return text;
}

function chunked(text: string, next: () => number): CitedSegment[] {
  const s = new CitationSplitter(passages);
  const out: CitedSegment[] = [];
  for (let at = 0; at < text.length; ) {
    const size = 1 + Math.floor(next() * 6);
    out.push(...s.push(text.slice(at, at + size)));
    at += size;
  }
  return [...out, ...s.end()];
}

describe("the incremental splitter", () => {
  it("gives exactly the batch segments for any chunking of the same text", () => {
    const next = random(20261111);
    for (let i = 0; i < 3000; i++) {
      const text = randomText(next);
      const whole = splitCited(text, passages);
      expect(chunked(text, next), JSON.stringify(text)).toEqual(whole);
      // One character at a time, the finest chunking.
      const s = new CitationSplitter(passages);
      expect([...[...text].flatMap((c) => s.push(c)), ...s.end()], JSON.stringify(text)).toEqual(whole);
    }
  });

  it("keeps every character but the markers and the white space just before them", () => {
    const next = random(7);
    for (let i = 0; i < 1000; i++) {
      const text = randomText(next);
      const shown = splitCited(text, passages)
        .map((s) => s.text)
        .join("");
      expect(shown.replace(/\s/g, "").length, JSON.stringify(text)).toBeLessThanOrEqual(text.replace(/\s/g, "").length);
      // No cited block is empty, and only cited text loses trailing white space to a marker.
      for (const s of splitCited(text, passages)) {
        expect(s.text).not.toBe("");
        if (s.citations.length) expect(s.text.trim()).not.toBe("");
      }
    }
  });
});

describe("writing stored blocks back as markers", () => {
  it("renders a cited block's citations as markers after its text", () => {
    expect(renderMarkers("Worth more", [cite(12, 2, 3), cite(14, 1)])).toBe("Worth more⟦12:2-3⟧⟦14:1⟧");
    expect(renderMarkers("Plain", undefined)).toBe("Plain");
    // Only Library passage citations become markers.
    expect(renderMarkers("Elsewhere", [{ type: "web_search_result_location", source: "https://example.org" }])).toBe("Elsewhere");
  });

  it("round-trips: splitting the rendered blocks gives the blocks back", () => {
    expect(splitCited(renderMarkers("Worth more", [cite(12, 2, 3), cite(14, 1)]) + " Next.", passages)).toEqual([seg("Worth more", cite(12, 2, 3), cite(14, 1)), seg(" Next.")]);
    // Every marker here names a known passage: one that cites nothing is gone from the blocks, and taking it out can
    // join the text around it into something else (``⟦99:1⟧` at a line start reads as a fence once the marker is out).
    const known: PassageResolver = (id) => ({ title: `Passage ${id}` });
    const next = random(42);
    for (let i = 0; i < 2000; i++) {
      const blocks = splitCited(randomText(next), known);
      const rendered = blocks.map((b) => renderMarkers(b.text, b.citations)).join("");
      expect(splitCited(rendered, known), JSON.stringify(rendered)).toEqual(blocks);
    }
  });
});

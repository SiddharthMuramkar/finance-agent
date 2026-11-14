import { describe, expect, it } from "vitest";
import { parseCourseMap } from "./map";

/** A Follow Topic whose Case is a dated piece by a writer. */
function pieceTopic(piece: string, asOf = "2014-12-02") {
  return {
    name: "fol-a.yaml",
    text: `
id: fol-a
title: Follow a piece
stage: follow
path: 1
cases:
  - id: fol-a-case
    title: A writer's post
    asOf: ${asOf}
    story: The setting of the piece, as published.
    reveal: What happened afterwards.
${piece
  .split("\n")
  .map((l) => `    ${l}`)
  .join("\n")}
concept: The idea.
principle: The lesson.
checks:
  - id: fol-a-check
    kind: conversation
    prompt: Explain each step of the argument.
    passCriteria: Explains each step.
`,
  };
}

const libraryPiece = `piece:
  author: A. Writer
  title: Up, up and away
  published: 2014-12-02
  url: https://example.org/blog/up
  from: library
  librarySource: Damodaran`;

const pastedPiece = `piece:
  author: B. Writer
  title: A newsletter piece
  published: 2014-12-01
  url: https://example.org/news/piece
  from: paste`;

describe("Course Map validator: a dated piece as a Case", () => {
  it("accepts a Library piece and a pasted piece, and keeps them on the Case", () => {
    const lib = parseCourseMap([pieceTopic(libraryPiece)]);
    expect(lib.errors).toEqual([]);
    expect(lib.map?.topic("fol-a")?.cases[0].piece).toEqual({
      author: "A. Writer",
      title: "Up, up and away",
      published: "2014-12-02",
      url: "https://example.org/blog/up",
      from: "library",
      librarySource: "Damodaran",
    });
    const pasted = parseCourseMap([pieceTopic(pastedPiece)]);
    expect(pasted.errors).toEqual([]);
    expect(pasted.map?.topic("fol-a")?.cases[0].piece?.from).toBe("paste");
  });

  it("rejects a piece published after the Case's as-of date, since the story is the piece as published", () => {
    const { errors } = parseCourseMap([pieceTopic(libraryPiece, "2014-12-01")]);
    expect(errors).toEqual(['fol-a.yaml: Case "fol-a-case" studies a piece published 2014-12-02, after its as-of date 2014-12-01']);
  });

  it("rejects a Library piece without the Library source to search, and a pasted piece that names one", () => {
    const noSource = parseCourseMap([pieceTopic(libraryPiece.replace("\n  librarySource: Damodaran", ""))]);
    expect(noSource.errors).toEqual(['fol-a.yaml: Case "fol-a-case" reads its piece from the Library, so it needs librarySource']);
    const pastedWithSource = parseCourseMap([pieceTopic(`${pastedPiece}\n  librarySource: Zitron`)]);
    expect(pastedWithSource.errors).toEqual(['fol-a.yaml: Case "fol-a-case" has a pasted piece, which is never in the Library, so it cannot name a librarySource']);
  });
});

import { describe, expect, it } from "vitest";
import { LOGIN_NOT_INVITED, MATRIX_PAGES, MATRIX_VIEWPORTS, matrixCells, matrixThresholds } from "./preview-matrix";

describe("preview matrix [S3]", () => {
  it("the matrix lists every cell", () => {
    const cells = matrixCells();
    const main = cells.filter((c) => c.page.id !== LOGIN_NOT_INVITED.id);
    expect(MATRIX_PAGES).toHaveLength(12);
    expect(main).toHaveLength(4 * 2 * 12); // 96
    expect(cells.filter((c) => c.page.id === LOGIN_NOT_INVITED.id)).toHaveLength(8); // one per project
    expect(cells).toHaveLength(104);
    expect(new Set(cells.map((c) => c.project)).size).toBe(8);
    expect(new Set(cells.map((c) => c.file)).size).toBe(cells.length); // no duplicates
    for (const c of cells) expect(c.file, c.file).not.toMatch(/\s/);
  });

  // Spec §8.3 (colour-liveliness) "Inputs: screenshots of 6 states (reply with Story scene, Lingo card, Choices, Course
  // Map, Notebook, a wrong-choice mix-up fix), Light and Dark" (#481): each state is a cell, in both themes at every viewport.
  it("shoots the 6 §8.3 states in Light and Dark", () => {
    const states = {
      "reply with Story scene": { id: "study-story-scene", path: "/study", seed: "story-scene" },
      "Lingo card": { id: "study-lingo", path: "/study", seed: "lingo" },
      Choices: { id: "study-quiz-open", path: "/study", seed: "quiz-open" },
      "Course Map": { id: "course-map", path: "/course", seed: "many-topics" },
      Notebook: { id: "notebook", path: "/notebook", seed: "story" },
      "a wrong-choice mix-up fix": { id: "study-mixup-fix", path: "/study", seed: "mix-up" },
    };
    const cells = matrixCells();
    for (const [state, want] of Object.entries(states)) {
      expect(MATRIX_PAGES.find((p) => p.id === want.id), state).toMatchObject(want);
      for (const viewport of MATRIX_VIEWPORTS) {
        const themes = cells.filter((c) => c.viewport.id === viewport.id && c.page.id === want.id).map((c) => c.theme);
        expect(themes.sort(), `${state} at ${viewport.id}`).toEqual(["dark", "light"]);
      }
    }
  });

  // Spec §6.2: side gutter <= 32 px at 1280, 1512 and 1920, and no gutter row at 1024, so F1's "the same except where
  // §6 names a looser bound" keeps 32 there (A1's 17 px is its own /study test, not a §6 threshold). Prose line length
  // 45-80, 60-75 from 1280 up; header <= 56; Widget panel >= 55 %.
  it("the thresholds are §6.2's at every viewport", () => {
    for (const project of ["mbp14", "mbp14-dark", "w1280", "w1280-dark", "w1920", "w1920-dark"]) {
      expect(matrixThresholds(project), project).toEqual({ gutterMax: 32, headerMax: 56, panelMinPct: 55, lineMin: 60, lineMax: 75 });
    }
    for (const project of ["w1024", "w1024-dark"]) {
      expect(matrixThresholds(project), project).toEqual({ gutterMax: 32, headerMax: 56, panelMinPct: 55, lineMin: 45, lineMax: 80 });
    }
  });

  // Running prose (§2: "panels and Widgets span the width, running prose caps at 70ch"): Notebook and Settings have
  // paragraphs, so measuring none there is a failure; Course Map is cards and panels, so it is measured if it has any.
  it("says where running prose must be measured", () => {
    const prose = Object.fromEntries(MATRIX_PAGES.map((p) => [p.id, p.prose ?? null]));
    expect(prose).toEqual({
      home: null, "study-story": null, "study-story-scene": null, "study-lingo": null, "study-concept-widget": null, "study-quiz-open": null,
      "study-mixup-fix": null, "study-topic-complete": null,
      "course-map": "if-any", notebook: "required", settings: "required", login: null,
    });
    expect(LOGIN_NOT_INVITED.prose ?? null).toBeNull();
    // Settings (A5) is a card-grid at every matrix viewport and A1 says "Running paragraphs inside cards use `measure`":
    // each card is its own column, so its paragraphs are measured inside it. Only Settings reads its cards that way.
    expect(MATRIX_PAGES.filter((p) => p.cardsAsColumns).map((p) => p.id)).toEqual(["settings"]);
  });
});

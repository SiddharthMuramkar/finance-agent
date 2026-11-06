import { describe, expect, it } from "vitest";
import { LOGIN_NOT_INVITED, MATRIX_PAGES, matrixCells, matrixThresholds } from "./preview-matrix";

describe("preview matrix [S3]", () => {
  it("the matrix lists every cell", () => {
    const cells = matrixCells();
    const main = cells.filter((c) => c.page.id !== LOGIN_NOT_INVITED.id);
    expect(MATRIX_PAGES).toHaveLength(9);
    expect(main).toHaveLength(4 * 2 * 9); // 72
    expect(cells.filter((c) => c.page.id === LOGIN_NOT_INVITED.id)).toHaveLength(8); // one per project
    expect(cells).toHaveLength(80);
    expect(new Set(cells.map((c) => c.project)).size).toBe(8);
    expect(new Set(cells.map((c) => c.file)).size).toBe(cells.length); // no duplicates
    for (const c of cells) expect(c.file, c.file).not.toMatch(/\s/);
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
      home: null, "study-story": null, "study-concept-widget": null, "study-quiz-open": null, "study-topic-complete": null,
      "course-map": "if-any", notebook: "required", settings: "required", login: null,
    });
    expect(LOGIN_NOT_INVITED.prose ?? null).toBeNull();
  });
});

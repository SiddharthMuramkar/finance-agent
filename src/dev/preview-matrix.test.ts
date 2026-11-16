import { describe, expect, it } from "vitest";
import { SIGN_IN_WRONG, MATRIX_PAGES, MATRIX_VIEWPORTS, matrixCells, matrixThresholds } from "./preview-matrix";

describe("preview matrix [S3]", () => {
  it("the matrix lists every cell", () => {
    const cells = matrixCells();
    const desktop = cells.filter((c) => c.viewport.id !== "p390");
    const main = desktop.filter((c) => c.page.id !== SIGN_IN_WRONG.id);
    expect(MATRIX_PAGES).toHaveLength(16);
    expect(main).toHaveLength(4 * 16); // 64
    expect(desktop.filter((c) => c.page.id === SIGN_IN_WRONG.id)).toHaveLength(4); // one per desktop project
    expect(desktop).toHaveLength(68);
    expect(cells).toHaveLength(75); // and the phone's 7 (G9)
    expect(MATRIX_PAGES.find((p) => p.id === "about")).toMatchObject({ path: "/about" });
    expect(new Set(cells.map((c) => c.project)).size).toBe(5);
    // Decision #17: one Light theme, so every cell is Light and no project is a dark twin.
    expect(new Set(cells.map((c) => c.theme))).toEqual(new Set(["light"]));
    for (const c of cells) expect(c.project, c.file).not.toMatch(/dark/);
    expect(new Set(cells.map((c) => c.file)).size).toBe(cells.length); // no duplicates
    for (const c of cells) expect(c.file, c.file).not.toMatch(/\s/);
  });

  // Spec 2026-11-12 G9 and F6: the public pages at 390 px wide; nothing of the Study Workspace there.
  it("shoots the Signal site's pages and sign-in at 390 px wide, and no other page", () => {
    const phone = matrixCells().filter((c) => c.viewport.id === "p390");
    expect(MATRIX_VIEWPORTS.find((v) => v.id === "p390")).toMatchObject({ width: 390, height: 844 });
    expect([...new Set(phone.map((c) => c.project))]).toEqual(["p390"]);
    expect(phone.map((c) => c.page.path)).toEqual(["/", "/about", "/how-it-works", "/examples", "/examples/amazon-2000", "/sign-in", "/sign-in?wrong=1"]);
  });

  // Spec §8.3 (colour-liveliness) "Inputs: screenshots of 6 states (reply with Story scene, Lingo card, Choices, Course
  // Map, Notebook, a wrong-choice mix-up fix)" (#481): each state is a cell at every viewport, in the one Light theme.
  it("shoots the 6 §8.3 states", () => {
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
      for (const viewport of MATRIX_VIEWPORTS.filter((v) => !v.publicOnly)) {
        const themes = cells.filter((c) => c.viewport.id === viewport.id && c.page.id === want.id).map((c) => c.theme);
        expect(themes, `${state} at ${viewport.id}`).toEqual(["light"]);
      }
    }
  });

  // Spec §6.2: side gutter <= 32 px at 1280, 1512 and 1920, and no gutter row at 1024, so F1's "the same except where
  // §6 names a looser bound" keeps 32 there (A1's 17 px is its own /study test, not a §6 threshold). Prose line length
  // 45-80, 60-75 from 1440 up and 50-75 at 1280 (the 16 px chat in the conversation column); header <= 56; Widget panel >= 52 % (spec 2026-11-11, C2a: the 45 / 55 default split, R21).
  it("the thresholds are §6.2's at every viewport, with the 1280 band", () => {
    expect(() => matrixThresholds("mbp14-dark")).toThrow(/unknown matrix project/);
    for (const project of ["mbp14", "w1920"]) {
      expect(matrixThresholds(project), project).toEqual({ gutterMax: 32, headerMax: 56, panelMinPct: 52, lineMin: 60, lineMax: 75 });
    }
    for (const project of ["w1280"]) {
      expect(matrixThresholds(project), project).toEqual({ gutterMax: 32, headerMax: 56, panelMinPct: 52, lineMin: 50, lineMax: 75 });
    }
    for (const project of ["w1024", "p390"]) {
      expect(matrixThresholds(project), project).toEqual({ gutterMax: 32, headerMax: 56, panelMinPct: 52, lineMin: 45, lineMax: 80 });
    }
  });

  // Running prose (§2: "panels and Widgets span the width, running prose caps at 70ch"): Notebook and Settings have
  // paragraphs, so measuring none there is a failure; Course Map is cards and panels, so it is measured if it has any.
  it("says where running prose must be measured", () => {
    const prose = Object.fromEntries(MATRIX_PAGES.map((p) => [p.id, p.prose ?? null]));
    expect(prose).toEqual({
      home: null, about: null, "study-story": null, "study-story-scene": null, "study-lingo": null, "study-concept-widget": null, "study-quiz-open": null,
      "study-mixup-fix": null, "study-topic-complete": null,
      "course-map": "if-any", notebook: "required", settings: "required",
      "how-it-works": null, examples: null, "case-amazon": null, "sign-in": null,
    });
    expect(SIGN_IN_WRONG.prose ?? null).toBeNull();
    // Settings (A5) is a card-grid at every matrix viewport and A1 says "Running paragraphs inside cards use `measure`":
    // each card is its own column, so its paragraphs are measured inside it. Only Settings reads its cards that way.
    expect(MATRIX_PAGES.filter((p) => p.cardsAsColumns).map((p) => p.id)).toEqual(["settings"]);
  });
});

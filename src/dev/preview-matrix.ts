/**
 * The cell list of F1's preview matrix (spec 2026-11-05, ticket F1): 4 viewports x 2 themes x 9 pages, plus one
 * `/login?error=not_invited` shot per project. Pure data, no browser: e2e/matrix.spec.ts and scripts/preview-matrix.mjs
 * both read it, and src/dev/preview-matrix.test.ts checks its shape.
 */

export const MATRIX_VIEWPORTS = [
  { id: "mbp14", width: 1512, height: 982 },
  { id: "w1280", width: 1280, height: 800 },
  { id: "w1920", width: 1920, height: 1080 },
  { id: "w1024", width: 1024, height: 768 },
] as const;

export const MATRIX_THEMES = ["light", "dark"] as const;

export type MatrixSeed = "story" | "concept-widget" | "quiz-open" | "topic-complete" | "many-topics";
export type MatrixKind = "study" | "reading" | "login";

/**
 * Running prose on a reading page (§2: "panels and Widgets span the width, running prose caps at 70ch"): `required`
 * means the page has paragraphs, so measuring none is a failure; `if-any` means the page is cards and panels, so its
 * prose is measured only when it has some (Course Map's only prose is the one-line progress summary).
 */
export type MatrixProse = "required" | "if-any";

export type MatrixPage = {
  id: string; path: string; seed: MatrixSeed | null; kind: MatrixKind; signedOut: boolean; prose?: MatrixProse;
  /** Each card of a multi-column grid is its own column: its paragraphs are measured inside it (measureLayout's `cardsAsColumns`). */
  cardsAsColumns?: true;
};

/** The nine pages and states of the spec, in the order they are shot. Login pages run last (they sign the Learner out). */
export const MATRIX_PAGES: readonly MatrixPage[] = [
  { id: "home", path: "/", seed: "story", kind: "reading", signedOut: false },
  { id: "study-story", path: "/study", seed: "story", kind: "study", signedOut: false },
  { id: "study-concept-widget", path: "/study", seed: "concept-widget", kind: "study", signedOut: false },
  { id: "study-quiz-open", path: "/study", seed: "quiz-open", kind: "study", signedOut: false },
  { id: "study-topic-complete", path: "/study", seed: "topic-complete", kind: "study", signedOut: false },
  { id: "course-map", path: "/course", seed: "many-topics", kind: "reading", signedOut: false, prose: "if-any" },
  { id: "notebook", path: "/notebook", seed: "story", kind: "reading", signedOut: false, prose: "required" },
  // Settings (A5) is all cards in a card-grid of 2+ columns at every matrix viewport; A1: "Running paragraphs inside
  // cards use `measure`", so card text is running prose, measured per card (each card is its own column).
  { id: "settings", path: "/settings", seed: "story", kind: "reading", signedOut: false, prose: "required", cardsAsColumns: true },
  { id: "login", path: "/login", seed: null, kind: "login", signedOut: true },
];

export const LOGIN_NOT_INVITED: MatrixPage = { id: "login-not-invited", path: "/login?error=not_invited", seed: null, kind: "login", signedOut: true };

export type MatrixCell = {
  /** Playwright project name: "mbp14", "mbp14-dark", ... */
  project: string;
  viewport: { id: string; width: number; height: number };
  theme: (typeof MATRIX_THEMES)[number];
  page: MatrixPage;
  /** Relative to the repo root; git-ignored. */
  file: string;
};

export const MATRIX_DIR = "evidence/preview-matrix";

export const projectName = (viewportId: string, theme: string) => (theme === "dark" ? `${viewportId}-dark` : viewportId);

/** Every cell: 4 viewports x 2 themes x (9 pages + the not_invited login) = 80. */
export function matrixCells(): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const viewport of MATRIX_VIEWPORTS) {
    for (const theme of MATRIX_THEMES) {
      const project = projectName(viewport.id, theme);
      for (const page of [...MATRIX_PAGES, LOGIN_NOT_INVITED]) {
        cells.push({ project, viewport, theme, page, file: `${MATRIX_DIR}/${project}/${page.id}.png` });
      }
    }
  }
  return cells;
}

/** The cells of one project, in shooting order. */
export const cellsOfProject = (project: string) => matrixCells().filter((c) => c.project === project);

export type MatrixThresholds = { gutterMax: number; headerMax: number; panelMinPct: number; lineMin: number; lineMax: number };

/**
 * The §6.2 thresholds a project's cells are held to. Side gutter <= 32 px (§6.2 names 1280, 1512 and 1920 and no
 * looser bound at 1024, so 32 holds there too; A1's 17 px is its own /study test, not a §6 threshold). Prose line
 * length 45-80, 60-75 from 1280 up. Header <= 56 px. Widget panel >= 55 % of the viewport.
 */
export function matrixThresholds(project: string): MatrixThresholds {
  const viewport = MATRIX_VIEWPORTS.find((v) => project === v.id || project === `${v.id}-dark`);
  if (!viewport) throw new Error(`unknown matrix project: ${project}`);
  const [lineMin, lineMax] = viewport.width >= 1280 ? [60, 75] : [45, 80];
  return { gutterMax: 32, headerMax: 56, panelMinPct: 55, lineMin, lineMax };
}

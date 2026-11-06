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

export type MatrixPage = { id: string; path: string; seed: MatrixSeed | null; kind: MatrixKind; signedOut: boolean };

/** The nine pages and states of the spec, in the order they are shot. Login pages run last (they sign the Learner out). */
export const MATRIX_PAGES: readonly MatrixPage[] = [
  { id: "home", path: "/", seed: "story", kind: "reading", signedOut: false },
  { id: "study-story", path: "/study", seed: "story", kind: "study", signedOut: false },
  { id: "study-concept-widget", path: "/study", seed: "concept-widget", kind: "study", signedOut: false },
  { id: "study-quiz-open", path: "/study", seed: "quiz-open", kind: "study", signedOut: false },
  { id: "study-topic-complete", path: "/study", seed: "topic-complete", kind: "study", signedOut: false },
  { id: "course-map", path: "/course", seed: "many-topics", kind: "reading", signedOut: false },
  { id: "notebook", path: "/notebook", seed: "story", kind: "reading", signedOut: false },
  { id: "settings", path: "/settings", seed: "story", kind: "reading", signedOut: false },
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

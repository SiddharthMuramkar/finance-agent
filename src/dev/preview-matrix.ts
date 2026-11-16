/**
 * The cell list of F1's preview matrix (spec 2026-11-05, ticket F1): 4 viewports x 16 pages in Light and in Dark
 * (ADR 0019), plus one `/sign-in?wrong=1` (the sign-in page with its error) shot per project; and (spec 2026-11-12 G9,
 * F6) a phone, 390 px wide, for the public pages only (the Signal site's Home, How it works, Examples, a case page, About,
 * and sign-in). The signed-in pages open on a phone too (spec #68, #82-#84); e2e/phone-workspace.spec.ts and
 * e2e/phone-pages.spec.ts measure them there, so the matrix still shoots only the public pages at 390.
 * Pure data, no browser: e2e/matrix.spec.ts and scripts/preview-matrix.mjs both read it, and src/dev/preview-matrix.test.ts
 * checks its shape.
 */

export type MatrixViewport = { id: string; width: number; height: number; publicOnly?: true };

export const MATRIX_VIEWPORTS: readonly MatrixViewport[] = [
  { id: "mbp14", width: 1512, height: 982 },
  { id: "w1280", width: 1280, height: 800 },
  { id: "w1920", width: 1920, height: 1080 },
  { id: "w1024", width: 1024, height: 768 },
  // G9: a phone, for the public pages only (playwright.config.ts's p390).
  { id: "p390", width: 390, height: 844, publicOnly: true },
];

/** Both themes (ADR 0019, #80): every viewport is shot again in Dark, as a device set to dark opens it. */
export const MATRIX_THEMES = ["light", "dark"] as const;

export type MatrixSeed = "story" | "story-scene" | "lingo" | "concept-widget" | "quiz-open" | "mix-up" | "topic-complete" | "many-topics";
export type MatrixKind = "study" | "reading" | "sign-in";

/**
 * Running prose on a reading page (§2: "panels and Widgets span the width, running prose caps at 70ch"): `required`
 * means the page has paragraphs, so measuring none is a failure; `if-any` means the page is cards and panels, so its
 * prose is measured only when it has some (Course Map's only prose is the one-line progress summary).
 */
export type MatrixProse = "required" | "if-any";

export type MatrixPage = {
  id: string; path: string; seed: MatrixSeed | null; kind: MatrixKind; signedOut: boolean; prose?: MatrixProse;
  /** A public page (the Signal site and sign-in): shot at the phone width too (G9). */
  public?: true;
  /** Each card of a multi-column grid is its own column: its paragraphs are measured inside it (measureLayout's `cardsAsColumns`). */
  cardsAsColumns?: true;
};

/** The sixteen pages and states, in the order they are shot. Signed-out pages run last (they sign the Learner out). */
export const MATRIX_PAGES: readonly MatrixPage[] = [
  { id: "home", path: "/", seed: "story", kind: "reading", signedOut: false, public: true },
  // The About page (spec 2026-11-11, D1): public and static, Home's layout, so it has no reading column to measure.
  { id: "about", path: "/about", seed: "story", kind: "reading", signedOut: false, public: true },
  { id: "study-story", path: "/study", seed: "story", kind: "study", signedOut: false },
  // §8.3's colour-liveliness states (#481): a reply with its Story scene (sunflower), a Lingo card (violet) and a wrong
  // choice's mix-up fix (coral "not quite"), each a seeded state, so the shot needs no action in the browser.
  { id: "study-story-scene", path: "/study", seed: "story-scene", kind: "study", signedOut: false },
  { id: "study-lingo", path: "/study", seed: "lingo", kind: "study", signedOut: false },
  { id: "study-concept-widget", path: "/study", seed: "concept-widget", kind: "study", signedOut: false },
  { id: "study-quiz-open", path: "/study", seed: "quiz-open", kind: "study", signedOut: false },
  { id: "study-mixup-fix", path: "/study", seed: "mix-up", kind: "study", signedOut: false },
  { id: "study-topic-complete", path: "/study", seed: "topic-complete", kind: "study", signedOut: false },
  { id: "course-map", path: "/course", seed: "many-topics", kind: "reading", signedOut: false, prose: "if-any" },
  { id: "notebook", path: "/notebook", seed: "story", kind: "reading", signedOut: false, prose: "required" },
  // Settings (A5) is all cards in a card-grid of 2+ columns at every matrix viewport; A1: "Running paragraphs inside
  // cards use `measure`", so card text is running prose, measured per card (each card is its own column).
  { id: "settings", path: "/settings", seed: "story", kind: "reading", signedOut: false, prose: "required", cardsAsColumns: true },
  // The Signal site's other pages (spec 7.3 to 7.5), as a visitor sees them: one case page stands for the five.
  { id: "how-it-works", path: "/how-it-works", seed: null, kind: "reading", signedOut: true, public: true },
  { id: "examples", path: "/examples", seed: null, kind: "reading", signedOut: true, public: true },
  { id: "case-amazon", path: "/examples/amazon-2000", seed: null, kind: "reading", signedOut: true, public: true },
  // The sign-in page as the test bed draws it: Clerk is off there (issue #33), so it is the passcode door's form.
  { id: "sign-in", path: "/sign-in", seed: null, kind: "sign-in", signedOut: true, public: true },
];

/** The sign-in page with its error line (a wrong passcode), shot once per project beside the plain one. */
export const SIGN_IN_WRONG: MatrixPage = { id: "sign-in-wrong", path: "/sign-in?wrong=1", seed: null, kind: "sign-in", signedOut: true, public: true };

export type MatrixCell = {
  /** Playwright project name: "mbp14", "w1280", ... */
  project: string;
  viewport: MatrixViewport;
  theme: (typeof MATRIX_THEMES)[number];
  page: MatrixPage;
  /** Relative to the repo root; git-ignored. */
  file: string;
};

export const MATRIX_DIR = "evidence/preview-matrix";

/** A viewport's project in a theme: Light is the bare viewport id, Dark its `-dark` twin (playwright.config.ts). */
export const projectName = (viewportId: string, theme: (typeof MATRIX_THEMES)[number] = "light") => (theme === "dark" ? `${viewportId}-dark` : viewportId);

/** Every cell, per theme: 4 viewports x (16 pages + the sign-in error) = 68, plus the phone's 6 public pages + the sign-in error = 7: 75; 150 in both themes. */
export function matrixCells(): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const viewport of MATRIX_VIEWPORTS) {
    for (const theme of MATRIX_THEMES) {
      const project = projectName(viewport.id, theme);
      for (const page of [...MATRIX_PAGES, SIGN_IN_WRONG].filter((p) => !viewport.publicOnly || p.public)) {
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
 * length 45-80, 60-75 from 1440 up, and 50-75 at 1280: the reply spans the reading block,
 * min(544, conversation - 32) px (spec 2026-11-11, C1), about 63 characters of Inter at 1280 and 67 from 1512 up;
 * layout.spec holds the same bands. Header <= 56 px. Widget
 * panel >= 52 % of the viewport: the 45 / 55 default split gives it 52.4 % (spec 2026-11-11, C2a, R21).
 */
export function matrixThresholds(project: string): MatrixThresholds {
  const viewport = MATRIX_VIEWPORTS.find((v) => project === v.id || project === `${v.id}-dark`);
  if (!viewport) throw new Error(`unknown matrix project: ${project}`);
  const [lineMin, lineMax] = viewport.width >= 1440 ? [60, 75] : viewport.width >= 1280 ? [50, 75] : [45, 80];
  return { gutterMax: 32, headerMax: 56, panelMinPct: 52, lineMin, lineMax };
}

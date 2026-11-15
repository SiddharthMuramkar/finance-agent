import { choicesFor } from "@/teaching";
import type { CourseMap, Primer, Topic } from "./map";
import type { Place } from "./navigator";

/**
 * Primers (spec 2026-11-12, C3; ADR 0004): a two-minute stop inside a Spine Topic that teaches one idea the Topic needs.
 * Code shows it as one Session item when the Learner enters the Teaching Step the Topic file names (`at`): at most three
 * lines, one Lingo term as a card, one Quick try (marked like any other, by its key), optionally a Widget preset stored
 * after it, and a link to the Elective that teaches the idea in depth. "I know this" passes over it. Pure and
 * browser-safe: the database part is src/tutor/primer-items.ts, and the view is src/app/primer-view.tsx.
 */

/** The kind the thread draws a Primer by (src/app/session-item-view.tsx). */
export const PRIMER = "primer";

/**
 * A Primer's stored data. Its Quick try's fields sit at the top level, as a Quick try's do (`key`, `checkId`, `skillId`,
 * `prompt`, `kind`, `choices`, never the answer), so the server marks it through the same Quick try path by its key.
 */
export type PrimerData = {
  key: string;
  checkId: string;
  skillId: string;
  prompt: string;
  kind: "choice" | "truth";
  choices: { id: string; text: string }[];
  primer: {
    id: string;
    title: string;
    lines: string[];
    term: { term: string; means: string; pro?: string; example?: string };
    /** The Elective that teaches the idea in depth; `written` is false while it is Coming (then the link is the Course Map). */
    elective: { id: string; title: string; written: boolean };
    /** Set once the Learner pressed "I know this". */
    passed?: boolean;
  };
};

/**
 * The Primers to show on entering the Learner's step: those whose `at` is that step, in file order. None in a passed
 * Topic (reopened only for a due Check, which a Primer never sits inside), and none off a Topic's own Primers.
 */
export function primersAt(place: Pick<Place, "topic" | "step" | "status"> | null): Primer[] {
  if (!place || place.status === "passed") return [];
  return (place.topic.primers ?? []).filter((p) => p.at === place.step);
}

/** A Primer's Quick try key: a Quick try key (`qt:<session>:<n>:<id>`) whose place is `p`, so it names the try for marking. */
export const primerTryKey = (sessionId: number, primer: Pick<Primer, "quickTry">) => `qt:${sessionId}:p:${primer.quickTry.id}`;

/**
 * The Session item for a Primer, from the Topic file: its lines, its term, its Quick try's choices in the order the key
 * gives (never which is right), and its Elective's title. The Check it files its Quick try under is the Learner's
 * current one, or the Topic's first at a step with none (story, reveal).
 */
export function primerItem(
  map: Pick<CourseMap, "topic" | "coming">,
  topic: Pick<Topic, "terms" | "checks">,
  primer: Primer,
  checkId: string | null,
  sessionId: number,
): { kind: typeof PRIMER; data: PrimerData } | null {
  const key = primerTryKey(sessionId, primer);
  const set = choicesFor(primer.quickTry, key);
  const term = topic.terms.find((t) => t.term === primer.term);
  if (!set || !term || primer.quickTry.kind === "number") return null;
  const written = map.topic(primer.elective);
  const title = written?.title ?? map.coming.find((t) => t.id === primer.elective)?.title ?? primer.elective;
  const data: PrimerData = {
    key,
    checkId: checkId ?? topic.checks[0]?.id ?? "",
    skillId: primer.quickTry.skill,
    prompt: primer.quickTry.ask,
    kind: primer.quickTry.kind,
    choices: set.choices.map(({ id, text }) => ({ id, text })),
    primer: {
      id: primer.id,
      title: primer.title,
      lines: [...primer.lines],
      term: { term: term.term, means: term.means, ...(term.pro && { pro: term.pro }), ...(term.example && { example: term.example }) },
      elective: { id: primer.elective, title, written: Boolean(written) },
    },
  };
  return { kind: PRIMER, data };
}

/** A stored Primer's data when it is one (an older or broken row draws nothing). */
export function primerOf(data: Record<string, unknown>): PrimerData | null {
  const { key, prompt, kind, choices, primer } = data;
  if (typeof key !== "string" || typeof prompt !== "string" || (kind !== "choice" && kind !== "truth") || !Array.isArray(choices)) return null;
  if (!primer || typeof primer !== "object") return null;
  const p = primer as Partial<PrimerData["primer"]>;
  if (typeof p.id !== "string" || typeof p.title !== "string" || !Array.isArray(p.lines) || !p.term || !p.elective) return null;
  return data as unknown as PrimerData;
}

/**
 * Turns one stored Session turn into a live test case (ticket #236), so a Session that went badly becomes a test.
 * Pure: it takes the rows `scripts/tutor-eval-from-session.mjs` reads from the database and returns the case.
 * It imports nothing with an "@/" path, so that script can load it with Node's own TypeScript support.
 *
 * The state is the one the Learner had when they sent the message: the Teaching Step from the last step divider
 * before it, the Check from the Checks passed before it, the quiz attempt that was open (or missed) then, the
 * Skill answers given before it, and the last few message turns as history. Methods used come from today's
 * Skill state, which keeps no history. Pass conditions start as plain style only: add the ones the Session broke.
 */
import type { CaseStep, LiveCase, SkillSeed } from "./case.ts";

export type SessionRows = {
  topicId: string;
  /** The Topic's Checks in order. */
  checkIds: string[];
  turn: { turnSeq: number; input: string; startedAt: string };
  /** The Session's turns before this one, by turn seq, with what each sent. */
  turns: { turnSeq: number; input: string | null }[];
  /** The Session's stored messages before this turn. */
  messages: { seq: number; role: string; content: unknown }[];
  items: { afterSeq: number; kind: string; data: Record<string, unknown> }[];
  quizAttempts: { checkId: string; questionIds: string[]; createdAt: string; submittedAt: string | null; correctCount: number | null; passed: boolean | null }[];
  practice: { skillId: string; verdict: string; createdAt: string }[];
  skillMethods: { skillId: string; methodsUsed: string[] }[];
};

const STEPS: readonly string[] = ["story", "concept", "explore", "your_turn", "check"];
const METHODS: readonly string[] = ["restate", "worked", "boxes", "widget", "drill5"];
/** A note code wrote as the turn's user message ("Opener by code:", "Quiz follow-up by code:"…), not the Learner's words. */
const CODE_NOTE = /^[A-Z][A-Za-z -]{0,40} by code:/;

/** The visible text of an assistant message's content. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && typeof b === "object" && (b as { type?: unknown }).type === "text")
    .map((b) => String((b as { text?: unknown }).text ?? ""))
    .join("");
}

const before = (a: string, b: string) => new Date(a).getTime() < new Date(b).getTime();

export function caseFromSession(rows: SessionRows, opts: { id: string; title?: string; historyTurns?: number }): LiveCase {
  const { turn } = rows;
  const earlier = rows.items.filter((i) => i.afterSeq < turn.turnSeq);
  const divider = earlier.filter((i) => i.kind === "step" && STEPS.includes(String(i.data.step))).at(-1);
  const step = (divider ? String(divider.data.step) : "concept") as CaseStep;
  const passed = new Set(earlier.filter((i) => i.kind === "check_result" && i.data.passed === true).map((i) => Number(i.data.check)));
  const check = Math.max(1, Math.min(rows.checkIds.length || 1, passed.size + 1));
  const checkId = rows.checkIds[check - 1];

  const state: LiveCase["state"] = { step, check };
  if (step === "check" && checkId) {
    const attempt = rows.quizAttempts.filter((a) => a.checkId === checkId && before(a.createdAt, turn.startedAt)).at(-1);
    if (attempt && (!attempt.submittedAt || !before(attempt.submittedAt, turn.startedAt))) state.quiz = { state: "open", questions: attempt.questionIds };
    else if (attempt && attempt.passed === false) state.quiz = { state: "missed", questions: attempt.questionIds, correct: attempt.correctCount ?? 0 };
  }

  const skills = new Map<string, SkillSeed>();
  for (const p of rows.practice.filter((x) => before(x.createdAt, turn.startedAt))) {
    const seed = skills.get(p.skillId) ?? { skill: p.skillId, answers: [] };
    seed.answers.push(p.verdict === "right" ? "right" : "wrong");
    skills.set(p.skillId, seed);
  }
  for (const s of rows.skillMethods) {
    const seed = skills.get(s.skillId);
    const methods = s.methodsUsed.filter((m) => METHODS.includes(m)) as SkillSeed["methodsUsed"];
    if (seed && methods?.length) seed.methodsUsed = methods;
  }
  if (skills.size) state.skills = [...skills.values()];

  const starts = rows.turns.filter((t) => t.turnSeq < turn.turnSeq).sort((a, b) => a.turnSeq - b.turnSeq);
  const history = starts.flatMap((t, i) => {
    const end = starts[i + 1]?.turnSeq ?? turn.turnSeq;
    const reply = rows.messages
      .filter((m) => m.role === "assistant" && m.seq > t.turnSeq && m.seq < end)
      .map((m) => textOf(m.content))
      .join("")
      .trim();
    return t.input && !CODE_NOTE.test(t.input) && reply ? [{ learner: t.input, tutor: reply }] : [];
  });
  const kept = history.slice(-(opts.historyTurns ?? 3));
  if (kept.length) state.history = kept;

  return {
    id: opts.id,
    title: opts.title ?? `From a Session: "${turn.input.slice(0, 60)}"`,
    source: `Session turn ${turn.turnSeq}, ${turn.startedAt}`,
    kind: "live",
    topic: rows.topicId,
    state,
    message: turn.input,
    pass: [{ kind: "plainStyle" }],
    notes: "Made by scripts/tutor-eval-from-session.mjs. Add the pass conditions this Session broke (see case.ts for the kinds) and any graderChecks. Methods used are today's, not the turn's.",
  };
}

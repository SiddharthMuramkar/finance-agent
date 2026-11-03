import type { TopicNote } from "@/learner/notes";
import { formulaById } from "@/finance/formulas";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { FormulaFigure, type CardValue } from "@/widgets/formula-card-view";
import { MarkedText } from "@/widgets/marked-text";
import { Card, Eyebrow } from "../ui";
import { OwnLines } from "./own-lines";
import { SavedItems } from "./saved-items";

const STAGE: Record<TopicNote["stage"], string> = { foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 text-xs font-semibold uppercase leading-4 tracking-wide text-[var(--muted)]">{children}</h3>;
}

/** The part of a Topic Note that code fills in once the Topic is passed. */
function FilledPart({ filled }: { filled: NonNullable<TopicNote["filled"]> }) {
  return (
    <div data-filled>
      {filled.formulas.map((f) => {
        const formula = formulaById(f.formulaId);
        if (!formula) return null;
        const values: Record<string, CardValue> = Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, { value: v, from: "fixed" as const }]));
        return (
          <div key={f.formulaId} data-formula={f.formulaId} className="mt-3 break-inside-avoid">
            <FormulaFigure formula={formula} values={values} />
          </div>
        );
      })}
      {filled.insight && (
        <div data-insight className="break-inside-avoid">
          <Heading>The Insight</Heading>
          <p className="mt-1 text-sm leading-6">
            <span className="text-[var(--muted)]">In your words: </span>
            {filled.insight.ownWords}
          </p>
          {filled.insight.written && (
            <p data-written-insight className="mt-1 text-sm leading-6">
              <span className="text-[var(--muted)]">As written: </span>
              {filled.insight.written}
            </p>
          )}
        </div>
      )}
      <Heading>The principle</Heading>
      <MarkedText text={filled.principle} className="mt-1 flex flex-col gap-2 text-sm leading-6" />
      {filled.connections.length > 0 && (
        <div className="break-inside-avoid">
          <Heading>Connections</Heading>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
            {filled.connections.map((c) => (
              <li key={c.text}>
                {c.text}
                {c.titles.length > 0 && <span className="text-[var(--muted)]"> ({c.titles.join(", ")})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {filled.mistakes.length > 0 && (
        <div className="break-inside-avoid">
          <Heading>Mistakes noticed</Heading>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
            {filled.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The Notes page: every Topic in course order. A passed Topic's note is filled in by code; any Topic
 * takes the Learner's own lines. The page prints: controls are hidden, and a Topic with nothing on
 * it is left out of the paper copy.
 */
export function NotesView({ notes }: { notes: TopicNote[] }) {
  return (
    // One Case Data cache for the page, so saved Widgets drawing the same Case fetch it once.
    <CaseDataProvider>
      <div>
        <p className="mb-6 text-sm leading-5 text-[var(--muted)] print:hidden">
          A note fills in when you pass a Topic. Add lines of your own to any Topic. Print this page for a paper copy.
        </p>
        <div className="flex flex-col gap-4">
          {notes.map((note) => (
            <Card key={note.topicId} data-note={note.topicId} data-passed={note.passed} className={note.passed ? "" : "print:[&:not(:has([data-line],[data-saved]))]:hidden"}>
              <Eyebrow>{STAGE[note.stage]}</Eyebrow>
              <h2 className="text-base font-semibold leading-6">{note.title}</h2>
              {note.filled ? <FilledPart filled={note.filled} /> : <p className="mt-1 text-sm leading-5 text-[var(--muted)] print:hidden">Fills in when you pass this Topic.</p>}
              <SavedItems items={note.saved} />
              <OwnLines topicId={note.topicId} initial={note.lines.map((l) => ({ id: l.id, text: l.text }))} />
            </Card>
          ))}
        </div>
      </div>
    </CaseDataProvider>
  );
}

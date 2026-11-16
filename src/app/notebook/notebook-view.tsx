import type { Notebook, NotebookRow } from "@/learner/notebook";
import type { OwnCaseNote } from "@/learner/own-cases";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { dayMonth, shortDate } from "../past-sessions";
import { Button, ButtonLink, Card, Eyebrow, Tag, TextLink } from "../ui";
import { FilledPart } from "./filled-part";
import { OwnLines } from "./own-lines";
import { SavedItems } from "./saved-items";
import { ScrollToRow } from "./scroll-to-row";
import { UndoProvider } from "./undo";

const STAGE: Record<NotebookRow["stage"], string> = { spine: "Spine", foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };
const STATUS: Record<NotebookRow["status"], string> = { not_started: "Not started", in_progress: "In progress", passed: "Passed" };

/** A part of a row (what was found, the Topic Note's parts, Earlier attempts): a hairline above, no box of its own (ADR 0018). */
const PART = "mt-5 border-t border-[var(--rule)] pt-4";

/** A part's label: small capitals in muted. */
function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="type-eyebrow text-[var(--muted)]">{children}</h3>;
}

/**
 * Resume is a form post to /api/open, so it works without scripts; Read is a link to the read-only Session. Primary is
 * used once per view (Appendix B.7): only the `next` row's Resume is primary, every other Resume is secondary.
 */
function RowAction({ row, next }: { row: NotebookRow; next: boolean }) {
  if (row.action === "resume")
    return (
      <form method="post" action="/api/open" className="print:hidden">
        <input type="hidden" name="topic" value={row.topicId} />
        <Button type="submit" variant={next ? "primary" : "secondary"} size="sm">
          Resume
        </Button>
      </form>
    );
  if (row.action === "read" && row.sessionId !== null)
    return (
      <ButtonLink href={`/sessions/${row.sessionId}`} variant="secondary" size="sm" className="print:hidden">
        Read
      </ButtonLink>
    );
  return null;
}

/** The Topic's Earlier attempts (it was started over): newest first, each read-only with a Read link, never a Resume. */
function EarlierAttempts({ row }: { row: NotebookRow }) {
  if (row.earlier.length === 0) return null;
  return (
    <div data-earlier-attempts={row.topicId} className={PART}>
      <Heading>Earlier attempts</Heading>
      <ul className="mt-1 divide-y divide-[var(--rule)]">
        {row.earlier.map((e) => (
          <li key={e.sessionId} data-earlier-attempt={e.sessionId} className="flex flex-col gap-1 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold leading-5">
                <span>Earlier attempt · {dayMonth(e.date)}</span>
                <Tag tone={e.status === "passed" ? "success" : "neutral"}>{e.status === "passed" ? "Passed" : "Not finished"}</Tag>
              </p>
              <ButtonLink href={`/sessions/${e.sessionId}`} variant="secondary" size="sm" className="print:hidden">
                Read
              </ButtonLink>
            </div>
            <p className="text-xs leading-4 text-[var(--muted)]">
              Checks passed {e.checksPassed} of {e.checksTotal}
            </p>
            {e.found.length > 0 && (
              <div data-testid="earlier-found">
                <p className="text-xs font-semibold leading-4">What you found</p>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-5">
                  {e.found.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The one row whose Resume is primary: the in-progress Topic worked on most recently (the first one on a tie or no date). */
function nextResume(rows: readonly NotebookRow[]): string | null {
  let best: NotebookRow | null = null;
  for (const r of rows) {
    if (r.action !== "resume") continue;
    if (!best || (r.lastActive?.getTime() ?? -Infinity) > (best.lastActive?.getTime() ?? -Infinity)) best = r;
  }
  return best?.topicId ?? null;
}

/**
 * One Topic's row, under Enjoy's ink rule with a numbered marker (its place on the page, in course order). The `next` row,
 * whose Resume is the page's primary, is the one active row: an accent line above and an accent number.
 */
function Row({ row, place, next }: { row: NotebookRow; place: number; next: boolean }) {
  const { note } = row;
  return (
    <Card
      variant="rule"
      id={`note-${row.topicId}`}
      data-notebook-row={row.topicId}
      data-passed={note.passed}
      className={`flex break-inside-avoid flex-col ${next ? "!border-[var(--accent-fill)] shadow-[inset_0_1px_0_var(--accent-fill)]" : ""} ${note.passed ? "scroll-mt-4" : "scroll-mt-4 print:[&:not(:has([data-line],[data-saved]))]:hidden"}`}
    >
      <div className="flex items-baseline gap-3">
        <span aria-hidden="true" data-marker={next ? "current" : "row"} className={`text-[12px] font-semibold leading-4 tabular-nums ${next ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
          {String(place).padStart(2, "0")}
        </span>
        <Eyebrow>{STAGE[row.stage]}</Eyebrow>
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="[font-family:var(--font-display)] text-[18px] font-semibold leading-6 tracking-[-0.012em]">{row.title}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-[var(--muted)]">
            <Tag tone={row.status === "passed" ? "success" : row.status === "in_progress" ? "brand" : "neutral"}>{STATUS[row.status]}</Tag>
            {row.lastActive && <span>Last worked on {shortDate(row.lastActive)}</span>}
          </p>
        </div>
        <RowAction row={row} next={next} />
      </div>
      {row.found.length > 0 && (
        <div data-testid="session-found" className={PART}>
          <Heading>What you found</Heading>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
            {row.found.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {note.filled ? <FilledPart filled={note.filled} /> : <p className={`${PART} text-sm leading-5 text-[var(--muted)] print:hidden`}>Fills in when you pass this Topic.</p>}
      <SavedItems items={note.saved} />
      <OwnLines topicId={row.topicId} initial={note.lines.map((l) => ({ id: l.id, text: l.text, ...(l.ownRule && { ownRule: true }) }))} />
      <EarlierAttempts row={row} />
    </Card>
  );
}

/**
 * The Notebook: one row per Topic in course order, each with its status, the Session (Resume or Read), what the Learner
 * found and the Topic Note. By default only Topics with a Session or a note; "Show all Topics" lists every one, so a line
 * can be added to a Topic not reached yet. Rows sit in the card-grid at minmax(420px, 1fr) (three across at 1512, four at 1920), so
 * every column of the page is used. Older sessions follow the rows. The page prints: controls are hidden, and a
 * Topic with nothing on it is left out of the paper copy.
 */
/** The Learner's saved Own Cases (spec #68, Assignments): one one-page note each, newest first. */
function OwnCaseNotes({ notes }: { notes: readonly OwnCaseNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section id="own-cases" aria-labelledby="own-cases-heading" className="mb-12 flex scroll-mt-4 flex-col gap-4">
      <h2 id="own-cases-heading" className="type-h2">
        Own Cases
      </h2>
      <div className="card-grid gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(min(420px,100%),1fr))]">
        {notes.map((n) => (
          <Card key={n.id} variant="rule" data-own-case-note={n.id} className="flex break-inside-avoid flex-col gap-2">
            <Eyebrow>Assignment</Eyebrow>
            <h3 className="[font-family:var(--font-display)] text-[18px] font-semibold leading-6 tracking-[-0.012em]">{n.company}</h3>
            {n.note.split("\n").map((line) => (
              <p key={line} className="text-sm leading-6">
                {line}
              </p>
            ))}
          </Card>
        ))}
      </div>
    </section>
  );
}

export function NotebookView({ notebook, showAll, ownCases = [] }: { notebook: Notebook; showAll: boolean; ownCases?: readonly OwnCaseNote[] }) {
  const next = nextResume(notebook.rows);
  return (
    // One Case Data cache for the page, so saved Widgets drawing the same Case fetch it once.
    <CaseDataProvider>
      <UndoProvider>
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="type-h1">Notebook</h1>
            <TextLink href={showAll ? "/notebook" : "/notebook?all=1"} data-show-all={showAll} className="text-sm leading-5 print:hidden">
              {showAll ? "Show only Topics with something in them" : "Show all Topics"}
            </TextLink>
          </div>
          <p className="measure mb-10 mt-2 text-sm leading-5 text-[var(--muted)] print:hidden">
            For each Topic: your Session, what you found and your Topic Note. Add lines of your own to any Topic. Print this page for a paper copy.
          </p>
          <OwnCaseNotes notes={ownCases} />
          {notebook.rows.length === 0 && ownCases.length === 0 && (
            <p data-notebook-empty className="text-sm leading-5">
              Nothing here yet. Study a Topic, or save a reply while you study, and it shows here. Show all Topics to add a line of your own.
            </p>
          )}
          <div className="card-grid gap-y-12 [grid-template-columns:repeat(auto-fill,minmax(min(420px,100%),1fr))]">
            {notebook.rows.map((row, i) => (
              <Row key={row.topicId} row={row} place={i + 1} next={row.topicId === next} />
            ))}
          </div>
          {notebook.rows.length > 0 && <ScrollToRow />}
          {notebook.older.length > 0 && (
            <section aria-labelledby="older-sessions" className="mt-16 flex flex-col gap-4">
              <h2 id="older-sessions" className="type-h2">
                Older sessions
              </h2>
              <ul className="card-grid">
                {notebook.older.map((s) => (
                  <li key={s.id} className="relative flex flex-col gap-2 border-t border-[var(--rule)] px-3 pb-4 pt-3 transition-colors duration-[var(--dur-ui)] hover:bg-[var(--wash)]">
                    <TextLink href={`/sessions/${s.id}`} className="self-start text-xs font-semibold uppercase leading-4 tracking-[0.04em] after:absolute after:inset-0 after:content-['']">
                      Older session · {shortDate(s.date).toUpperCase()}
                    </TextLink>
                    <span className="text-sm leading-5 text-[var(--muted)]">{s.topics.length ? s.topics.join(", ") : "No Topic"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </UndoProvider>
    </CaseDataProvider>
  );
}

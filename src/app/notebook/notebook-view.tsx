import type { Notebook, NotebookRow } from "@/learner/notebook";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { shortDate } from "../past-sessions";
import { ButtonLink, Card, Eyebrow, PrimaryButton, Tag, TextLink } from "../ui";
import { FilledPart } from "./filled-part";
import { OwnLines } from "./own-lines";
import { SavedItems } from "./saved-items";
import { UndoProvider } from "./undo";

const STAGE: Record<NotebookRow["stage"], string> = { foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };
const STATUS: Record<NotebookRow["status"], string> = { not_started: "Not started", in_progress: "In progress", passed: "Passed" };

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 text-xs font-semibold uppercase leading-4 tracking-wide text-[var(--muted)]">{children}</h3>;
}

/** Resume is a form post to /api/open, so it works without scripts; Read is a link to the read-only Session. */
function RowAction({ row }: { row: NotebookRow }) {
  if (row.action === "resume")
    return (
      <form method="post" action="/api/open" className="print:hidden">
        <input type="hidden" name="topic" value={row.topicId} />
        <PrimaryButton type="submit" size="sm">
          Resume
        </PrimaryButton>
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

function Row({ row }: { row: NotebookRow }) {
  const { note } = row;
  return (
    <Card
      id={`note-${row.topicId}`}
      data-notebook-row={row.topicId}
      data-passed={note.passed}
      className={`mb-[var(--gap)] flex break-inside-avoid flex-col ${note.passed ? "scroll-mt-4" : "scroll-mt-4 print:[&:not(:has([data-line],[data-saved]))]:hidden"}`}
    >
      <Eyebrow>{STAGE[row.stage]}</Eyebrow>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6">{row.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-[var(--muted)]">
            <Tag tone={row.status === "passed" ? "mint" : row.status === "in_progress" ? "brand" : "neutral"}>{STATUS[row.status]}</Tag>
            {row.lastActive && <span>Last worked on {shortDate(row.lastActive)}</span>}
          </p>
        </div>
        <RowAction row={row} />
      </div>
      {row.found.length > 0 && (
        <div data-testid="session-found">
          <Heading>What you found</Heading>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
            {row.found.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {note.filled ? <FilledPart filled={note.filled} /> : <p className="mt-3 text-sm leading-5 text-[var(--muted)] print:hidden">Fills in when you pass this Topic.</p>}
      <SavedItems items={note.saved} />
      <OwnLines topicId={row.topicId} initial={note.lines.map((l) => ({ id: l.id, text: l.text, ...(l.ownRule && { ownRule: true }) }))} />
      {/* Earlier attempts: a Topic started over keeps its old Session here (B3b fills it). */}
      <div data-earlier-attempts={row.topicId} />
    </Card>
  );
}

/**
 * The Notebook: one row per Topic in course order, each with its status, the Session (Resume or Read), what the Learner
 * found and the Topic Note. By default only Topics with a Session or a note; "Show all Topics" lists every one, so a line
 * can be added to a Topic not reached yet. Rows flow down columns (CSS columns) so a short card leaves no gap beside a tall one. Older sessions follow the rows. The page prints: controls are hidden, and a
 * Topic with nothing on it is left out of the paper copy.
 */
export function NotebookView({ notebook, showAll }: { notebook: Notebook; showAll: boolean }) {
  return (
    // One Case Data cache for the page, so saved Widgets drawing the same Case fetch it once.
    <CaseDataProvider>
      <UndoProvider>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <h1 className="text-xl font-semibold leading-7">Notebook</h1>
            <TextLink href={showAll ? "/notebook" : "/notebook?all=1"} data-show-all={showAll} className="text-sm leading-5 print:hidden">
              {showAll ? "Show only Topics with something in them" : "Show all Topics"}
            </TextLink>
          </div>
          <p className="measure mb-6 text-sm leading-5 text-[var(--muted)] print:hidden">
            For each Topic: your Session, what you found and your notes. Add lines of your own to any Topic. Print this page for a paper copy.
          </p>
          {notebook.rows.length === 0 && (
            <p data-notebook-empty className="text-sm leading-5">
              Nothing here yet. Study a Topic, or save a reply while you study, and it shows here. Show all Topics to add a line of your own.
            </p>
          )}
          <div className="columns-[420px] gap-[var(--gap)]">
            {notebook.rows.map((row) => (
              <Row key={row.topicId} row={row} />
            ))}
          </div>
          {notebook.older.length > 0 && (
            <section aria-labelledby="older-sessions" className="mt-8 flex flex-col gap-3">
              <h2 id="older-sessions" className="text-sm font-semibold leading-5 text-[var(--muted)]">
                Older sessions
              </h2>
              <ul className="card-grid">
                {notebook.older.map((s) => (
                  <li key={s.id} className="relative flex flex-col gap-2 rounded-lg border border-[var(--border)] p-4 hover:bg-[var(--hairline)]">
                    <TextLink href={`/sessions/${s.id}`} className="self-start text-xs font-semibold uppercase leading-4 tracking-[0.08em] after:absolute after:inset-0 after:content-['']">
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

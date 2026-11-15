import type { ReactNode } from "react";
import type { ClerkDirectory } from "@/auth/clerk-directory";
import type { SpendReport } from "@/tutor/spend";
import { overBudget, seconds, SPEED_BUDGETS, WIDGET_SAVE_BUDGET, SPEED_WINDOW_DAYS, type SpeedReport, type Spread } from "@/tutor/speed";
import { shortDate } from "../past-sessions";
import { TextLink } from "../primitives/link";
import { Card, Tag } from "../ui";

/** A section's heading: Settings' (Inter Tight 18/24 at 600), under the section's hairline (ADR 0013). */
const heading = "mb-3 [font-family:var(--font-display)] text-[18px] font-semibold leading-6 tracking-[-0.012em]";
/** A list: hairlines between the rows and under the last, as Settings → Your Topics. */
const list = "divide-y divide-[var(--rule)] border-b border-[var(--rule)]";
/** A row: what on the left, its figure on the right, wrapping on a narrow screen. */
const row = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3";

/**
 * Clerk Dashboard pages for who may come in. `~` is the application and instance the owner last opened there, so the
 * same link serves the development and the production instance.
 */
export const CLERK_WAITLIST_URL = "https://dashboard.clerk.com/~/users/waitlist";
export const CLERK_USERS_URL = "https://dashboard.clerk.com/~/users";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Spend in dollars to the cent; an amount too small to show as a cent reads "<$0.01", never "$0.00". */
export function usd(v: number): string {
  return v > 0 && v < 0.005 ? "<$0.01" : dollars.format(v);
}
const count = (n: number) => n.toLocaleString("en-US");
const steps = (n: number) => `${count(n)} ${n === 1 ? "step" : "steps"}`;
const turnsWord = (n: number) => `${count(n)} ${n === 1 ? "turn" : "turns"}`;
/** A figure's cell in the Spend table: right-aligned, digits the same width so the cents line up. */
const figure = "whitespace-nowrap py-3 pl-3 text-right align-top tabular-nums";

/** Reply kinds (GLOSSARY) in plain words; a kind not listed reads as its code with spaces. */
const KIND_WORDS: Record<string, string> = {
  answer_question: "Answer to a question",
  feedback: "Feedback",
  rule: "Rule",
  worked_example: "Worked example",
  quick_try: "Quick try",
  reteach: "Re-teach",
  drill: "Drill",
  hint: "Hint",
  offer_park: "Offer to park",
  go_deeper: "Go deeper",
  simpler: "Simpler",
  own_question: "Own question (streamed)",
};
const kindWords = (kind: string | null) => (kind === null ? "No kind chosen" : (KIND_WORDS[kind] ?? kind.replaceAll("_", " ")));
const timesWord = (n: number) => `${count(n)} ${n === 1 ? "time" : "times"}`;

/** One median or 95th-percentile cell: seconds with one decimal, or a dash when no turn had that time. */
function SpreadCell({ ms }: { ms: number | null }) {
  return <td className={figure}>{ms === null ? <span aria-label="no times">–</span> : seconds(ms)}</td>;
}
const spreadCells = (s: Spread) => (
  <>
    <SpreadCell ms={s.medianMs} />
    <SpreadCell ms={s.p95Ms} />
  </>
);

/** Tutor speed (spec 2026-11-12, A9): turn times by Reply kind over the last 30 days, the budgets, and what went wrong. */
function SpeedSection({ speed }: { speed: SpeedReport }) {
  const { ownQuestionFirstWord: own, stepLedComplete: step } = SPEED_BUDGETS;
  const th = "whitespace-nowrap py-2 pl-3 text-right font-medium";
  return (
    <Card variant="rule" id="speed" aria-labelledby="speed-heading">
      <h2 id="speed-heading" className={heading}>
        Tutor speed
      </h2>
      <p className="measure mb-3 text-sm leading-5 text-[var(--muted)]">
        How long Learners waited in the last {SPEED_WINDOW_DAYS} days, by Reply kind: until the model&apos;s first event, until the first word showed, and until the reply was complete. The median is the
        middle turn; at the 95th percentile, only 1 turn in 20 was slower.
      </p>
      {!speed.available ? (
        <p className="measure text-sm leading-5" data-speed="unavailable">
          Not available yet: the database does not record turn times until migration 0037 is applied.
        </p>
      ) : (
        <>
          {speed.kinds.length === 0 ? (
            <p className="mb-3 text-sm leading-5 text-[var(--muted)]">No timed turns in the last {SPEED_WINDOW_DAYS} days.</p>
          ) : (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm leading-5">
                <thead>
                  <tr className="border-b border-[var(--rule)] text-xs leading-4 text-[var(--muted)]">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">
                      Reply kind
                    </th>
                    <th scope="col" className={th}>
                      Turns
                    </th>
                    <th scope="col" className={th}>
                      First event, median
                    </th>
                    <th scope="col" className={th}>
                      First event, 95th
                    </th>
                    <th scope="col" className={th}>
                      First word, median
                    </th>
                    <th scope="col" className={th}>
                      First word, 95th
                    </th>
                    <th scope="col" className={th}>
                      Complete, median
                    </th>
                    <th scope="col" className={th}>
                      Complete, 95th
                    </th>
                    <th scope="col" className={th}>
                      Budget
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule)] border-b border-[var(--rule)]">
                  {speed.kinds.map((k) => (
                    <tr key={k.kind ?? ""} data-kind={k.kind ?? "none"}>
                      <th scope="row" className="py-3 pr-3 text-left align-top font-semibold">
                        {kindWords(k.kind)}
                      </th>
                      <td className={figure}>{count(k.turns)}</td>
                      {spreadCells(k.firstEvent)}
                      {spreadCells(k.firstWord)}
                      {spreadCells(k.complete)}
                      <td className={figure} data-budget={String(overBudget(k))}>
                        {overBudget(k) === null ? "–" : overBudget(k) ? "Over" : "Within"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="measure mb-3 text-xs leading-4 text-[var(--muted)]" data-speed="budgets">
            Budgets: a reply to the Learner&apos;s own question shows its first word within {seconds(own.medianMs)} at the median and {seconds(own.p95Ms)} at the 95th
            percentile; a step-led reply (every other kind) is complete within {seconds(step.medianMs)} and {seconds(step.p95Ms)}.
          </p>
          <ul className={list} data-speed="problems">
            <li className={row}>
              <span>Sessions repaired instead of failing the turn</span>
              <span className="text-right tabular-nums">
                <span className="font-semibold">{count(speed.incidents.total)}</span>
                {speed.incidents.byKind.length > 0 && (
                  <span className="text-[var(--muted)]"> ({speed.incidents.byKind.map((i) => `${i.kind.replaceAll("_", " ")}: ${timesWord(i.n)}`).join(", ")})</span>
                )}
              </span>
            </li>
            <li className={row}>
              <span>Streamed replies that slipped a check (shown as they were)</span>
              <span className="font-semibold tabular-nums">{count(speed.softCheckSlips)}</span>
            </li>
            <li className={row}>
              <span>Streamed replies the guard stopped mid-reply</span>
              <span className="font-semibold tabular-nums">{count(speed.guardStops)}</span>
            </li>
            <li className={row} data-speed="widget-saves">
              <span>
                Widget saves over {seconds(WIDGET_SAVE_BUDGET.medianMs)} (the median budget), and over {seconds(WIDGET_SAVE_BUDGET.p95Ms)} (the 95th percentile budget)
              </span>
              <span className="font-semibold tabular-nums">
                {count(speed.widgetSaves.overMedian)} / {count(speed.widgetSaves.overP95)}
              </span>
            </li>
          </ul>
        </>
      )}
    </Card>
  );
}

function When({ label, date }: { label: string; date: Date }) {
  return (
    <span>
      {label} <time dateTime={date.toISOString()}>{shortDate(date)}</time>
    </span>
  );
}

/**
 * Who a row is: the email Clerk has for them first, as their identity (the Learner name is whatever they chose), or
 * their Clerk user id when there is no email to show; then the Learner name and the rest, muted.
 */
function Who({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="break-all text-sm font-semibold leading-5">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-[var(--muted)]">{children}</p>
    </div>
  );
}

/** Spend (GLOSSARY): what each person's Tutor has cost, this month and all time, most this month first. Read only. */
function SpendSection({ spend, directory, you }: { spend: SpendReport; directory: ClerkDirectory; you: string }) {
  return (
    <Card variant="rule" id="spend" aria-labelledby="spend-heading">
      <h2 id="spend-heading" className={heading}>
        Spend
      </h2>
      <p className="measure mb-3 text-sm leading-5 text-[var(--muted)]">
        What each person&apos;s Tutor costs you, estimated at list prices from every model call made for them. Tutor model calls only (gpt-6.1-sol, and Claude
        before the switch): library searches and the weekly library refresh are not counted. The month starts on the 1st, India time.
      </p>
      <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-5" data-spend="total">
        <span>
          <span className="font-semibold tabular-nums">{usd(spend.total.monthUsd)}</span> this month
        </span>
        <span>
          <span className="font-semibold tabular-nums">{usd(spend.total.allTimeUsd)}</span> all time
        </span>
        <span className="text-[var(--muted)]">{turnsWord(spend.total.turns)}</span>
      </p>
      {spend.total.unpricedSteps > 0 && (
        <p className="measure mb-3 text-xs leading-4 text-[var(--warning)]">
          {steps(spend.total.unpricedSteps)} used a model with no price in the table, so they are missing from these figures.
        </p>
      )}
      {!directory.answered && spend.people.length > 0 && (
        <p role="status" className="measure mb-3 text-xs leading-4 text-[var(--warning)]">
          Clerk did not answer, so each person shows by their Clerk user id, and nobody is marked as having lost access.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm leading-5">
          <thead>
            <tr className="border-b border-[var(--rule)] text-xs leading-4 text-[var(--muted)]">
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                Person
              </th>
              <th scope="col" className="whitespace-nowrap py-2 pl-3 text-right font-medium">
                Turns
              </th>
              <th scope="col" className="whitespace-nowrap py-2 pl-3 text-right font-medium">
                This month
              </th>
              <th scope="col" className="whitespace-nowrap py-2 pl-3 text-right font-medium">
                All time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule)] border-b border-[var(--rule)]">
            {spend.people.map((p) => {
              const found = directory.people.get(p.userId);
              // Banned in Clerk, or deleted there: either way they can no longer sign in.
              const accessRemoved = directory.answered && (!found || found.banned);
              return (
                <tr key={p.userId} data-user={p.userId}>
                  <td className="py-3 pr-3 align-top">
                    <Who label={found?.email ?? p.userId}>
                      <span>{p.name}</span>
                      {p.userId === you && <Tag tone="brand">You</Tag>}
                      {accessRemoved && <Tag tone="danger">Access removed</Tag>}
                      {p.lastActiveAt ? <When label="Last active" date={p.lastActiveAt} /> : <span>No turns yet</span>}
                      {p.unpricedSteps > 0 && <span>{steps(p.unpricedSteps)} unpriced</span>}
                    </Who>
                  </td>
                  <td className={figure}>{count(p.turns)}</td>
                  <td className={`${figure} font-semibold`}>{usd(p.monthUsd)}</td>
                  <td className={figure}>{usd(p.allTimeUsd)}</td>
                </tr>
              );
            })}
            {spend.unlinked && (
              <tr data-spend="unlinked">
                <td className="py-3 pr-3 align-top">
                  <Who label="Not linked to a Clerk account">
                    <span>From before Clerk, the test tools and passcodes</span>
                    {spend.unlinked.lastActiveAt && <When label="Last active" date={spend.unlinked.lastActiveAt} />}
                    {spend.unlinked.unpricedSteps > 0 && <span>{steps(spend.unlinked.unpricedSteps)} unpriced</span>}
                  </Who>
                </td>
                <td className={figure}>{count(spend.unlinked.turns)}</td>
                <td className={`${figure} font-semibold`}>{usd(spend.unlinked.monthUsd)}</td>
                <td className={figure}>{usd(spend.unlinked.allTimeUsd)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Who may come in: Clerk's to decide (Waitlist mode, issue #33), so this section only says how and links there. */
function PeopleSection() {
  return (
    <Card variant="rule" id="people" aria-labelledby="people-heading">
      <h2 id="people-heading" className={heading}>
        Who may come in
      </h2>
      <p className="measure mb-3 text-sm leading-5">
        Clerk decides. Someone new asks on the /join page and waits on Clerk&apos;s Waitlist; invite them there and Clerk emails them a link to sign up.
      </p>
      <p className="measure mb-3 text-sm leading-5">To take someone&apos;s access away, ban them under Users in Clerk. Their past spend stays here.</p>
      <ul className={list}>
        <li className={row}>
          <TextLink href={CLERK_WAITLIST_URL} target="_blank" rel="noreferrer">
            Waitlist in Clerk
          </TextLink>
        </li>
        <li className={row}>
          <TextLink href={CLERK_USERS_URL} target="_blank" rel="noreferrer">
            Users in Clerk
          </TextLink>
        </li>
      </ul>
    </Card>
  );
}

export type AdminViewProps = {
  /** Spend per person (src/tutor/spend.ts). */
  spend: SpendReport;
  /** Tutor speed over the last 30 days (src/tutor/speed.ts). */
  speed: SpeedReport;
  /** Each person's email and ban, from Clerk (src/auth/clerk-directory.ts). */
  directory: ClerkDirectory;
  /** The admin's own Clerk user id, so their row reads You. */
  you: string;
};

/**
 * The /admin page's body (issue #33), read only. Sections under Settings' hairline rules, no boxes (ADR 0013): Spend
 * (what each person's Tutor has cost, this month and all time, most this month first), Tutor speed (turn times by
 * Reply kind against the A9 budgets) and Who may come in (links to Clerk, where that is decided).
 */
export function AdminView({ spend, speed, directory, you }: AdminViewProps) {
  return (
    <div>
      <h1 className="type-h1">Admin</h1>
      <p className="measure mt-2 text-sm leading-5 text-[var(--muted)]">What the Tutor costs and how fast it answers. Who may come in is decided in Clerk.</p>
      <div className="mt-8 grid gap-x-[var(--gap)] gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <SpendSection spend={spend} directory={directory} you={you} />
          <SpeedSection speed={speed} />
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <PeopleSection />
        </div>
      </div>
    </div>
  );
}

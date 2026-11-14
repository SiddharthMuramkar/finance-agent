import type { ReactNode } from "react";
import type { DeniedPerson, PendingInvite, PersonWithAccess, SignInMethod, WaitingRequest } from "@/auth/access";
import type { SpendReport } from "@/tutor/spend";
import { overBudget, seconds, SPEED_BUDGETS, WIDGET_SAVE_BUDGET, SPEED_WINDOW_DAYS, type SpeedReport, type Spread } from "@/tutor/speed";
import { shortDate } from "../past-sessions";
import { Card, PrimaryButton, Tag } from "../ui";
import { ApproveButton, RowActions } from "./admin-controls";
import { ADMIN_DONE, type AdminDone, type AdminSection } from "./done";

/** A section's heading: Settings' (Inter Tight 18/24 at 600), under the section's hairline (ADR 0013). */
const heading = "mb-3 [font-family:var(--font-display)] text-[18px] font-semibold leading-6 tracking-[-0.012em]";
/** A list: hairlines between the rows and under the last, as Settings → Your Topics. */
const list = "divide-y divide-[var(--rule)] border-b border-[var(--rule)]";
/** A row: who on the left, buttons on the right, wrapping (a confirm takes a line of its own). */
const row = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3";

const VIA: Record<SignInMethod, string> = { google: "Google", "email-link": "Email link" };

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
 * Who a row is: the email first, as their identity (anyone can ask for a link in any name, and a Google name is
 * whatever they set), then the name, how they signed in and when, muted.
 */
function Who({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="break-all text-sm font-semibold leading-5">{email}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-[var(--muted)]">{children}</p>
    </div>
  );
}

/** The result of the last change, when it belongs to this section: a status, or an alert when not all was done. */
function DoneLine({ done, section }: { done: AdminDone | null; section: AdminSection }) {
  if (!done || ADMIN_DONE[done].section !== section) return null;
  const { text, problem } = ADMIN_DONE[done];
  return (
    <p role={problem ? "alert" : "status"} className={`measure mb-3 text-sm leading-5 ${problem ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
      {text}
    </p>
  );
}

export type AdminViewProps = {
  waiting: readonly WaitingRequest[];
  people: readonly PersonWithAccess[];
  invited: readonly PendingInvite[];
  denied: readonly DeniedPerson[];
  signupOpen: boolean;
  /** Spend per person (src/tutor/spend.ts). */
  spend: SpendReport;
  /** Tutor speed over the last 30 days (src/tutor/speed.ts). */
  speed: SpeedReport;
  /** The result of the change that just sent the owner back here (?done=), if any. */
  done: AdminDone | null;
};

/**
 * The /admin page's body (ADR 0014): who may use Value It. Sections under Settings' hairline rules, no boxes (ADR 0013):
 * Waiting (people who signed in and wait: Approve or Deny), People with access (the owner first, as You; Remove access
 * for the rest; then the invites nobody has used yet), Spend (what each person's Tutor has cost, this month and all
 * time, most this month first), Tutor speed (turn times by Reply kind against the A9 budgets, read only), Denied (only
 * when someone is: Approve lets them back with their progress), Invite an email (the page's one primary button) and
 * Sign-up (the switch, read-only, with the command that turns it). A change's result shows in the section it lands in.
 */
export function AdminView({ waiting, people, invited, denied, signupOpen, spend, speed, done }: AdminViewProps) {
  return (
    <div>
      <h1 className="type-h1">Admin</h1>
      <p className="measure mt-2 text-sm leading-5 text-[var(--muted)]">
        Who may use Value It. Anyone can sign in with Google or an email link; new people wait here until you approve them.
      </p>
      <div className="mt-8 grid gap-x-[var(--gap)] gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <Card variant="rule" id="waiting" aria-labelledby="waiting-heading">
            <h2 id="waiting-heading" className={`${heading} flex items-center gap-2`}>
              Waiting
              {waiting.length > 0 && <Tag tone="warning">{waiting.length}</Tag>}
            </h2>
            <DoneLine done={done} section="waiting" />
            {waiting.length === 0 ? (
              <p className="text-sm leading-5 text-[var(--muted)]">Nobody is waiting.</p>
            ) : (
              <ul className={list}>
                {waiting.map((w) => (
                  <li key={w.userId} data-user={w.userId} className={row}>
                    <Who email={w.email}>
                      {w.name && <span>{w.name}</span>}
                      <Tag>{VIA[w.via]}</Tag>
                      <When label="Asked" date={w.requestedAt} />
                    </Who>
                    <RowActions userId={w.userId} email={w.email} kind="deny" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card variant="rule" id="people" aria-labelledby="people-heading">
            <h2 id="people-heading" className={heading}>
              People with access
            </h2>
            <DoneLine done={done} section="people" />
            <ul className={list}>
              {people.map((p) => (
                <li key={p.userId} data-user={p.userId} className={row}>
                  <Who email={p.email}>
                    <span>Learner: {p.name}</span>
                    <Tag>{VIA[p.via]}</Tag>
                    <When label="Since" date={p.signedUpAt} />
                  </Who>
                  {p.isOwner ? <Tag tone="brand">You</Tag> : <RowActions userId={p.userId} email={p.email} kind="remove" />}
                </li>
              ))}
            </ul>
            {invited.length > 0 && (
              <>
                <h3 className="mb-1 mt-6 text-sm font-semibold leading-5">Invited, not signed in yet</h3>
                <ul className={list}>
                  {invited.map((i) => (
                    <li key={i.id} className={row}>
                      <Who email={i.email}>
                        {i.note && <span>{i.note}</span>}
                        {i.learnerName && <span>Learner: {i.learnerName}</span>}
                        <When label="Invited" date={i.invitedAt} />
                      </Who>
                    </li>
                  ))}
                </ul>
                <p className="measure mt-2 text-xs leading-4 text-[var(--muted)]">
                  To take an invite back, run <code className="break-all font-mono">npm run invites -- remove &lt;email&gt;</code>.
                </p>
              </>
            )}
          </Card>

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
                  {spend.people.map((p) => (
                    <tr key={p.userId} data-user={p.userId}>
                      <td className="py-3 pr-3 align-top">
                        <Who email={p.email}>
                          <span>{p.name}</span>
                          {p.isOwner && <Tag tone="brand">You</Tag>}
                          {p.accessRemoved && <Tag tone="danger">Access removed</Tag>}
                          {p.lastActiveAt ? <When label="Last active" date={p.lastActiveAt} /> : <span>No turns yet</span>}
                          {p.unpricedSteps > 0 && <span>{steps(p.unpricedSteps)} unpriced</span>}
                        </Who>
                      </td>
                      <td className={figure}>{count(p.turns)}</td>
                      <td className={`${figure} font-semibold`}>{usd(p.monthUsd)}</td>
                      <td className={figure}>{usd(p.allTimeUsd)}</td>
                    </tr>
                  ))}
                  {spend.unlinked && (
                    <tr data-spend="unlinked">
                      <td className="py-3 pr-3 align-top">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-5">Not linked to a sign-in</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-[var(--muted)]">
                            <span>The test tools and passcodes</span>
                            {spend.unlinked.lastActiveAt && <When label="Last active" date={spend.unlinked.lastActiveAt} />}
                            {spend.unlinked.unpricedSteps > 0 && <span>{steps(spend.unlinked.unpricedSteps)} unpriced</span>}
                          </p>
                        </div>
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

          <SpeedSection speed={speed} />

          {(denied.length > 0 || (done !== null && ADMIN_DONE[done].section === "denied")) && (
            <Card variant="rule" id="denied" aria-labelledby="denied-heading">
              <h2 id="denied-heading" className={heading}>
                Denied
              </h2>
              <DoneLine done={done} section="denied" />
              <p className="measure mb-2 text-sm leading-5 text-[var(--muted)]">They can&apos;t come in. Approve someone to let them back in with their progress.</p>
              {denied.length > 0 && (
                <ul className={list}>
                  {denied.map((d) => (
                    <li key={d.userId} data-user={d.userId} className={row}>
                      <Who email={d.email}>
                        {d.name && <span>{d.name}</span>}
                        <Tag>{VIA[d.via]}</Tag>
                        <When label="Denied" date={d.deniedAt} />
                      </Who>
                      <ApproveButton userId={d.userId} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <Card variant="rule" id="invite" aria-labelledby="invite-heading">
            <h2 id="invite-heading" className={heading}>
              Invite an email
            </h2>
            <DoneLine done={done} section="invite" />
            <p className="measure mb-3 text-sm leading-5">
              Let someone in ahead of time: they sign in with Google or an email link and come straight in. Nothing is sent to them, so tell them yourself.
            </p>
            <form action="/api/admin/invites" method="post" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="invite-email" className="text-sm font-medium leading-5">
                  Email
                </label>
                <input id="invite-email" name="email" type="email" required maxLength={254} autoComplete="off" spellCheck={false} className="field w-full" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="invite-note" className="text-sm font-medium leading-5">
                  Note <span className="font-normal text-[var(--muted)]">(optional, only you see it)</span>
                </label>
                <input id="invite-note" name="note" type="text" maxLength={200} autoComplete="off" className="field w-full" />
              </div>
              <PrimaryButton type="submit" className="self-start">
                Invite
              </PrimaryButton>
            </form>
          </Card>

          <Card variant="rule" id="sign-up" aria-labelledby="sign-up-heading">
            <h2 id="sign-up-heading" className={heading}>
              Sign-up
            </h2>
            <p className="measure flex flex-wrap items-center gap-2 text-sm leading-5">
              <Tag tone={signupOpen ? "warning" : "neutral"}>{signupOpen ? "Open" : "Closed"}</Tag>
              {signupOpen
                ? "Anyone who signs in comes straight in. People you denied stay out."
                : "New people wait here for you. Invited emails come straight in."}
            </p>
            <p className="measure mt-2 text-xs leading-4 text-[var(--muted)]">
              It changes only from a terminal: <code className="break-all font-mono">INVITES_DB_OK=&lt;database host&gt; npm run invites -- open</code> (or{" "}
              <code className="font-mono">close</code>).
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

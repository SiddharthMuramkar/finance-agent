import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCourseMap } from "@/course/map";
import { signedInLearner } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadPassageView } from "@/library/library";
import { MACHINE_READ_NOTE } from "@/library/pictures";
import { accountFor } from "../../account";
import { readTheme } from "../../theme-cookie";
import { Eyebrow, ReadingPage, SignedInFrame } from "../../ui";

export const dynamic = "force-dynamic";

/** The citation's block range from `?blocks=from-to`, as the Tutor's citation marker gives it. */
function blockRange(
  value: string | string[] | undefined,
): { from: number; to: number } | undefined {
  const m = typeof value === "string" ? /^(\d+)-(\d+)$/.exec(value) : null;
  return m ? { from: Number(m[1]), to: Number(m[2]) } : undefined;
}

/**
 * Where a citation in a Tutor reply leads: the Library passage behind the claim, with the cited
 * sentences marked, its credit line, licence and a link to the original. Under the as-of rule and
 * each source's quote limit (see loadPassageView). No model call.
 */
export default async function PassagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const learner = await signedInLearner();
  const view = await loadPassageView(
    { db: getDb(), map: loadCourseMap(), learnerId: learner.id },
    id,
    blockRange((await searchParams).blocks),
  );
  if (view.status === "missing") notFound();
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <ReadingPage theme={theme} account={await accountFor(getDb(), learner)}>
        <Eyebrow className="mb-1">Library passage</Eyebrow>
        {view.status === "hidden" ? (
          <p data-testid="passage-hidden">
            This passage is hidden until the reveal: the Case you are studying
            is set on {view.asOf}, and this passage could tell how it turned
            out.
          </p>
        ) : (
          <article>
            <h1 className="type-h1 mb-6">{view.heading}</h1>
            {/* Reading type (16/26) at a readable measure, behind a hairline rule. */}
            <blockquote
              data-testid="passage-text"
              className="max-w-[68ch] border-l-2 border-[var(--rule)] pl-5 text-[16px] leading-[26px]"
            >
              {view.sentences.map((s, i) =>
                s.cited ? (
                  <mark
                    key={i}
                    className="rounded border-b-2 border-[var(--src)] bg-[var(--src-tag)] text-[var(--ink)]"
                  >
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </blockquote>
            {view.machineRead && (
              <p data-testid="passage-machine-read" className="mt-3 text-sm text-[var(--muted)]">
                {MACHINE_READ_NOTE}
              </p>
            )}
            {view.shortened && (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Shortened: this source allows quotes of at most{" "}
                {view.quoteWords} words. Read the full text at the original.
              </p>
            )}
            <p data-testid="passage-credit" className="mt-6 text-sm">
              {view.credit}
              {view.publishedOn && `, published ${view.publishedOn}`}. Licence:{" "}
              {view.licence}.
            </p>
            <a
              href={view.url}
              target="_blank"
              rel="noopener"
              data-affordance="link"
              className="link mt-1 inline-block text-sm"
            >
              Read it at the original
            </a>
          </article>
        )}
        <Link
          href="/study"
          data-affordance="link"
          className="link mt-10 inline-block text-sm"
        >
          Back to the Study Workspace
        </Link>
      </ReadingPage>
    </SignedInFrame>
  );
}

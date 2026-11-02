import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadPassageView } from "@/library/library";

export const dynamic = "force-dynamic";

/** The citation's block range from `?blocks=from-to`, as the Tutor's citation marker gives it. */
function blockRange(value: string | string[] | undefined): { from: number; to: number } | undefined {
  const m = typeof value === "string" ? /^(\d+)-(\d+)$/.exec(value) : null;
  return m ? { from: Number(m[1]), to: Number(m[2]) } : undefined;
}

/**
 * Where a citation in a Tutor reply leads: the Library passage behind the claim, with the cited
 * sentences marked, its credit line, licence and a link to the original. Under the as-of rule and
 * each source's quote limit (see loadPassageView). No model call.
 */
export default async function PassagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const view = await loadPassageView({ db: getDb(), map: loadCourseMap() }, id, blockRange((await searchParams).blocks));
  if (view.status === "missing") notFound();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <p className="mb-1 text-sm text-stone-500 dark:text-stone-400">Library passage</p>
      {view.status === "hidden" ? (
        <p data-testid="passage-hidden">
          This passage is hidden until the reveal: the Case you are studying is set on {view.asOf}, and this passage could tell how it turned out.
        </p>
      ) : (
        <article>
          <h1 className="mb-4 text-lg font-semibold">{view.heading}</h1>
          <blockquote data-testid="passage-text" className="border-l-2 border-stone-300 pl-4 leading-relaxed dark:border-stone-700">
            {view.sentences.map((s, i) =>
              s.cited ? (
                <mark key={i} className="rounded bg-amber-100 text-inherit dark:bg-amber-900/50">
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </blockquote>
          {view.shortened && (
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
              Shortened: this source allows quotes of at most {view.quoteWords} words. Read the full text at the original.
            </p>
          )}
          <p data-testid="passage-credit" className="mt-6 text-sm">
            {view.credit}
            {view.publishedOn && `, published ${view.publishedOn}`}. Licence: {view.licence}.
          </p>
          <a href={view.url} target="_blank" rel="noopener" className="mt-1 inline-block text-sm underline">
            Read it at the original
          </a>
        </article>
      )}
      <Link href="/" className="mt-8 block text-sm text-stone-500 hover:underline">
        Back to the Study Workspace
      </Link>
    </main>
  );
}

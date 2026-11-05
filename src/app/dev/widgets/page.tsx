import Link from "next/link";
import { notFound } from "next/navigation";
import { fixtureList, loadCases, parseState, readFixture, resolveFixture } from "./fixtures";
import { ButtonSheet } from "./button-sheet";
import { WidgetHarness } from "./harness";
import { HARNESS_WIDTHS, type HarnessWidth } from "./widths";

// The Widget harness (developer tool): any fixture Widget program, drawn by the real WidgetView in a frame like the
// Study aside, at a chosen width and theme. It does not exist in production. Reads fixtures and Case Data JSON on the
// server; needs no database and no model call.
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function WidgetsDevPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const fixture = resolveFixture(first(params.fixture));

  if (!fixture) {
    return (
      <main className="mx-auto max-w-5xl p-6 text-[var(--ink)]">
        <h1 className="text-xl font-semibold leading-7">Widget harness</h1>
        <p className="mt-1 text-sm leading-5 text-[var(--muted)]">Each fixture drawn by the real renderer, at the panel widths of the Study page.</p>
        <ul className="mt-4 divide-y divide-[var(--border)]" data-testid="fixture-index">
          {fixtureList().map((f) => (
            <li key={f} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2" data-fixture={f}>
              <span className="min-w-0 flex-1 text-sm">{f}</span>
              {HARNESS_WIDTHS.map((w) => (
                <Link key={w} href={`/dev/widgets?fixture=${encodeURIComponent(f.slice(f.indexOf("/") + 1))}&width=${w}`} className="text-sm underline">
                  {w}px
                </Link>
              ))}
            </li>
          ))}
        </ul>
        <ButtonSheet />
      </main>
    );
  }

  const width = Number(first(params.width));
  return (
    <WidgetHarness
      code={readFixture(fixture)}
      title={fixture}
      width={(HARNESS_WIDTHS as readonly number[]).includes(width) ? (width as HarnessWidth) : 480}
      theme={first(params.theme) === "dark" ? "dark" : "light"}
      values={parseState(first(params.state))}
      cases={loadCases()}
    />
  );
}

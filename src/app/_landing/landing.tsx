import { Eyebrow, Pill } from "../ui";
import { copy, DRAFT } from "./copy";
import { landingStats, type LandingStats } from "./stats";

const bigButton = "inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-medium leading-6 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

/** The public page at "/" for a signed-out visitor. It shows counts only: no Learner data, no Library text. */
export function LandingView({ stats }: { stats: LandingStats }) {
  const columns = [
    { value: stats.topics, label: copy.stats.topics },
    { value: String(stats.cases), label: copy.stats.cases },
    { value: String(stats.librarySources), label: copy.stats.sources },
  ];
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-10 border-b border-[var(--hairline)] bg-[var(--bg)]/90 backdrop-blur-[8px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-base font-semibold">{copy.brand}</span>
          <a href="/login" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
            {copy.signIn}
          </a>
        </div>
      </header>

      <main>
        <section
          className="bg-[linear-gradient(to_right,color-mix(in_srgb,var(--hairline)_40%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--hairline)_40%,transparent)_1px,transparent_1px)] bg-[size:40px_40px]"
        >
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
            <div className="flex flex-wrap items-center gap-2">
              <Pill brand>{copy.badge}</Pill>
              {DRAFT && <Pill>Draft</Pill>}
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-[44px] tracking-[-1px] sm:text-[56px] sm:leading-[60px] sm:tracking-[-1.5px]">
              {copy.headline[0]}
              <br />
              <span className="text-[var(--brand)]">{copy.headline[1]}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-7 text-[var(--muted)]">{copy.subtext}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/login" className={`${bigButton} bg-[var(--brand)] text-[var(--brand-ink)] hover:bg-[var(--brand-hover)]`}>
                {copy.signIn}
              </a>
              <a href="#how" className={`${bigButton} border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--hairline)]`}>
                {copy.howItWorks}
              </a>
            </div>

            <div className="mt-14">
              <figure className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                <div className="flex gap-1.5 border-b border-[var(--hairline)] px-3 py-2" aria-hidden>
                  <span className="size-2.5 rounded-full bg-[var(--border)]" />
                  <span className="size-2.5 rounded-full bg-[var(--border)]" />
                  <span className="size-2.5 rounded-full bg-[var(--border)]" />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots served by the proxy's asset rule */}
                <img src="/landing-assets/workspace-light.png" alt={copy.screenshotAlt} width={1280} height={800} className="block h-auto w-full dark:hidden" />
                {/* eslint-disable-next-line @next/next/no-img-element -- as above, the dark-mode copy */}
                <img src="/landing-assets/workspace-dark.png" alt={copy.screenshotAlt} width={1280} height={800} className="hidden h-auto w-full dark:block" />
              </figure>
              {/* Below the screenshot, not over it, so the Tutor's composer row stays visible at every width. */}
              <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 sm:ml-auto sm:max-w-[440px] sm:gap-4">
                {columns.map((c) => (
                  <div key={c.label} className="flex flex-col-reverse">
                    <dt className="text-xs leading-4 text-[var(--muted)]">{c.label}</dt>
                    <dd className="whitespace-nowrap text-xl font-bold leading-8 text-[var(--brand)] sm:text-[28px] sm:leading-9">{c.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:px-6">
          <Eyebrow>{copy.how.eyebrow}</Eyebrow>
          <h2 className="mt-2 text-2xl font-bold leading-8 tracking-[-0.6px] sm:text-4xl sm:leading-10 sm:tracking-[-0.9px]">{copy.how.title}</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {copy.how.steps.map((step, i) => (
              <li key={step.name} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-semibold text-[var(--brand-ink)]">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-xl font-semibold leading-7">{step.name}</h3>
                  <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{step.line}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-[var(--navy-deep)] text-[var(--brand-ink)]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-[var(--navy-accent)]">{copy.sources.eyebrow}</p>
            <h2 className="mt-2 text-2xl font-bold leading-8 tracking-[-0.6px] sm:text-4xl sm:leading-10 sm:tracking-[-0.9px]">{copy.sources.title}</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2">
              {copy.sources.points.map((point, i) => (
                <li key={point.name}>
                  <p className="text-[28px] font-bold leading-9 text-[var(--navy-accent)]">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-1 text-xl font-semibold leading-7">{point.name}</h3>
                  <p className="mt-1 text-sm leading-5 text-[var(--navy-muted)]">{point.line}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="bg-[var(--navy-deeper)] text-[var(--navy-muted)]">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm leading-5 sm:px-6">{copy.footer}</div>
      </footer>
    </div>
  );
}

/** Loads the counts (the database part cached for a day) and renders the landing page. */
export async function LandingPage() {
  return <LandingView stats={await landingStats()} />;
}

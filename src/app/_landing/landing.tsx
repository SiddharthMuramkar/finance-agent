import { loadCourseMap } from "@/course/map";
import { navigate, type Place } from "@/course/navigator";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { Eyebrow, Pill } from "../ui";
import { copy, DRAFT } from "./copy";
import { landingStats, type LandingStats } from "./stats";

const bigButton = "inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-medium leading-6 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

/** The signed-in Learner's main button: what it says and, for Resume and Start, which Topic. Every one opens /study. */
export type HomeButton = { kind: "resume" | "start"; topic: string } | { kind: "open" };

/**
 * The button rule, from the place the Course Navigator returns: no place (every Topic passed, no Check due)
 * opens the workspace; a Topic not started is Start; any other place is Resume, which includes a passed Topic
 * with a required Check due.
 */
export function homeButton(place: Place | null): HomeButton {
  if (!place) return { kind: "open" };
  return { kind: place.status === "not_started" ? "start" : "resume", topic: place.topic.title };
}

const buttonLabel = (b: HomeButton) => (b.kind === "open" ? copy.openStudyWorkspace : `${b.kind === "resume" ? copy.resume : copy.start} ${b.topic}`);

/**
 * Home, at "/". It shows counts only: no Learner data, no Library text. Signed out, the top bar and hero offer
 * Sign in; signed in (a `button` is given), the top bar links the Study Workspace and the hero button is `button`'s label.
 */
export function LandingView({ stats, button }: { stats: LandingStats; button?: HomeButton }) {
  const signedIn = button !== undefined;
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
          <a href={signedIn ? "/study" : "/login"} className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
            {signedIn ? copy.studyWorkspace : copy.signIn}
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
              <a href={signedIn ? "/study" : "/login"} className={`${bigButton} bg-[var(--brand)] text-[var(--brand-ink)] hover:bg-[var(--brand-hover)]`}>
                {button ? buttonLabel(button) : copy.signIn}
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

/**
 * Loads the counts (the database part cached for a day) and renders Home. Signed in, it also reads saved
 * progress to name the Learner's place. It only reads: no model call, nothing written. If progress can't be
 * loaded the error is logged and the button falls back to "Open Study Workspace".
 */
export async function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  const stats = await landingStats();
  if (!signedIn) return <LandingView stats={stats} />;
  let button: HomeButton = { kind: "open" };
  try {
    button = homeButton(navigate(loadCourseMap(), await loadProgress(getDb())));
  } catch (error) {
    console.error("Home could not load the Learner's place", error);
  }
  return <LandingView stats={stats} button={button} />;
}

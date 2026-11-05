import { loadCourseMap, type CourseMap } from "@/course/map";
import { whatComesNext, type Progress } from "@/course/navigator";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { Eyebrow, Pill, SignOutButton } from "../ui";
import { copy } from "./copy";
import { HomeWidget } from "./home-widget";
import { homeWidget, type HomeWidgetData } from "./home-widget-data";
import { landingStats, type LandingStats } from "./stats";

const bigButton = "inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-medium leading-6 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

const topBarLink = "text-sm text-[var(--muted)] hover:text-[var(--ink)]";

/**
 * The signed-in Learner's main button: what it says and, for Resume, Start and What comes next, which Topic it
 * opens (through /api/open, the Learner's current Topic); every one lands on /study.
 */
export type HomeButton = { kind: "resume" | "start"; topic: string } | { kind: "next"; label: string } | { kind: "open" };

/**
 * The button rule: What comes next, from the Course Navigator. The chosen Topic not yet passed is Resume (Start
 * if not begun); else a Due Check ("New in <Topic>: Check N →" or "New in <Topic>: Explore →"); else the next
 * Topic on the default path ("Next Topic: <title> →"), which is Start for a Learner who has begun nothing. With
 * every Topic passed and nothing due it opens the workspace. A passed Topic is never Resume.
 */
export function homeButton(map: CourseMap, progress: Progress): HomeButton {
  const next = whatComesNext(map, progress);
  if (!next) return { kind: "open" };
  const begun = progress.topics[next.topic.id] !== undefined;
  if (next.kind === "chosen") return { kind: begun ? "resume" : "start", topic: next.topic.title };
  if (next.kind === "next_topic" && Object.keys(progress.topics).length === 0) return { kind: "start", topic: next.topic.title };
  return { kind: "next", label: `${next.label} →` };
}

const buttonLabel = (b: HomeButton) =>
  b.kind === "open" ? copy.openStudyWorkspace : b.kind === "next" ? b.label : `${b.kind === "resume" ? copy.resume : copy.start} ${b.topic}`;

/**
 * Home, at "/": counts and the Widget's Case Data (as of its Case's as-of date), no Learner data or Library text. With no `button` (signed out) the top bar and hero offer
 * Sign in; with one, the top bar links the Study Workspace beside Sign out and the hero button shows its label.
 * `widget` is Present value's live annuity Widget, drawn under the hero (with "Sign in to learn why →" when signed out).
 */
export function LandingView({ stats, button, widget }: { stats: LandingStats; button?: HomeButton; widget?: HomeWidgetData | null }) {
  // Signed out, the main button is Start learning, to the passcode page; signed in, the Learner's own button.
  const hero = button ? { href: "/study", label: buttonLabel(button) } : { href: "/login", label: copy.startLearning };
  const heroClass = `${bigButton} bg-[var(--brand)] text-[var(--brand-ink)] hover:bg-[var(--brand-hover)]`;
  // Resume, Start and What comes next open the Learner's current Topic, so its Session shows at once (a passed Topic left on
  // screen gives way): a form posting to /api/open, which goes on to /study.
  const mainButton =
    button && button.kind !== "open" ? (
      <form action="/api/open" method="post" className="contents">
        <button type="submit" className={heroClass}>
          {hero.label}
        </button>
      </form>
    ) : (
      <a href={hero.href} className={heroClass}>
        {hero.label}
      </a>
    );
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-10 border-b border-[var(--hairline)] bg-[var(--bg)]/90 backdrop-blur-[8px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-base font-semibold">{copy.brand}</span>
          {button ? (
            <div className="flex items-center gap-4">
              <a href="/study" className={topBarLink}>
                {copy.studyWorkspace}
              </a>
              <SignOutButton unstyled className={topBarLink}>{copy.signOut}</SignOutButton>
            </div>
          ) : (
            <a href="/login" className={topBarLink}>
              {copy.signIn}
            </a>
          )}
        </div>
      </header>

      <main>
        <section
          className="bg-[linear-gradient(to_right,color-mix(in_srgb,var(--hairline)_40%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--hairline)_40%,transparent)_1px,transparent_1px)] bg-[size:40px_40px]"
        >
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
            <div className="flex flex-wrap items-center gap-2">
              <Pill brand>{copy.badge}</Pill>
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-[44px] tracking-[-1px] sm:text-[56px] sm:leading-[60px] sm:tracking-[-1.5px]">
              {copy.headline[0]}
              <br />
              <span className="text-[var(--brand)]">{copy.headline[1]}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-7 text-[var(--muted)]">{copy.subtext}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {mainButton}
              <a href="#how" className={`${bigButton} border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--hairline)]`}>
                {copy.howItWorks}
              </a>
            </div>

            <div className="mt-14">
              {widget && (
                <div className="mx-auto max-w-2xl rounded-xl bg-[var(--bg)]">
                  <HomeWidget code={widget.code} cases={widget.cases} />
                  {!button && (
                    <a href="/login" className="mt-3 inline-block text-sm font-medium text-[var(--brand)] hover:underline">
                      {copy.widget.signIn}
                    </a>
                  )}
                </div>
              )}
              <p className="mt-6 text-base font-semibold leading-6 text-[var(--brand)] sm:text-right">{copy.stats(stats)}</p>
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

        <section className="bg-[var(--navy-deep)] text-[var(--navy-ink)]">
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
            <div className="mt-10">{mainButton}</div>
          </div>
        </section>
      </main>

      <footer className="bg-[var(--navy-deeper)] text-[var(--navy-muted)]">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm leading-5 sm:px-6">{copy.footer}</div>
      </footer>
    </div>
  );
}

/** The signed-in Learner's button, from saved progress. Read-only; if progress can't be loaded it logs and falls back to Open. */
export async function loadHomeButton(): Promise<HomeButton> {
  try {
    return homeButton(loadCourseMap(), await loadProgress(getDb(), await currentLearnerId()));
  } catch (error) {
    console.error("Home could not load the Learner's place", error);
    return { kind: "open" };
  }
}

/**
 * Loads the counts and the Widget's Case Data (the database parts each cached for a day) and renders Home; with no
 * `button`, no Learner data is read.
 */
export async function LandingPage({ button }: { button?: HomeButton }) {
  const [stats, widget] = await Promise.all([landingStats(), homeWidget()]);
  return <LandingView stats={stats} button={button} widget={widget} />;
}

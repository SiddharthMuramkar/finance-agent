import { loadCourseMap, type CourseMap } from "@/course/map";
import { whatComesNext, type Progress } from "@/course/navigator";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { Icon } from "@/icons/icon";
import type { IconName } from "@/icons/names";
import { loadProgress } from "@/learner/memory";
import { BarsReplay } from "../bars-replay";
import { RisingBars } from "../rising-bars";
import { HomeFooter, HomeHeader, HomeMainButton, JoinBand, JoinNote, type HomeButton } from "./chrome";
import { copy } from "./copy";
import { HomeJoinEvents } from "./home-events";
import { homeTopicWritten } from "./home-topic";
import { HomeValueLevers } from "./home-value-levers";
import { HomeWidget } from "./home-widget";
import { HowTopicsWork } from "./how-topics-work";
import { ShowcaseTabs } from "./showcase-tabs";
import { loadShowcases, type BuiltShowcase } from "./showcase-widgets";
import { homeWidget, type HomeWidgetData } from "./home-widget-data";
import { landingStats, type LandingStats } from "./stats";

// The Home page keeps its own layout (the home-* classes in globals.css); its buttons are the app's flat buttons (ADR 0013),
// in the big size. The header, footer and main button are chrome.tsx's, shared with the About page.
//
// E8, a fast first view: nothing here imports the general Widget renderer (LiveWidget, WidgetWithSave, OpenUI). The hero's
// Explorable and section 2's Value levers are small components of their own; section 4's ShowcaseTabs loads the renderer
// only when it nears the screen.

export type { HomeButton };
export { HomeMainButton };

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

/**
 * Home, at "/": the sales page (spec 2026-11-12 E1). Top to bottom: 1, the hero on a Band (the promise, and the jackpot
 * Explorable on a white card); 2, "Now value a company" (white); 3, "How every Topic works" on a Band; 4, "More moments from
 * real Topics" (white), three Showcases as tabs; 5, "What you get, and who it is for" (white); 6, the closing Band with the
 * offer. Two Bands never touch. Counts and the Explorable's Case Data (as of its Case's as-of date), no Learner data or
 * Library text. With no `button` (signed out) every main button says Join early access and opens the sign-in page, and the
 * header offers Sign in; with one, the header links the Study Workspace beside Sign out and every main button shows its
 * label. `widget` is what Home's Explorable draws (Present value's annuity and its Case Data), on the hero's card (with
 * "Sign in to learn why →" in it when signed out); with none, the card shows a quiet placeholder. `canOpenTopic` says
 * Spine Topic 1 has a Topic file, so section 2 offers a signed-in Learner "Open this Topic →".
 */
export function LandingView({
  stats,
  button,
  widget,
  showcases = [],
  canOpenTopic = false,
}: {
  stats: LandingStats;
  button?: HomeButton;
  widget?: HomeWidgetData | null;
  showcases?: BuiltShowcase[];
  canOpenTopic?: boolean;
}) {
  // Every main button replays the bars when pointed at or tabbed to.
  const mainButton = (
    <BarsReplay>
      <HomeMainButton button={button} icon={<RisingBars size={18} onBrand />} />
    </BarsReplay>
  );
  return (
    <div className="home">
      <HomeHeader signIn={button ? "learner" : undefined} />
      <HomeJoinEvents />

      <main>
        {/* 1. The hero, a Band: the promise on the left, the Explorable on a white card on the right (second on phones). */}
        <section data-band="home-hero" data-home-section="hero" className="band pb-[clamp(56px,7vw,96px)] pt-[clamp(40px,6vw,80px)]">
          <div className="home-wrap home-cols items-start gap-y-10">
            <div className="col-span-12 lg:col-span-5 lg:pt-6">
              <p className="home-eyebrow">{copy.eyebrow}</p>
              <h1 className="home-display mt-4 text-[clamp(40px,4.4vw,56px)] leading-[1.05] tracking-[-0.03em] max-sm:text-[36px] [text-wrap:balance]">
                {copy.headline.join(" ")}
              </h1>
              <p className="home-lede mt-5">{copy.subtext}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">{mainButton}</div>
              {!button && <JoinNote note={copy.ctaNote} className="home-body mt-3" />}
            </div>

            <div className="col-span-12 lg:col-span-7">
              <p className="home-eyebrow mb-3">{copy.frameLabel}</p>
              {widget ? (
                <HomeWidget annuity={widget.annuity} cases={widget.cases} signedOut={!button} />
              ) : (
                <div data-widget-content data-testid="home-widget" className="band-card home-body flex min-h-[320px] items-center justify-center rounded-xl border border-[var(--rule)] p-4 text-center sm:p-5">
                  {copy.widgetPlaceholder}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 2. Now value a company: Value levers on Amazon in February 2000, in the browser, with no model call (E4). */}
        <HomeValueLevers signedOut={!button} canOpenTopic={canOpenTopic} />

        {/* 3. How every Topic works, a Band. */}
        <HowTopicsWork />

        {/* 4. Three Showcases as tabs, one on screen; the Widget renderer loads only as this nears the screen. */}
        <section id="examples" data-home-section="examples" className="home-wrap home-section">
          <h2 className="home-h2">{copy.showcases.title}</h2>
          <p className="home-lede mt-4 max-w-[40rem]">{copy.showcases.intro(stats)}</p>
          <div className="mt-8">
            <ShowcaseTabs showcases={showcases.map(({ id, words, code, title, topicTitle }) => ({ id, words, code, title, topicTitle }))} />
          </div>
        </section>

        {/* 5. What you get, and who it is for: three items, each with its picture, and two short lists. */}
        <section id="what-you-get" data-home-section="what-you-get" className="home-wrap home-section">
          <hr className="home-rule" />
          <h2 className="home-h2 pt-10">{copy.get.title}</h2>
          <ul className="mt-8 grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-3">
            {copy.get.items.map((item) => (
              <li key={item.name} className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--wash)] text-[var(--ink)]">
                  <Icon name={item.icon as IconName} size={24} />
                </span>
                <h3 className="home-h3">{item.name}</h3>
              </li>
            ))}
          </ul>
          <div id="who-it-is-for" className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
            <div>
              <h3 className="home-h3">{copy.forWho.title}</h3>
              <p className="home-body mt-2">{copy.forWho.line}</p>
            </div>
            <div>
              <h3 className="home-h3">{copy.notWhat.title}</h3>
              <ul className="home-body mt-2 list-disc pl-5">
                {copy.notWhat.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 6. The closing Band, with the offer under its button. */}
        <JoinBand button={button} note={copy.closingNote} />
      </main>

      <HomeFooter />
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

/** Whether Spine Topic 1 has a Topic file on the Course Map (E4's "Open this Topic →"); false if the map can't be read. */
function canOpenHomeTopic(): boolean {
  try {
    return homeTopicWritten(loadCourseMap());
  } catch (error) {
    console.error("Home could not read the Course Map for section 2's Topic", error);
    return false;
  }
}

/**
 * Loads the counts and the Explorable's Case Data (the database parts each cached for a day) and renders Home; with no
 * `button`, no Learner data is read.
 */
export async function LandingPage({ button }: { button?: HomeButton }) {
  const canOpenTopic = !!button && canOpenHomeTopic();
  const [stats, widget] = await Promise.all([landingStats(), homeWidget()]);
  return <LandingView stats={stats} button={button} widget={widget} showcases={loadShowcases()} canOpenTopic={canOpenTopic} />;
}

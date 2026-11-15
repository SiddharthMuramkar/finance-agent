"use client";

import { useMemo, useRef } from "react";
import { SIGN_IN_PATH } from "@/auth/destination";
import { valuationCase } from "@/finance/valuation-cases";
import { leverSpecs, openingSettings, sameSettings, valueLeversStories, valueLeversTasks, type LeverSettings } from "@/widgets/workbench/value-levers-model";
import { ValueLeversView } from "@/widgets/workbench/value-levers-view";
import { track } from "../analytics";
import { LinkButton } from "../primitives";
import { copy } from "./copy";
import { HOME_TOPIC_ID } from "./home-topic";

/**
 * Home's section 2, "Now value a company" (spec 2026-11-12 E4, Appendix F): a white reading area straight under the hero's
 * Band, with its title, the three sentences that set the scene and one caption on the left, and the Value levers Widget
 * (B3) on Amazon in February 2000 on the right, drawn by WS-B's `ValueLeversView`, the same code as Spine Topic 1's.
 *
 * Everything runs in the browser: the Case is read from the Case registry (no database, no Case Data route), the value
 * from the valuation engine, and nothing is saved. There is no model call and no request to the Tutor, signed in or out.
 * E8: this file and what it imports never reach the general Widget renderer (LiveWidget, WidgetWithSave, OpenUI), so
 * section 2 paints from Home's first scripts (home-value-levers.test.tsx walks its imports).
 *
 * No Insight on Home (B3, C5): the chip "A story worth $84" appears "only after the Topic's Insight is settled", and Spine
 * Topic 1's Insight is found when the Learner reaches a story worth the price "and says what they changed", to the Tutor.
 * Home has no Topic, Session or Tutor, so its Insight is never settled here and the third chip never shows; the visitor
 * meets it in the Topic. E10: the first change to the levers (a slider, or a story chip that moves them) and the price
 * found are each sent once, with nothing about the visitor.
 *
 * Signed in, "Open this Topic →" opens Spine Topic 1 (E4), shown only while that Topic has a file (`canOpenTopic`, from
 * the Course Map on the server): an outline Topic with no file cannot be opened, and the form would land on /study at
 * whatever Topic is current.
 */

/** Amazon in February 2000, the course's running company (C4), as Spine Topic 1 opens it. */
export const HOME_CASE_ID = "amazon-dcf-2000";

/**
 * From 1,024 px, the Widget in two columns, so section 2 keeps Home a quarter shorter than the audited page (E1): the
 * value, the stories and the four levers on the left; More settings, the cash-flow bars and the Things to try on the
 * right. CSS columns over the view's own parts, so the view stays the Topic's code; the right column always starts at
 * More settings, so nothing moves between columns while the visitor plays. Below 1,024 px it is one column, as in the Topic.
 */
const TWO_COLUMNS = [
  "lg:[&_[data-testid=value-levers]]:columns-2",
  "lg:[&_[data-testid=value-levers]]:gap-x-6",
  "[&_[data-testid=value-levers]>*]:break-inside-avoid",
  "lg:[&_[data-testid=value-levers-more]]:break-before-column",
].join(" ");

export function HomeValueLevers({ signedOut = false, canOpenTopic = false, caseId = HOME_CASE_ID }: { signedOut?: boolean; canOpenTopic?: boolean; caseId?: string }) {
  const words = copy.valueCompany;
  const widget = useMemo(() => {
    const block = valuationCase(caseId);
    if (!block) return null;
    const specs = leverSpecs(block);
    // The Topic's stories without the one held back for its Insight, which Home never settles.
    const stories = valueLeversStories(block, specs, { caseStory: words.caseStory }).filter((story) => !story.afterInsight);
    return { block, stories, tasks: valueLeversTasks(block), opening: openingSettings(specs) };
  }, [caseId, words.caseStory]);
  // Once per visit, even if the Widget is drawn again.
  const sent = useRef({ move: false, price: false });
  const levers = useRef<LeverSettings | null>(null);
  // The first change to the levers, by a slider or by a story chip that moves them all (B3), as the hero counts its
  // chips (E10). A chip that leaves every lever where it is, such as "Damodaran's story" at the opening, moves nothing.
  const leversChanged = (next: LeverSettings) => {
    const before = levers.current ?? widget?.opening;
    levers.current = next;
    if (sent.current.move || (before && sameSettings(before, next))) return;
    sent.current.move = true;
    track("home_lever_first_move");
  };
  const priceFound = () => {
    if (sent.current.price) return;
    sent.current.price = true;
    track("home_price_found");
  };

  return (
    <section id="value-a-company" data-home-section="value-a-company" className="home-wrap home-section">
      <div className="home-cols items-start gap-y-8">
        <div className="col-span-12 lg:col-span-4">
          <h2 className="home-h2">{words.title}</h2>
          <p className="home-lede mt-4">{words.intro}</p>
          <p className="home-body mt-4">{words.caption}</p>
        </div>
        <div className="col-span-12 min-w-0 lg:col-span-8">
          {widget ? (
            <div data-widget-content data-testid="home-value-levers" className={`rounded-xl border border-[var(--rule)] bg-[var(--frame)] p-4 sm:p-5 ${TWO_COLUMNS}`}>
              <ValueLeversView block={widget.block} stories={widget.stories} tasks={widget.tasks} onLeversChange={leversChanged} onPriceFound={priceFound} />
            </div>
          ) : (
            <div data-widget-content data-testid="home-value-levers" className="home-body flex min-h-[360px] items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--frame)] p-4 text-center sm:p-5">
              {copy.widgetPlaceholder}
            </div>
          )}
          {signedOut ? (
            <a href={SIGN_IN_PATH} data-affordance="link" className="link mt-3 inline-block text-sm font-medium">
              {words.signIn}
            </a>
          ) : canOpenTopic ? (
            <form method="post" action="/api/open" className="mt-3 text-sm font-medium">
              <input type="hidden" name="topic" value={HOME_TOPIC_ID} />
              <LinkButton type="submit">{words.open}</LinkButton>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}

import { CompoundWidget, JackpotWidget, LeversWidget, RatesWidget, WeWorkWidget } from "@/components/signal";
import type { ExampleWidget } from "@/site/examples";

// The site mounts the five Signal widgets directly (decision #5: one fixed component each, no OpenUI on first paint), per
// the widget contract: no required props, an optional caseSlug.

const WIDGETS = { jackpot: JackpotWidget, levers: LeversWidget, wework: WeWorkWidget, rates: RatesWidget, compound: CompoundWidget } as const;

/** The widget that draws `kind`, at `slug`'s numbers. */
export function SignalWidget({ kind, slug }: { kind: ExampleWidget; slug: string }) {
  const Widget = WIDGETS[kind];
  return <Widget caseSlug={slug} />;
}

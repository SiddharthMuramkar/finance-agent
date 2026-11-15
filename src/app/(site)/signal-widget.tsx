import { CompoundWidget, JackpotWidget, LeversWidget, RatesWidget, WeWorkWidget, type SignalCall } from "@/components/signal";
import type { ExampleWidget } from "@/site/examples";

// The site mounts the five Signal widgets directly (decision #5: one fixed component each, no OpenUI on first paint), per
// the widget contract: no required props, an optional caseSlug, compact for the hero conversation (spec 7.2.1), and
// onCall, which fires once on the learner's call (spec 5.6) and unlocks the Tutor's answer and the ending.

const WIDGETS = { jackpot: JackpotWidget, levers: LeversWidget, wework: WeWorkWidget, rates: RatesWidget, compound: CompoundWidget } as const;

/** The widget that draws `kind`, at `slug`'s numbers. */
export function SignalWidget({ kind, slug, compact = false, onCall }: { kind: ExampleWidget; slug: string; compact?: boolean; onCall?: (call: SignalCall) => void }) {
  const Widget = WIDGETS[kind];
  return <Widget caseSlug={slug} compact={compact} onCall={onCall} />;
}

// The five Signal widgets (spec §6), one fixed client component each (decision #5). Site pages mount them directly, with
// no OpenUI on first paint. None needs a prop: each defaults to its spec Case. `caseSlug` names that Case (a slug a widget
// does not know renders nothing), `compact` is the hero conversation's mode, and `onCall` fires once on the learner's call.

export { CompoundWidget } from "./CompoundWidget";
export { JackpotWidget } from "./JackpotWidget";
export { LeversWidget, LeverStage, leverText } from "./LeversWidget";
export { RatesWidget } from "./RatesWidget";
export { WeWorkWidget } from "./WeWorkWidget";
export type { SignalCall, SignalEvent, SignalWidgetProps, Verdict } from "./parts";

/** Each widget's own Case slug (spec §7.1), for a page that maps `/examples/[slug]` to its widget. */
export const SIGNAL_WIDGET_CASES = {
  JackpotWidget: "mega-millions-2018",
  LeversWidget: "amazon-2000",
  WeWorkWidget: "wework-2019",
  RatesWidget: "rates-up-1",
  CompoundWidget: "compounding-1000",
} as const;

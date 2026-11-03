"use client";

import { Renderer } from "@openuidev/react-lang";
import { Component, useMemo, useState, type ReactNode } from "react";
import type { CaseLoad } from "@/widgets/case-data-client";
import { answers, widgetProblems, widgetQueries, type WrittenQuery } from "@/widgets/check";
import { GenuiTheme } from "@/widgets/genui-theme";
import { WidgetBorderContext, widgetLibrary } from "@/widgets/library";
import { settingsFrom } from "@/widgets/settings";
import type { WidgetToolName } from "@/widgets/tool-specs";
import { createWidgetTools, type WidgetToolProvider } from "@/widgets/tools";

const FALLBACK = "This widget could not be drawn. The lesson carries on without it.";

function Fallback() {
  return (
    <p role="status" className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm leading-5 text-[var(--muted)]">
      {FALLBACK}
    </p>
  );
}

/** Catches a widget that throws while rendering, so it can't break the page. */
class Contain extends Component<{ code: string; children: ReactNode }, { failed: boolean; code: string }> {
  state = { failed: false, code: this.props.code };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  // New code (more of a streaming widget, or a correction) gets a fresh try.
  static getDerivedStateFromProps(props: { code: string }, state: { code: string }) {
    return props.code === state.code ? null : { failed: false, code: props.code };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

/** While a widget's tools fetch data (a Case's data the first time): a small spinner in our colours, top right. */
const LOADING = (
  <span role="status" aria-label="Loading data" className="absolute right-0 top-0 size-3 animate-spin rounded-full border-2 border-[var(--hairline)] border-t-[var(--brand)]" />
);

/**
 * How one tool call of a widget went: the call (its tool and arguments, also as text), when it was made (a later
 * call counts over an earlier one, whichever answers first), and its error in plain words, none when it worked.
 */
export type ToolOutcome = { call: string; tool: WidgetToolName; args: unknown; order: number; error?: string };

/**
 * What to say under a finished widget: for each of its Queries, the error of the latest call answering it, when
 * that call failed. The browser does not say which Query a call is for, so the written-out arguments tell (see
 * `answers`): a Query whose dataset a Select picks loses its message once a pick works, and one Query's success
 * never hides another's failure. A call that answers none of the Queries stands for itself.
 */
export function failedQueries(queries: WrittenQuery[], outcomes: ToolOutcome[]): string[] {
  const latest = new Map<string, ToolOutcome>();
  for (const outcome of outcomes) {
    const answered = queries.filter((q) => answers(q, outcome.tool, outcome.args)).map((q) => q.statementId);
    for (const query of answered.length ? answered : [outcome.call]) {
      if ((latest.get(query)?.order ?? 0) < outcome.order) latest.set(query, outcome);
    }
  }
  return [...new Set([...latest.values()].flatMap((outcome) => (outcome.error ? [outcome.error] : [])))];
}

/** The Widget tools, each reporting how its call went; `loadCase` is the widget's shared Case loads, if it has some. */
function reportingTools(loadCase: CaseLoad | undefined, report: (outcome: ToolOutcome) => void): WidgetToolProvider {
  const tools = createWidgetTools({ fetchCaseData: loadCase });
  let calls = 0;
  const reporting =
    <K extends WidgetToolName>(tool: K) =>
    async (args: Record<string, unknown>) => {
      const order = ++calls;
      const result = await tools[tool](args);
      try {
        report({ call: JSON.stringify([tool, args]), tool, args, order, error: result.error });
      } catch {
        // A call that cannot be written down goes unreported; the chart still gets its rows.
      }
      return result;
    };
  return {
    case_data: reporting("case_data"),
    calculate: reporting("calculate"),
    calculate_range: reporting("calculate_range"),
    annuity_schedule: reporting("annuity_schedule"),
  };
}

/**
 * One widget drawn with its own Widget tools, so its Queries get numbers from our code in the browser
 * (three Queries on one Case make one request). Under a finished widget, each Query whose latest call
 * failed says why in one quiet line; moving a slider back to numbers the Query can use clears it.
 */
function DrawnWidget({
  code,
  complete,
  onSettings,
  loadCase,
}: {
  code: string;
  complete: boolean;
  onSettings?: (settings: Record<string, number>) => void;
  loadCase?: CaseLoad;
}) {
  // The latest outcome of each different call, by its text.
  const [outcomes, setOutcomes] = useState<Record<string, ToolOutcome>>({});
  const tools = useMemo(
    () => reportingTools(loadCase, (outcome) => setOutcomes((now) => ((now[outcome.call]?.order ?? 0) > outcome.order ? now : { ...now, [outcome.call]: outcome }))),
    [loadCase],
  );
  const queries = useMemo(() => (complete ? widgetQueries(code) : []), [code, complete]);
  const messages = complete ? failedQueries(queries, Object.values(outcomes)) : [];
  return (
    <>
      <GenuiTheme>
        <Renderer
          response={code}
          library={widgetLibrary}
          isStreaming={!complete}
          toolProvider={tools}
          queryLoader={LOADING}
          onStateUpdate={onSettings && ((state) => onSettings(settingsFrom(state)))}
        />
      </GenuiTheme>
      {messages.map((message) => (
        <p key={message} role="status" className="mt-2 text-xs leading-4 text-[var(--muted)]">
          {`This chart's data could not be loaded: ${message}`}
        </p>
      ))}
    </>
  );
}

/**
 * Which widget the code is: more of the same code streaming in keeps its number, and different code (a
 * correction) takes the next one, so it starts with fresh tools, messages and sliders. Messages are not
 * cleared on every streamed piece: a query that already ran is not run again, so its message would be lost.
 */
function useWidgetNumber(code: string): number {
  const [seen, setSeen] = useState({ code, number: 0 });
  if (seen.code === code) return seen.number;
  const number = code.startsWith(seen.code) ? seen.number : seen.number + 1;
  setSeen({ code, number });
  return number;
}

/**
 * One generated widget. Controls change state in the browser only: moving a slider never calls the model,
 * and a Query re-runs one of our Widget tools. A finished widget that fails the check shows a
 * plain fallback instead. `bare` drops the Widget's own border, for a card that already frames it.
 * `onSettings` hears the numbers on the Widget's sliders each time the Learner moves one (for "Save to notes").
 * `loadCase` shares the Widget's Case Data loads with whatever else reads them beside it (its Sourced strip).
 */
export function WidgetView({
  code,
  complete,
  bare = false,
  onSettings,
  loadCase,
}: {
  code: string;
  complete: boolean;
  bare?: boolean;
  onSettings?: (settings: Record<string, number>) => void;
  loadCase?: CaseLoad;
}) {
  const number = useWidgetNumber(code);
  if (complete && widgetProblems(code).length) return <Fallback />;
  return (
    <Contain code={code}>
      <WidgetBorderContext.Provider value={!bare}>
        <DrawnWidget key={number} code={code} complete={complete} onSettings={onSettings} loadCase={loadCase} />
      </WidgetBorderContext.Provider>
    </Contain>
  );
}

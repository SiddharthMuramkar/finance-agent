"use client";

import { Renderer } from "@openuidev/react-lang";
import { Component, type ReactNode } from "react";
import { widgetProblems } from "@/widgets/check";
import { WidgetBorderContext, widgetLibrary } from "@/widgets/library";

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

/**
 * One generated widget. Controls change state in the browser only: moving a
 * slider never calls the model. A finished widget that fails the check shows a
 * plain fallback instead. `bare` drops the Widget's own border, for a card that already frames it.
 */
export function WidgetView({ code, complete, bare = false }: { code: string; complete: boolean; bare?: boolean }) {
  if (complete && widgetProblems(code).length) return <Fallback />;
  return (
    <Contain code={code}>
      <WidgetBorderContext.Provider value={!bare}>
        <Renderer response={code} library={widgetLibrary} isStreaming={!complete} />
      </WidgetBorderContext.Provider>
    </Contain>
  );
}

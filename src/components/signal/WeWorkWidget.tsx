"use client";

// The Signal WeWork widget (spec §6.6, "a pace is not revenue"). Five beats tell the story one at a time and reveal one bar
// each; the call appears on beat 5, and the first tap opens Go deeper with the loss per dollar of revenue. Everything on
// screen is what the merged model (src/finance/signal/wework.ts) returns for the state, so the widget and the Tutor agree.

import { useState } from "react";
import { Button } from "@/app/primitives";
import { answerCall, nextBeat, startAgain, WEWORK_START, weworkView, type WeworkOptionId, type WeworkState } from "@/finance/signal/wework";
import { CallFieldset, GoDeeper, isOwnCase, TableView, useFirstCall, WidgetFoot, WidgetHead, WidgetShell, type SignalOption, type SignalWidgetProps } from "./parts";

/** The WeWork widget's Case (spec A.3). */
export const WEWORK_CASE = "wework-2019";

/** The call's options with their verdicts and feedback, as the model gives them once an option is chosen. */
const OPTIONS: SignalOption[] = weworkView({ beat: 5, answer: null }).call!.options.map(({ id, label }) => {
  const answer = weworkView({ beat: 5, answer: id }).call!.answer!;
  return { id, label, verdict: answer.verdict, feedback: answer.feedback };
});

/** The WeWork widget: what a run rate tells you about revenue earned. */
export function WeWorkWidget({ caseSlug, compact = false, onCall, onEvent }: SignalWidgetProps) {
  const [state, setState] = useState<WeworkState>(WEWORK_START);
  const fireCall = useFirstCall({ onCall, onEvent });

  if (!isOwnCase(caseSlug, WEWORK_CASE)) return null;

  const view = weworkView(state);
  const chosen = OPTIONS.find((o) => o.id === state.answer) ?? null;

  function pick(option: SignalOption) {
    if (state.answer !== null) return; // the first call stands
    setState((s) => answerCall(s, option.id as WeworkOptionId));
    fireCall({ id: option.id, label: option.label, verdict: option.verdict, feedback: option.feedback });
  }

  return (
    <WidgetShell kind="wework" caseSlug={WEWORK_CASE} compact={compact} label="WeWork’s $3 billion run rate">
      {!compact && <WidgetHead right="Aug 2019" title="WeWork’s $3 billion run rate" sub="What the share-sale filing said, and what Asha found in it, one beat at a time." />}

      <div className="sig-beat" key={view.card.number} aria-live="polite" data-beat={view.card.number}>
        <span className="sig-beat-who">
          {view.card.number} of 5 · {view.card.speaker}
        </span>
        <p className="sig-beat-text">{view.card.text}</p>
      </div>

      <div className="sig-beat-row">
        <Button unstyled className="sig-btn sig-btn-secondary sig-btn-sm" disabled={view.next.disabled} onClick={() => setState(nextBeat)}>
          {view.next.label}
        </Button>
        <ol className="sig-dots" aria-label={`Beat ${view.card.number} of 5`}>
          {view.dots.map((on, i) => (
            <li key={i} className={on ? "is-on" : undefined} />
          ))}
        </ol>
        <Button unstyled className="sig-btn sig-btn-quiet sig-btn-sm" onClick={() => setState(startAgain())}>
          Start again
        </Button>
      </div>

      <div className="sig-stage">
        <div className="sig-bars" role="img" aria-label={view.bars.map((b) => `${b.label}: ${b.shown ? `${b.valueText}, ${b.note}` : "not shown yet"}`).join(". ")}>
          {view.bars.map((b) => (
            <div key={b.id} className={`sig-bar-row${b.shown ? "" : " is-hidden"}`} data-row={b.id} aria-hidden="true">
              <div className="sig-bar-top">
                <span>{b.label}</span>
                <output>{b.valueText}</output>
              </div>
              <div className="sig-bar-track">
                <div className={`sig-bar-fill is-${b.kind}`} style={{ width: `${b.widthPercent}%` }} />
              </div>
              <p className="sig-bar-note">{b.note}</p>
            </div>
          ))}
        </div>
      </div>

      {view.call && <CallFieldset question={view.call.question} options={OPTIONS} marked={new Set(chosen ? [chosen.id] : [])} last={chosen} onPick={pick} />}

      <GoDeeper open={view.goDeeper !== null} title={view.goDeeper?.title ?? ""}>
        {view.goDeeper && (
          <>
            <p>{view.goDeeper.sentence}</p>
            <div className="sig-bars">
              {view.goDeeper.bars.map((b) => (
                <div key={b.label} className="sig-bar-row" data-deeper={b.kind}>
                  <div className="sig-bar-top">
                    <span>{b.label}</span>
                    <output>{b.valueText}</output>
                  </div>
                  <div className="sig-bar-track">
                    <div className={`sig-bar-fill is-${b.kind}`} style={{ width: `${b.widthPercent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </GoDeeper>

      <WidgetFoot
        keys={[
          { swatch: "claim", label: "Claimed, not yet earned" },
          { swatch: "ink", label: "Recorded" },
          { swatch: "loss", label: "Loss" },
        ]}
        source="Source: WeWork S-1, 14 Aug 2019."
        link={{ name: "WeWork S-1, 14 Aug 2019", href: "https://www.sec.gov/Archives/edgar/data/1533523/000119312519220499/d781982ds1.htm" }}
        table={
          !compact && chosen ? (
            <TableView label="The three figures" head={["Figure", "Amount", "Period"]} rows={view.bars.map((b) => [b.label, b.valueText, b.note])} />
          ) : undefined
        }
      />
    </WidgetShell>
  );
}

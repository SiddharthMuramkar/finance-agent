"use client";

import { useMemo } from "react";
import { Icon } from "@/icons/icon";
import { niceUp } from "./bench";
import { BenchFigure, BenchHeadline, BenchLeverControl, BenchNumbers, BenchTasks, toneFill, useBenchSettings, useBenchTasks, type BenchViewProps } from "./bench-view";
import { DECODER_CAPTION, multipleDecoderLevers, multipleDecoderModel, multipleDecoderTasks, type DecoderLeverId, type DecoderMark, type MultipleDecoderData } from "./multiple-decoder-model";

// Multiple decoder, drawn (spec 2026-11-12, B4; Spine Topic 12): growth, risk and margin, the multiple they justify, and on one
// scale beside it what the company and its peers trade at. The scale is by tens (1×, 10×, 100×), so 1.4× and 26× both show.
// Each company's row may carry the Topic file's Icon and its one short sourced fact ("604,000 desks"), so WeWork and IWG read
// as two near-equal desk piles priced far apart rather than two dots (T33, F6). The Icon is a line drawing (ADR 0018) in the
// row's own muted text colour, never a tinted box, and it adds no accent of its own (ADR 0015).

export function MultipleDecoderView({ data, levers: given, onLeversChange, ticked = [], onTicked, onFirstLeverMove }: { data: MultipleDecoderData } & BenchViewProps<DecoderLeverId>) {
  const levers = useMemo(() => multipleDecoderLevers(data), [data]);
  const tasks = useMemo(() => multipleDecoderTasks(data), [data]);
  const { settings, move } = useBenchSettings(levers, given, onLeversChange, onFirstLeverMove);
  const model = multipleDecoderModel(data, settings);
  const reached = useBenchTasks(tasks, model.conditions, ticked, onTicked);
  return (
    <div data-testid="multiple-decoder" className="min-w-0">
      <BenchHeadline headline={model.headline} warn={model.multiple === null || model.multiple <= 0} testId="multiple-decoder-headline" />
      <BenchNumbers numbers={model.numbers} testId="multiple-decoder-numbers" />
      <div className="mt-2" data-testid="multiple-decoder-controls">
        {levers.map((lever) => (
          <BenchLeverControl key={lever.id} lever={lever} value={settings[lever.id]} onChange={(v) => move(lever.id, v)} />
        ))}
      </div>
      <BenchFigure caption={DECODER_CAPTION} testId="multiple-decoder-scale">
        <Scale marks={model.marks} />
      </BenchFigure>
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

/** The lowest multiple on the scale. */
const LOWEST = 0.3;

/**
 * The columns every row of the scale shares: the words (the Icon, the name and the fact under it), then the line the dot
 * sits on. The words keep the 9rem the other Workbench charts use, so the scale is as long at 360 px as it was: the fact
 * stands under the name rather than beside it, which is why a row can hold both without taking the line's room.
 */
const ROW = "grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2 text-xs text-[var(--muted)]";

/** One row per mark on a shared scale by tens: the settings' own in mint, the market's in sunflower. */
function Scale({ marks }: { marks: readonly DecoderMark[] }) {
  const top = niceUp(Math.max(10, ...marks.map((m) => m.multiple)) * 1.3);
  const at = (m: number) => ((Math.log10(Math.max(LOWEST, m)) - Math.log10(LOWEST)) / (Math.log10(top) - Math.log10(LOWEST))) * 100;
  const ticks = [1, 10, 100, 1000].filter((t) => t < top);
  const said = (m: DecoderMark) => `${m.label}${m.note ? ` (${m.note})` : ""}: ${m.text}`;
  return (
    <div role="img" aria-label={marks.map(said).join("; ")} className="mt-1 space-y-1" data-testid="multiple-decoder-marks">
      {marks.map((m) => (
        <div key={m.label} className={`${ROW} items-center`} data-mark={m.yours ? "yours" : "market"}>
          <span className="flex min-w-0 items-center gap-1.5">
            {m.icon && <Icon name={m.icon} size={16} className="shrink-0" />}
            <span className="min-w-0">
              <span className="block truncate">{m.label}</span>
              {m.note && (
                <span className="block truncate text-[var(--muted)]" data-note="">
                  {m.note}
                </span>
              )}
            </span>
          </span>
          <span className="relative h-3">
            <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--border)]" />
            <svg viewBox="0 0 12 12" className="absolute top-0 size-3 -translate-x-1/2" style={{ left: `${at(m.multiple)}%` }} aria-hidden="true">
              <circle cx={6} cy={6} r={6} fill={toneFill(m.yours ? "gain" : "history")}>
                <title>{said(m)}</title>
              </circle>
            </svg>
          </span>
        </div>
      ))}
      <div className={ROW}>
        <span />
        <span className="relative h-4">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${at(t)}%` }}>
              {t}×
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

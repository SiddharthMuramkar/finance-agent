"use client";

import { useMemo } from "react";
import { BarRows, BenchFigure, BenchHeadline, BenchLeverControl, BenchNumbers, BenchTasks, useBenchSettings, useBenchTasks, type BarTone, type BenchViewProps } from "./bench-view";
import { cashWaterfallLevers, cashWaterfallModel, cashWaterfallTasks, WATERFALL_CAPTION, type CashWaterfallData, type WaterfallLeverId, type WaterfallStep } from "./cash-waterfall-model";

// Cash waterfall, drawn (spec 2026-11-12, B4; Spine Topic 3): next year's revenue stepping down through running costs, tax and
// what growth costs to free cash flow.

/** Revenue and operating income stand in ink; what is taken off is a loss; free cash flow is a gain or a loss by its sign. */
function tone(step: WaterfallStep): BarTone {
  if (step.id === "fcf") return step.to >= 0 ? "gain" : "loss";
  if (step.total) return "neutral";
  return step.to <= step.from ? "loss" : "gain";
}

export function CashWaterfallView({ data, levers: given, onLeversChange, ticked = [], onTicked, onFirstLeverMove }: { data: CashWaterfallData } & BenchViewProps<WaterfallLeverId>) {
  const levers = useMemo(() => cashWaterfallLevers(data), [data]);
  const tasks = useMemo(() => cashWaterfallTasks(), []);
  const { settings, move } = useBenchSettings(levers, given, onLeversChange, onFirstLeverMove);
  const model = cashWaterfallModel(data, settings);
  const reached = useBenchTasks(tasks, model.conditions, ticked, onTicked);
  const rows = model.steps.map((s) => ({ id: s.id, label: s.label, from: s.from, to: s.to, text: s.text, tone: tone(s) }));
  return (
    <div data-testid="cash-waterfall" className="min-w-0">
      <BenchHeadline headline={model.headline} warn={model.fcf === null} testId="cash-waterfall-headline" />
      <BenchNumbers numbers={model.numbers} testId="cash-waterfall-numbers" />
      <div className="mt-2" data-testid="cash-waterfall-controls">
        {levers.map((lever) => (
          <BenchLeverControl key={lever.id} lever={lever} value={settings[lever.id]} onChange={(v) => move(lever.id, v)} />
        ))}
      </div>
      <BenchFigure caption={WATERFALL_CAPTION} testId="cash-waterfall-steps">
        <BarRows rows={rows} testId="cash-waterfall-bars" />
      </BenchFigure>
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

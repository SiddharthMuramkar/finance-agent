"use client";

import { useMemo } from "react";
import { Icon } from "@/icons/icon";
import { BarRows, BenchFigure, BenchHeadline, BenchLeverControl, BenchNumbers, BenchTasks, useBenchSettings, useBenchTasks, type BarTone, type BenchViewProps } from "./bench-view";
import { cashWaterfallLevers, cashWaterfallModel, cashWaterfallScene, cashWaterfallTasks, SCENE_MAX_BUILT, WATERFALL_CAPTION, type CashWaterfallData, type WaterfallLeverId, type WaterfallStep } from "./cash-waterfall-model";

// Cash waterfall, drawn (spec 2026-11-12, B4; Spine Topic 3): next year's revenue stepping down through running costs, tax and
// what growth costs to free cash flow.

/** Revenue and operating income stand in ink; what is taken off is a loss; free cash flow is a gain or a loss by its sign. */
function tone(step: WaterfallStep): BarTone {
  if (step.id === "fcf") return step.to >= 0 ? "gain" : "loss";
  if (step.total) return "neutral";
  return step.to <= step.from ? "loss" : "gain";
}

/**
 * Where the cash went (Spine critics round 2, #90): the cash flying out or kept, and a row of buildings that rises and falls
 * with what growth costs, so the Learner sees the cash become things the business owns.
 */
function CashScene({ data, settings }: { data: CashWaterfallData; settings: Parameters<typeof cashWaterfallScene>[1] }) {
  const scene = cashWaterfallScene(data, settings);
  if (!scene.line) return null;
  return (
    <figure data-testid="cash-waterfall-scene" className="mt-3 rounded-lg border border-[var(--hairline)] p-2">
      <div className="flex items-center gap-2" aria-hidden="true">
        <span data-cash={scene.cash} className={`transition-transform duration-300 motion-reduce:transition-none ${scene.cash === "out" ? "-translate-y-1" : ""}`}>
          <Icon name={scene.cash === "out" ? "money-with-wings" : "money-bag"} size={24} />
        </span>
        <span className="text-[var(--muted)]">→</span>
        <span className="flex min-h-6 flex-wrap items-end gap-1">
          {Array.from({ length: SCENE_MAX_BUILT }, (_, i) => (
            <span
              key={i}
              {...(i < scene.built ? { "data-built": "" } : {})}
              className={`transition-all duration-300 motion-reduce:transition-none ${i < scene.built ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
            >
              <Icon name="building-construction" size={20} />
            </span>
          ))}
        </span>
      </div>
      <figcaption className="mt-1 text-sm">{scene.line}</figcaption>
    </figure>
  );
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
      <CashScene data={data} settings={settings} />
      <BenchFigure caption={WATERFALL_CAPTION} testId="cash-waterfall-steps">
        <BarRows rows={rows} testId="cash-waterfall-bars" />
      </BenchFigure>
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

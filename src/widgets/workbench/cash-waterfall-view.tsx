"use client";

import { useMemo } from "react";
import { Chevron } from "@/app/ui";
import { Icon } from "@/icons/icon";
import { isIconName } from "@/icons/names";
import { BarRows, BenchFigure, BenchHeadline, BenchLeverControl, BenchNumbers, BenchTasks, useBenchSettings, useBenchTasks, type BarTone, type BenchViewProps } from "./bench-view";
import {
  cashWaterfallCaption,
  cashWaterfallLevers,
  cashWaterfallModel,
  cashWaterfallScene,
  cashWaterfallTasks,
  type CashWaterfallData,
  type WaterfallLeverId,
  type WaterfallScene,
  type WaterfallStep,
} from "./cash-waterfall-model";

// Cash waterfall, drawn (spec 2026-11-12, B4; Spine Topic 3): next year's revenue stepping down through running costs, tax and
// what growth costs to free cash flow.

/**
 * The bench's small scene (Spine critics round 1 on #89: a bench of only a stat, sliders and bars is chart-only): the
 * company's Icon, one building for each fifth of the growth range it is building for, and a line that reacts to the levers.
 */
function WaterfallSceneView({ scene }: { scene: WaterfallScene }) {
  const icon = isIconName(scene.icon) ? scene.icon : null;
  return (
    <div data-testid="cash-waterfall-scene" data-mood={scene.mood} className="mt-2 flex items-center gap-3 rounded-xl border border-[var(--rule)] border-l-2 border-l-[var(--sun)] bg-[var(--raised)] p-2">
      <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
        {icon && <Icon name={icon} size={32} />}
        {Array.from({ length: scene.buildings }, (_, i) => (
          <Icon key={i} name="building-construction" size={16} />
        ))}
      </span>
      <p className="text-sm leading-5" aria-live="polite">
        {scene.line}
      </p>
    </div>
  );
}

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
  const scene = cashWaterfallScene(data, settings);
  const control = (lever: (typeof levers)[number]) => <BenchLeverControl key={lever.id} lever={lever} value={settings[lever.id]} onChange={(v) => move(lever.id, v)} />;
  const more = levers.filter((l) => l.more);
  return (
    <div data-testid="cash-waterfall" className="min-w-0">
      <BenchHeadline headline={model.headline} warn={model.fcf === null} testId="cash-waterfall-headline" />
      {data.whatIf && (
        <p data-testid="cash-waterfall-what-if" className="text-sm text-[var(--ink-2)]">
          {data.whatIf}
        </p>
      )}
      <BenchNumbers numbers={model.numbers} testId="cash-waterfall-numbers" />
      {scene && <WaterfallSceneView scene={scene} />}
      <div className="mt-2" data-testid="cash-waterfall-controls">
        {levers.filter((l) => !l.more).map(control)}
      </div>
      {more.length > 0 && (
        <details className="group mt-1 border-t border-[var(--hairline)] pt-1" data-testid="cash-waterfall-more">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-[var(--ink-2)] [&::-webkit-details-marker]:hidden">
            <Chevron />
            More settings
          </summary>
          {more.map(control)}
        </details>
      )}
      <BenchFigure caption={cashWaterfallCaption(data)} testId="cash-waterfall-steps">
        <BarRows rows={rows} testId="cash-waterfall-bars" />
      </BenchFigure>
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

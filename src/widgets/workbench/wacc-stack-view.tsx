"use client";

import { useMemo } from "react";
import { BarRows, BenchFigure, BenchHeadline, BenchLeverControl, BenchNumbers, BenchTasks, useBenchSettings, useBenchTasks, type BenchViewProps } from "./bench-view";
import { MarketReadingsView } from "../market-readings-view";
import { STACK_CAPTION, waccStackLevers, waccStackModel, waccStackTasks, type StackLeverId, type WaccStackData } from "./wacc-stack-model";

// Cost of capital stack, drawn (spec 2026-11-12, B4; Spine Topic 7): four levers build the rate in layers, from the risk-free
// rate, through the premium for this company's risk, to the debt in the mix.

export function WaccStackView({ data, levers: given, onLeversChange, ticked = [], onTicked, onFirstLeverMove, readings = [] }: { data: WaccStackData; readings?: readonly string[] } & BenchViewProps<StackLeverId>) {
  const levers = useMemo(() => waccStackLevers(data), [data]);
  const tasks = useMemo(() => waccStackTasks(data), [data]);
  const { settings, move } = useBenchSettings(levers, given, onLeversChange, onFirstLeverMove);
  const model = waccStackModel(data, settings);
  const reached = useBenchTasks(tasks, model.conditions, ticked, onTicked);
  const rows = model.layers.map((l) => ({ id: l.id, label: l.label, from: l.from, to: l.to, text: l.text, tone: "neutral" as const }));
  return (
    <div data-testid="wacc-stack" className="min-w-0">
      <BenchHeadline headline={model.headline} warn={model.total === null} testId="wacc-stack-headline" />
      <BenchNumbers numbers={model.numbers} testId="wacc-stack-numbers" />
      <div className="mt-2" data-testid="wacc-stack-controls">
        {levers.map((lever) => (
          <BenchLeverControl key={lever.id} lever={lever} value={settings[lever.id]} onChange={(v) => move(lever.id, v)} />
        ))}
      </div>
      <BenchFigure caption={STACK_CAPTION} testId="wacc-stack-layers">
        <BarRows rows={rows} testId="wacc-stack-bars" />
      </BenchFigure>
      <MarketReadingsView ids={readings} />
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

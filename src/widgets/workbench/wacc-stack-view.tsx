"use client";

import { useMemo } from "react";
import { Icon } from "@/icons/icon";
import {
  BarRows,
  BenchFigure,
  BenchHeadline,
  BenchLeverControl,
  BenchNumbers,
  BenchTasks,
  useBenchSettings,
  useBenchTasks,
  type BenchViewProps,
} from "./bench-view";
import { MarketReadingsView, caseKnownOn } from "../market-readings-view";
import {
  STACK_CAPTION,
  waccStackLevers,
  waccStackModel,
  waccStackTasks,
  type StackLeverId,
  type WaccStackData,
} from "./wacc-stack-model";

// Cost of capital stack, drawn (spec 2026-11-12, B4; Spine Topic 7): four levers build the rate in layers, from the risk-free
// rate, through the premium for this company's risk, to the debt in the mix. Above the layers, who puts in the money:
// shareholders and lenders, each with its Icon, its share and what it wants (Spine critics on #91).

export function WaccStackView({
  data,
  levers: given,
  onLeversChange,
  ticked = [],
  onTicked,
  onFirstLeverMove,
  readings = [],
}: { data: WaccStackData; readings?: readonly string[] } & BenchViewProps<StackLeverId>) {
  const levers = useMemo(() => waccStackLevers(data), [data]);
  const tasks = useMemo(() => waccStackTasks(data), [data]);
  const { settings, move } = useBenchSettings(
    levers,
    given,
    onLeversChange,
    onFirstLeverMove,
  );
  const model = waccStackModel(data, settings);
  const reached = useBenchTasks(tasks, model.conditions, ticked, onTicked);
  const rows = model.layers.map((l) => ({
    id: l.id,
    label: l.label,
    from: l.from,
    to: l.to,
    text: l.text,
    tone: "neutral" as const,
  }));
  return (
    <div data-testid="wacc-stack" className="min-w-0">
      <BenchHeadline
        headline={model.headline}
        warn={model.total === null}
        testId="wacc-stack-headline"
      />
      <BenchNumbers numbers={model.numbers} testId="wacc-stack-numbers" />
      <div className="mt-2" data-testid="wacc-stack-controls">
        {levers.map((lever) => (
          <BenchLeverControl
            key={lever.id}
            lever={lever}
            value={settings[lever.id]}
            onChange={(v) => move(lever.id, v)}
          />
        ))}
      </div>
      <BenchFigure caption={STACK_CAPTION} testId="wacc-stack-layers">
        <ul
          className="mb-2 flex flex-col gap-1 text-sm"
          data-testid="wacc-stack-funders"
        >
          {model.funders.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2"
              data-testid={`wacc-stack-funder-${f.id}`}
            >
              <Icon name={f.icon} size={16} className="shrink-0" />
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
        <BarRows rows={rows} testId="wacc-stack-bars" />
      </BenchFigure>
      <MarketReadingsView ids={readings} known={caseKnownOn(data.block)} />
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

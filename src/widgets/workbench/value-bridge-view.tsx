"use client";

import { useMemo } from "react";
import { BarRows, BenchFigure, BenchHeadline, BenchLeverControl, BenchNumbers, BenchTasks, useBenchSettings, useBenchTasks, type BarRow, type BarTone, type BenchViewProps } from "./bench-view";
import { BRIDGE_CAPTION, valueBridgeLevers, valueBridgeModel, valueBridgeTasks, type BridgeLeverId, type BridgeStep, type ValueBridgeData } from "./value-bridge-model";

// Value bridge, drawn (spec 2026-11-12, B4; Spine Topic 9): cash, debt and leases, and options take the business value down
// to one share. The business value does not move as the claims do.

const TONE: Record<BridgeStep["kind"], BarTone> = { start: "neutral", add: "gain", take: "loss", total: "neutral" };

/** The bridge as bars: each step from where the last left off; the business and what is left stand on zero. */
export function bridgeRows(steps: readonly BridgeStep[]): BarRow[] {
  return steps.reduce<BarRow[]>((rows, s) => {
    const at = rows.length ? rows[rows.length - 1].to : 0;
    const whole = s.kind === "start" || s.kind === "total";
    const tone = s.kind === "total" && s.value <= 0 ? "loss" : TONE[s.kind];
    return [...rows, { id: s.id, label: s.label, from: whole ? 0 : at, to: whole ? s.value : at + s.value, text: s.text, tone }];
  }, []);
}

export function ValueBridgeView({ data, levers: given, onLeversChange, ticked = [], onTicked, onFirstLeverMove }: { data: ValueBridgeData } & BenchViewProps<BridgeLeverId>) {
  const levers = useMemo(() => valueBridgeLevers(data), [data]);
  const tasks = useMemo(() => valueBridgeTasks(data), [data]);
  const { settings, move } = useBenchSettings(levers, given, onLeversChange, onFirstLeverMove);
  const model = valueBridgeModel(data, settings);
  const reached = useBenchTasks(tasks, model.conditions, ticked, onTicked);
  const rows = bridgeRows(model.steps);
  return (
    <div data-testid="value-bridge" className="min-w-0">
      <BenchHeadline headline={model.headline} warn={model.nothingLeft || model.value === null} testId="value-bridge-headline" />
      <BenchNumbers numbers={model.numbers} testId="value-bridge-numbers" />
      <div className="mt-2" data-testid="value-bridge-controls">
        {levers.map((lever) => (
          <BenchLeverControl key={lever.id} lever={lever} value={settings[lever.id]} onChange={(v) => move(lever.id, v)} />
        ))}
      </div>
      <BenchFigure caption={BRIDGE_CAPTION} testId="value-bridge-steps">
        <BarRows rows={rows} testId="value-bridge-bars" />
      </BenchFigure>
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

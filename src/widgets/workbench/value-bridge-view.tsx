"use client";

import { useMemo } from "react";
import { Chevron } from "@/app/ui";
import { Chip } from "@/app/primitives";
import { BarRows, BenchFigure, BenchHeadline, BenchLeverControl, BenchNumbers, BenchTasks, useBenchSettings, useBenchTasks, type BarRow, type BarTone, type BenchViewProps } from "./bench-view";
import { moneyText } from "./value-levers-model";
import { BRIDGE_CAPTION, valueBridgeLevers, valueBridgeModel, valueBridgeTasks, type BridgeLeverId, type BridgeReport, type BridgeStep, type ValueBridgeData } from "./value-bridge-model";

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

/**
 * The report's page beside the bridge (#93): each line as the report names it, with its figure; a line with a lever is a
 * button that puts the figure into that lever, so the Learner takes the number off the page and watches one share.
 */
function ReportPage({ report, data, settings, put }: { report: BridgeReport; data: ValueBridgeData; settings: Record<BridgeLeverId, number>; put: (id: BridgeLeverId, value: number) => void }) {
  return (
    <figure className="mt-3 rounded-md border border-[var(--hairline)] p-3" data-testid="value-bridge-report">
      <figcaption className="text-xs text-[var(--muted)]">{report.title}</figcaption>
      <ul className="mt-1 flex flex-col gap-2 text-sm">
        {report.lines.map((l) => {
          const figure = moneyText(l.amount, data.block);
          const lever = l.lever;
          return (
            <li key={l.line} className="flex min-h-11 items-center justify-between gap-3">
              <span>{l.line}</span>
              {lever ? (
                <Chip data-state={undefined} aria-pressed={settings[lever] === l.amount} onClick={() => put(lever, l.amount)} className="min-h-11 min-w-11 justify-center tabular-nums" aria-label={`Put ${l.line}, ${figure}, into ${lever}`}>
                  {figure}
                </Chip>
              ) : (
                <span className="tabular-nums">{figure}</span>
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
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
      {data.report && <ReportPage report={data.report} data={data} settings={settings} put={move} />}
      <div className="mt-2" data-testid="value-bridge-controls">
        {levers
          .filter((lever) => !lever.more)
          .map((lever) => (
            <BenchLeverControl key={lever.id} lever={lever} value={settings[lever.id]} onChange={(v) => move(lever.id, v)} />
          ))}
        {levers.some((lever) => lever.more) && (
          <details className="group mt-1 border-t border-[var(--hairline)] pt-1" data-testid="value-bridge-more">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-[var(--ink-2)] [&::-webkit-details-marker]:hidden">
              <Chevron />
              More settings
            </summary>
            {levers
              .filter((lever) => lever.more)
              .map((lever) => (
                <BenchLeverControl key={lever.id} lever={lever} value={settings[lever.id]} onChange={(v) => move(lever.id, v)} />
              ))}
          </details>
        )}
      </div>
      <BenchFigure caption={BRIDGE_CAPTION} testId="value-bridge-steps">
        <BarRows rows={rows} testId="value-bridge-bars" />
      </BenchFigure>
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

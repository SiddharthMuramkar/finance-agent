"use client";

import { useMemo } from "react";
import { BenchFigure, BenchHeadline, BenchLeverControl, BenchNumbers, BenchTasks, toneFill, useBenchSettings, useBenchTasks, type BenchViewProps } from "./bench-view";
import { SEESAW_CAPTION, terminalSeesawLevers, terminalSeesawModel, terminalSeesawTasks, type SeesawLeverId, type SeesawSide, type TerminalSeesawData } from "./terminal-seesaw-model";

// Terminal seesaw, drawn (spec 2026-11-12, B4; Spine Topic 8): growth and the cost of capital after year 10, and a beam that
// tips toward where the value sits, years 1 to 10 on the left and everything after on the right, in today's money.

/** The most the beam tips, in degrees, when all of the value sits on one side. */
const MAX_TILT = 14;

export function TerminalSeesawView({ data, levers: given, onLeversChange, ticked = [], onTicked, onFirstLeverMove }: { data: TerminalSeesawData } & BenchViewProps<SeesawLeverId>) {
  const levers = useMemo(() => terminalSeesawLevers(data), [data]);
  const tasks = useMemo(() => terminalSeesawTasks(data), [data]);
  const { settings, move } = useBenchSettings(levers, given, onLeversChange, onFirstLeverMove);
  const model = terminalSeesawModel(data, settings);
  const reached = useBenchTasks(tasks, model.conditions, ticked, onTicked);
  return (
    <div data-testid="terminal-seesaw" className="min-w-0">
      <BenchHeadline headline={model.headline} warn={model.share === null} testId="terminal-seesaw-headline" />
      <BenchNumbers numbers={model.numbers} testId="terminal-seesaw-numbers" />
      <div className="mt-2" data-testid="terminal-seesaw-controls">
        {levers.map((lever) => (
          <BenchLeverControl key={lever.id} lever={lever} value={settings[lever.id]} onChange={(v) => move(lever.id, v)} />
        ))}
      </div>
      {model.sides && (
        <BenchFigure caption={SEESAW_CAPTION} testId="terminal-seesaw-beam">
          <Seesaw sides={model.sides} tilt={model.tilt} />
        </BenchFigure>
      )}
      <BenchTasks tasks={tasks} reached={reached} />
    </div>
  );
}

/** A beam on a pivot with a weight at each end, sized by how much value it holds; it tips toward the heavier side. */
function Seesaw({ sides, tilt }: { sides: [SeesawSide, SeesawSide]; tilt: number }) {
  const biggest = Math.max(...sides.map((s) => Math.abs(s.value)), 1);
  const size = (s: SeesawSide) => 10 + 26 * Math.sqrt(Math.abs(s.value) / biggest);
  // The beam pivots about its middle, (120, 60); a weight sits on it at each end.
  const ends = [30, 210];
  // A point on the beam, `x` along it as drawn level, turned about the pivot by the tilt.
  const angle = (tilt * MAX_TILT * Math.PI) / 180;
  const at = (x: number) => ({ x: 120 + (x - 120) * Math.cos(angle), y: 60 + (x - 120) * Math.sin(angle) });
  return (
    <div className="mx-auto mt-2 max-w-72" data-tilt={tilt.toFixed(2)}>
      <svg viewBox="0 0 240 90" className="w-full" role="img" aria-label={sides.map((s) => `${s.label}: ${s.text}`).join("; ")}>
        <polygon points="120,60 108,84 132,84" fill="var(--border)" />
        {/* The beam's ends and the weights are placed with the tilt worked out here, not by a rotate transform, so the
            Widget stays a flat drawing (A10b: nothing in a Widget is tilted). */}
        <line x1={at(22).x} y1={at(22).y} x2={at(218).x} y2={at(218).y} stroke="var(--ink-2)" strokeWidth={4} strokeLinecap="round" />
        {sides.map((s, i) => {
          const end = at(ends[i]);
          return (
            <rect key={s.label} x={end.x - size(s) / 2} y={end.y - 2 - size(s)} width={size(s)} height={size(s)} rx={2} fill={toneFill(s.value >= 0 ? "gain" : "loss")}>
              <title>{`${s.label}: ${s.text}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-[var(--muted)]">
        {sides.map((s) => (
          <span key={s.label}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

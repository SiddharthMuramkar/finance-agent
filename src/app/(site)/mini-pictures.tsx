import type { ExampleWidget } from "@/site/examples";

// The questions list's mini pictures (spec 7.2.5): a static 132 x 36 drawing of each widget in the colour language.
// Decorative (the row's words say everything), so hidden from assistive tech. Fills come from the .v-svg-* classes.

const W = 132;
const H = 36;

function Hatch({ id, tone }: { id: string; tone: "line" | "wait" }) {
  return (
    <pattern id={id} width={4.5} height={4.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      {tone === "wait" && <rect width={4.5} height={4.5} className="v-svg-wait-tint" />}
      <rect width={1.5} height={4.5} className={tone === "wait" ? "v-svg-wait" : "v-svg-line"} />
    </pattern>
  );
}

function Jackpot({ id }: { id: string }) {
  const n = 15;
  const slot = W / n;
  return (
    <>
      <defs>
        <Hatch id={id} tone="line" />
      </defs>
      {Array.from({ length: n }, (_, i) => {
        const ghost = 12 + (i / (n - 1)) * 22;
        const x = i * slot + slot * 0.2;
        const w = slot * 0.6;
        return (
          <g key={i}>
            <rect x={x} y={H - ghost} width={w} height={ghost} fill={`url(#${id})`} />
            <rect x={x} y={H - 10} width={w} height={10} rx={1} className="v-svg-gain" />
          </g>
        );
      })}
    </>
  );
}

function Levers() {
  const bars = [
    { x: 8, h: 22, delta: 6, up: true },
    { x: 40, h: 18, delta: 8, up: false },
    { x: 72, h: 26, delta: 5, up: true },
    { x: 104, h: 16, delta: 7, up: false },
  ];
  return (
    <>
      {bars.map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={H - b.h} width={20} height={b.h} rx={2} className="v-svg-neutral" />
          <rect x={b.x} y={b.up ? H - b.h - b.delta : H - b.h} width={20} height={b.delta} className={b.up ? "v-svg-gain" : "v-svg-loss"} />
          <rect x={b.x - 2} y={b.up ? H - b.h : H - b.h + b.delta} width={24} height={2} className="v-svg-ink" />
        </g>
      ))}
    </>
  );
}

function WeWork({ id }: { id: string }) {
  return (
    <>
      <defs>
        <Hatch id={id} tone="wait" />
      </defs>
      <rect x={1} y={3} width={126} height={8} rx={2} fill={`url(#${id})`} className="v-svg-stroke-wait" strokeWidth={1.5} />
      <rect x={1} y={15} width={64} height={8} rx={2} className="v-svg-ink" />
      <rect x={1} y={27} width={38} height={8} rx={2} className="v-svg-loss" />
    </>
  );
}

function Rates() {
  return (
    <>
      <rect x={4} y={17} width={124} height={2} className="v-svg-line-fill" />
      <rect x={34} y={13} width={60} height={10} rx={5} className="v-svg-blueline" />
      <circle cx={34} cy={18} r={5} className="v-svg-stroke-ink" strokeWidth={2} />
      <circle cx={94} cy={18} r={5} className="v-svg-blue" />
      <rect x={34} y={27} width={3} height={6} className="v-svg-wait" />
    </>
  );
}

function Compound() {
  const n = 15;
  const slot = W / n;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const grown = 2 + Math.pow(1.22, i) * 1.4;
        const x = i * slot + slot * 0.2;
        const w = slot * 0.6;
        const top = Math.min(grown, H - 4);
        return (
          <g key={i}>
            <rect x={x} y={H - 3} width={w} height={3} className="v-svg-ink" />
            <rect x={x} y={H - 3 - top} width={w} height={top} rx={1} className="v-svg-gain" />
          </g>
        );
      })}
    </>
  );
}

/** The mini picture for an example's widget. */
export function MiniPicture({ kind, id }: { kind: ExampleWidget; id: string }) {
  return (
    <svg className="v-mini" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      {kind === "jackpot" && <Jackpot id={`${id}-hatch`} />}
      {kind === "levers" && <Levers />}
      {kind === "wework" && <WeWork id={`${id}-hatch`} />}
      {kind === "rates" && <Rates />}
      {kind === "compound" && <Compound />}
    </svg>
  );
}

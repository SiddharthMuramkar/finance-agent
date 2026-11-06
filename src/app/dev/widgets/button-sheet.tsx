import type { ReactNode } from "react";
import { Button, Chip, IconButton, Tag, TextLink } from "../../primitives";

// The button sheet (developer tool, /dev/widgets#buttons): every kind of control in the app at rest, hover, pressed,
// focus and disabled. The three middle states are pinned with data-force (globals.css), so the sheet needs no mouse.

const STATES = ["rest", "hover", "pressed", "focus", "disabled"] as const;
type State = (typeof STATES)[number];

const force = (state: State) => (state === "rest" || state === "disabled" ? {} : { "data-force": state });

function Row({ variant, label, draw }: { variant: string; label: string; draw: (state: State) => ReactNode }) {
  return (
    <div data-variant={variant} className="contents">
      <p className="self-center text-sm leading-5 text-[var(--muted)]">{label}</p>
      {STATES.map((state) => (
        <div key={state} data-state-cell={state} className="flex min-h-14 items-center">
          {draw(state)}
        </div>
      ))}
    </div>
  );
}

const eye = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** Every control the primitives draw, in a grid: one row per kind, one column per state. */
export function ButtonSheet() {
  return (
    <section id="buttons" aria-labelledby="buttons-heading" className="mt-10">
      <h2 id="buttons-heading" className="text-lg font-semibold leading-7">
        Buttons
      </h2>
      <p className="mt-1 text-sm leading-5 text-[var(--muted)]">Each control the app uses, at rest, hover, pressed, focus and disabled. The middle three are pinned, not real.</p>
      <div className="mt-4 grid grid-cols-[120px_repeat(5,minmax(0,1fr))] gap-x-4 gap-y-1">
        <span />
        {STATES.map((state) => (
          <p key={state} className="text-xs font-semibold uppercase leading-4 tracking-[0.08em] text-[var(--muted)]">
            {state}
          </p>
        ))}
        <Row variant="primary" label="Primary" draw={(s) => <Button disabled={s === "disabled"} {...force(s)}>Check</Button>} />
        <Row variant="secondary" label="Secondary" draw={(s) => <Button variant="secondary" disabled={s === "disabled"} {...force(s)}>Skip</Button>} />
        <Row variant="danger" label="Danger" draw={(s) => <Button variant="danger" disabled={s === "disabled"} {...force(s)}>Yes, start over</Button>} />
        <Row variant="small" label="Small" draw={(s) => <Button variant="secondary" size="sm" disabled={s === "disabled"} {...force(s)}>Save to Notebook</Button>} />
        <Row variant="icon" label="Icon" draw={(s) => <IconButton label="Show passcode" disabled={s === "disabled"} {...force(s)}>{eye}</IconButton>} />
        <Row variant="chip" label="Chip" draw={(s) => <Chip disabled={s === "disabled"} {...force(s)}>Explain it again</Chip>} />
        <Row variant="link" label="Link (underlined)" draw={(s) => <TextLink href="#buttons" {...(s === "rest" || s === "disabled" ? {} : { "data-force": s })}>Show all Topics</TextLink>} />
        <Row variant="tag" label="Tag (not pressable)" draw={() => <Tag tone="brand">In progress</Tag>} />
      </div>
    </section>
  );
}

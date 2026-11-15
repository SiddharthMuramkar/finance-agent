import type { ReactNode } from "react";
import { NavLink } from "../../nav-link";
import { Button, Chip, IconButton, MenuItem, Tag, TextLink } from "../../primitives";

// The button sheet (developer tool, /dev/widgets#buttons): every kind of control in the app at rest, hover, pressed,
// focus and disabled (ADR 0015: flat, so pressed is a deeper colour step, never a move). The three middle states are
// pinned with data-force (globals.css), so the sheet needs no mouse. A radio's "pressed" cell shows it checked.

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
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const bookmark = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
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
        <Row variant="tertiary" label="Tertiary (xs)" draw={(s) => <Button variant="tertiary" size="xs" disabled={s === "disabled"} {...force(s)}>{bookmark}Save to Notebook</Button>} />
        <Row variant="small" label="Small" draw={(s) => <Button variant="secondary" size="sm" disabled={s === "disabled"} {...force(s)}>Back to latest</Button>} />
        <Row variant="large" label="Large" draw={(s) => <Button size="lg" disabled={s === "disabled"} {...force(s)}>Start your first Topic</Button>} />
        <Row variant="icon" label="Icon" draw={(s) => <IconButton label="Show passcode" disabled={s === "disabled"} {...force(s)}>{eye}</IconButton>} />
        <Row variant="chip" label="Chip" draw={(s) => <Chip disabled={s === "disabled"} {...force(s)}>Explain it again</Chip>} />
        <Row variant="chip-showing" label="Chip (showing)" draw={(s) => <Chip state="showing" disabled={s === "disabled"} {...force(s)}>Show the chart</Chip>} />
        <Row variant="nav" label="Nav link" draw={(s) => <NavLink href="#buttons" current={false} {...force(s)}>Course Map</NavLink>} />
        <Row variant="nav-current" label="Nav link (current)" draw={(s) => <NavLink href="#buttons" current {...force(s)}>Study</NavLink>} />
        <Row
          variant="menu"
          label="Menu row"
          draw={(s) => (
            <div role="menu" aria-label={`Sample menu, ${s}`} className="popover w-40">
              <MenuItem disabled={s === "disabled"} {...force(s)}>
                Sign out
              </MenuItem>
            </div>
          )}
        />
        <Row
          variant="field"
          label="Field"
          draw={(s) => <input className="field w-40" aria-label={`Sample field, ${s}`} placeholder="Your city" disabled={s === "disabled"} {...force(s)} />}
        />
        <Row
          variant="radio"
          label="Radio"
          draw={(s) => (
            <label className="flex items-center gap-2 text-sm leading-5">
              <input type="radio" name={`sheet-radio-${s}`} defaultChecked={s === "pressed"} disabled={s === "disabled"} {...(s === "focus" ? { "data-force": "focus" } : {})} />
              Light
            </label>
          )}
        />
        <Row variant="link" label="Link (underlined)" draw={(s) => <TextLink href="#buttons" {...(s === "rest" || s === "disabled" ? {} : { "data-force": s })}>Show all Topics</TextLink>} />
        <Row variant="tag" label="Tag (not pressable)" draw={() => <Tag tone="brand">In progress</Tag>} />
      </div>
    </section>
  );
}

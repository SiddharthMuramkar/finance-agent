"use client";

// PROTOTYPE (wayfinder #5, prototype A): throwaway. Draws the clamped call with the fixed RatesWidget and shows every
// event the widget would send to the Tutor (§8.3), so the state is visible after each action.

import { useState } from "react";
import type { RatesCall } from "@/widgets/prototype-signal-rates/rates-call";
import { RatesWidget, type RatesEvent } from "@/widgets/prototype-signal-rates/rates-widget";

export function RatesHarness({ call }: { call: RatesCall }) {
  const [events, setEvents] = useState<{ at: string; e: RatesEvent }[]>([]);
  return (
    <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div className="min-w-0" style={{ maxWidth: call.mode === "compact" ? 480 : 720 }}>
        <RatesWidget call={call} onEvent={(e) => setEvents((list) => [...list, { at: new Date().toLocaleTimeString(), e }])} />
      </div>
      <aside className="min-w-0 text-sm">
        <h2 className="type-h3">Events to the Tutor</h2>
        {events.length === 0 ? (
          <p className="mt-1 text-[var(--muted)]">None yet. Tap a chip.</p>
        ) : (
          <ol className="mt-1 grid gap-1 font-mono text-xs" data-testid="rates-events">
            {events.map(({ at, e }, i) => (
              <li key={i} className="break-words">
                {at} {JSON.stringify(e)}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

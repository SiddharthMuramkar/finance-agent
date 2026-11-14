import Link from "next/link";
import { notFound } from "next/navigation";
import { clampRatesCall } from "@/widgets/prototype-signal-rates/rates-call";
import { RatesHarness } from "./harness";

// PROTOTYPE (wayfinder #5, prototype A): throwaway developer page. It plays the Tutor: it takes a raw widget call
// (?call=<json>), clamps it on the server (spec §8.2) and draws the Signal rates widget (§6.5) as a fixed React
// component. No database and no model call. It does not exist in production.
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Calls a Tutor might send. Some are bad on purpose, to show the clamp. */
const PRESETS: { name: string; call: unknown }[] = [
  { name: "4 -> 5, full (the case page)", call: { widget: "rates", dataset: "rates-up-1", mode: "full", state: { old: 4, new: 5 }, illustration: false } },
  { name: "4 -> 5, compact (in the chat)", call: { widget: "rates", dataset: "rates-up-1", mode: "compact", state: { old: 4, new: 5 }, illustration: false } },
  { name: "4 -> 3.5, down a half", call: { widget: "rates", dataset: "rates-up-1", mode: "full", state: { old: 4, new: 3.5 }, illustration: false } },
  { name: "2 -> 3, illustration", call: { widget: "rates", dataset: "rates-up-1", mode: "full", state: { old: 2, new: 3 }, illustration: true } },
  { name: "8 -> 7", call: { widget: "rates", dataset: "rates-up-1", mode: "full", state: { old: 8, new: 7 }, illustration: false } },
  { name: "Out of range + junk key", call: { widget: "rates", dataset: "rates-up-1", mode: "full", state: { old: 12, new: 9.99, colour: "#ff0000" } } },
  { name: "Off step", call: { widget: "rates", dataset: "rates-up-1", mode: "full", state: { old: 4.1, new: 5.033 } } },
  { name: "Not a number", call: { widget: "rates", dataset: "rates-up-1", mode: "full", state: { old: "four", new: null } } },
  { name: "No move", call: { widget: "rates", dataset: "rates-up-1", mode: "full", state: { old: 4, new: 4 } } },
  { name: "Unchecked dataset", call: { widget: "rates", dataset: "made-up", mode: "full", state: { old: 4, new: 5 } } },
  { name: "Unknown widget", call: { widget: "pie-chart", dataset: "rates-up-1", state: {} } },
];

function parse(text: string | undefined): unknown {
  if (!text) return PRESETS[0].call;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default async function SignalRatesDevPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const raw = parse(first(params.call));
  const result = clampRatesCall(raw);

  return (
    <main className="mx-auto max-w-5xl p-6 text-[var(--ink)]">
      <h1 className="type-h1">Signal rates widget (prototype A)</h1>
      <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
        Throwaway, for wayfinder #5. A fixed React component. The Tutor sends a call; the server clamps it; tested code draws it.
      </p>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {PRESETS.map((p) => (
          <li key={p.name}>
            <Link href={`/dev/signal-rates?call=${encodeURIComponent(JSON.stringify(p.call))}`} className="underline">
              {p.name}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
        <div className="min-w-0">
          <h2 className="type-h3">Raw call (from the Tutor)</h2>
          <pre className="mt-1 overflow-x-auto rounded border border-[var(--rule)] p-2">{JSON.stringify(raw, null, 2)}</pre>
        </div>
        <div className="min-w-0">
          <h2 className="type-h3">After the server clamp</h2>
          <pre className="mt-1 overflow-x-auto rounded border border-[var(--rule)] p-2" data-testid="rates-clamped">
            {JSON.stringify(result.ok ? result.call : { rendered: "nothing", reason: result.reason }, null, 2)}
          </pre>
          {result.notes.length > 0 && (
            <ul className="mt-1 list-disc pl-5" data-testid="rates-notes">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {result.ok ? (
        <RatesHarness key={JSON.stringify(result.call)} call={result.call} />
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">No widget. The Tutor would answer in text.</p>
      )}
    </main>
  );
}

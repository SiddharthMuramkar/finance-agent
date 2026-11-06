"use client";

import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { SecondaryButton } from "./ui";
import { ONE_MORE_BUTTON, PARK_BUTTON, type ParkedData, type ParkOfferData } from "@/tutor/park-items";

/**
 * The park offer and the parked line in the conversation (spec #229, "Parking"; ticket #245). After a third miss in a
 * row code shows its own line and two buttons; each works once. The page provides the actions; with none (an old
 * Session, Notebook) the offer draws read-only.
 */

export type ParkChoice = { park: string } | { oneMore: string };
/** `act` posts the choice and says whether it was taken; `busy` is true while a Tutor turn runs. */
export type ParkActions = { act(choice: ParkChoice): Promise<boolean>; busy: boolean };
export const ParkActionsContext = createContext<ParkActions | null>(null);

export function ParkOfferView({ data }: { data: ParkOfferData & { chosen?: "park" | "one_more" } }) {
  const actions = useContext(ParkActionsContext);
  const [picked, setChosen] = useState<"park" | "one_more" | null>(null);
  // A choice saved on the item (a reload) locks it as firmly as one made here.
  const chosen = picked ?? data.chosen ?? null;
  const locked = !actions || actions.busy || chosen !== null;
  const choose = async (which: "park" | "one_more") => {
    if (locked) return;
    setChosen(which);
    const taken = await actions.act(which === "park" ? { park: data.skillId } : { oneMore: data.skillId });
    if (!taken) setChosen(null);
  };
  return (
    <div data-testid="park-offer" className="self-start rounded-lg border border-[var(--border)] px-3 py-2 text-sm leading-5">
      <p>{data.line}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <SecondaryButton size="sm" data-testid="park-it" disabled={locked} pressed={chosen === "park"} onClick={() => void choose("park")}>
          {PARK_BUTTON}
        </SecondaryButton>
        <SecondaryButton size="sm" data-testid="one-more-try" disabled={locked} pressed={chosen === "one_more"} onClick={() => void choose("one_more")}>
          {ONE_MORE_BUTTON}
        </SecondaryButton>
      </div>
    </div>
  );
}

export function ParkedLine({ data }: { data: ParkedData }) {
  return (
    <p data-testid="parked-line" className="self-start text-sm leading-5 text-[var(--muted)]">
      {data.line} ·{" "}
      <Link href="/course" className="underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--ink)]">
        Choose another Topic on the Course Map
      </Link>
    </p>
  );
}

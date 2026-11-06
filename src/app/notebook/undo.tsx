"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SecondaryButton } from "../ui";

/** How long the Undo toast stays, in milliseconds. */
export const UNDO_MS = 8000;

/** One removal that can still be taken back: what to say, and how to put it back (true when it worked). */
export type UndoOffer = { message: string; undo: () => Promise<boolean> };

const OfferUndo = createContext<(offer: UndoOffer) => void>(() => {});

/** Called by a part of the Notes page right after it removed something, so the Learner can take it back. */
export const useOfferUndo = () => useContext(OfferUndo);

/** The toast after a removal on Notes: what went, and Undo. Fixed at the bottom of the screen; never printed. */
export function UndoToast({ message, failed = false, onUndo }: { message: string; failed?: boolean; onUndo: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[90vw] items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm leading-5 shadow-lg print:hidden"
    >
      <span>{failed ? "Could not undo. Try again." : message}</span>
      <SecondaryButton size="sm" data-undo-remove onClick={onUndo}>
        Undo
      </SecondaryButton>
    </div>
  );
}

/**
 * Holds the one Undo toast of the Notes page. A new removal replaces the toast before it (that one can no longer be
 * undone); the toast goes after UNDO_MS, or once Undo has put the item back.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [offer, setOffer] = useState<(UndoOffer & { key: number; failed: boolean }) | null>(null);
  const offerUndo = useCallback((o: UndoOffer) => setOffer({ ...o, key: Date.now(), failed: false }), []);
  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer((current) => (current?.key === offer.key ? null : current)), UNDO_MS);
    return () => clearTimeout(timer);
  }, [offer]);
  const undo = async () => {
    if (!offer) return;
    const ok = await offer.undo();
    setOffer((current) => (current?.key !== offer.key ? current : ok ? null : { ...current, failed: true }));
  };
  return (
    <OfferUndo.Provider value={offerUndo}>
      {children}
      {offer && <UndoToast key={offer.key} message={offer.message} failed={offer.failed} onUndo={() => void undo()} />}
    </OfferUndo.Provider>
  );
}

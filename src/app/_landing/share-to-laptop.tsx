"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../primitives";
import { copy } from "./copy";

/**
 * "Send this to my laptop" (spec 2026-11-12 E7): a signed-in Learner on a screen narrower than 768 px cannot study there,
 * so Home's main button opens the phone's share sheet with the site's address instead. It sends no email (a Sign-in link
 * lasts 15 minutes and the site's daily email allowance is small). Where there is no share sheet, it copies the address
 * and says so; with no clipboard either, it shows the address to type on the laptop. A closed share sheet is no error.
 */
export function ShareToLaptop({ className, icon }: { className: string; icon?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const send = async () => {
    const url = `${window.location.origin}/`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: copy.shareTitle, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Neither a share sheet nor the clipboard: show the address itself, to type or select on the laptop.
      setFailed(url);
    }
  };
  return (
    <>
      <Button type="button" className={className} onClick={send} data-send-to-laptop="">
        {icon}
        <span className="min-w-0">{copy.sendToLaptop}</span>
      </Button>
      {/* Always rendered, so a screen reader announces the words when they arrive (an empty live region is not hidden). */}
      <span role="status" data-share-status="" className="text-sm md:hidden">
        {copied ? copy.linkCopied : failed ? copy.linkToType(failed) : ""}
      </span>
    </>
  );
}

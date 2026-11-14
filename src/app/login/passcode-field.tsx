"use client";

import { useState } from "react";
import { IconButton } from "../primitives";

/** What the passcode field and its eye look like: hidden offers "Show passcode", shown offers "Hide passcode". */
export function passcodeEye(shown: boolean): { type: "password" | "text"; label: string } {
  return shown ? { type: "text", label: "Hide passcode" } : { type: "password", label: "Show passcode" };
}

/** The passcode input with a show/hide eye, so the Learner can check what they typed. Hidden at first. */
export function PasscodeField() {
  const [shown, setShown] = useState(false);
  const eye = passcodeEye(shown);
  return (
    <div className="relative">
      <input
        id="passcode"
        name="passcode"
        type={eye.type}
        autoFocus
        required
        autoComplete="current-password"
        className="field h-11 w-full pl-3 pr-12 text-[15px]"
      />
      {/* Placed by offsets, not a transform: a control never moves or carries a transform (ADR 0013). */}
      <IconButton label={eye.label} pressed={shown} onClick={() => setShown(!shown)} className="absolute right-1.5 top-1.5 !h-8 !w-8">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M3 3l18 18" />}
        </svg>
      </IconButton>
    </div>
  );
}

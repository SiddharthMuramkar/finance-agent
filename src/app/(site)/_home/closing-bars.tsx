"use client";

import { useEffect, useRef, useState } from "react";

// The closing bars (spec 7.2.8, 10): four bars at 40, 60, 80 and 100% of 200 px that grow from 30% once, when 40% of the
// block is in view. Decorative. Without IntersectionObserver they simply show grown.

const HEIGHTS = [40, 60, 80, 100];

export function ClosingBars() {
  const ref = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      requestAnimationFrame(() => setGrown(true));
      return;
    }
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setGrown(true);
          seen.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  return (
    <div ref={ref} className={`v-bars${grown ? " grown" : ""}`} aria-hidden="true">
      {HEIGHTS.map((h) => (
        <span key={h} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

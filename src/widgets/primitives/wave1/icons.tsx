import type { ReactNode } from "react";

// The object icons Pictogram and MoneyStack draw: flat, two-tone, on a 24 x 24 grid with a 1.5 px stroke. Each takes
// a fill and a line colour (the provenance tokens), so the same bar of gold or note of money can read as "yours",
// "sourced" or "worked out". Gold is the one place that keeps a metallic colour of its own.

export type Ink = { fill: string; line: string };

export const GOLD: Ink = { fill: "#c9a227", line: "#8a6d0b" };

type Draw = (c: Ink) => ReactNode;

function note(symbol: ReactNode): Draw {
  return function Note(c) {
    return (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="1.5" fill={c.fill} stroke={c.line} />
        <circle cx="12" cy="12" r="3.2" fill="none" stroke={c.line} />
        {symbol}
      </>
    );
  };
}

export const ICONS: Record<string, Draw> = {
  "gold-bar": (c) => (
    <>
      <path d="M7 8h10l4 9H3z" fill={c.fill === "none" ? "none" : GOLD.fill} stroke={GOLD.line} />
      <path d="M7 8l-1.5 3.5h13L17 8" fill="none" stroke={GOLD.line} />
    </>
  ),
  coin: (c) => (
    <>
      <circle cx="12" cy="12" r="8.5" fill={c.fill} stroke={c.line} />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke={c.line} />
    </>
  ),
  "note-inr": note(<path d="M10.6 10.2h2.8M10.6 11.4h2.8M10.8 10.2c1 0 1.4.7 1.2 1.6l-1.2 1.4" fill="none" stroke="currentColor" strokeWidth="1" />),
  "note-usd": note(<path d="M12.9 10.6c-.2-.5-.8-.7-1.3-.6-.9.2-.9 1.1-.1 1.4l1 .3c.8.3.8 1.2-.1 1.4-.5.1-1.1-.1-1.3-.6M12 9.4v5.2" fill="none" stroke="currentColor" strokeWidth="1" />),
  "piggy-bank": (c) => (
    <>
      <path d="M4 12.5C4 9 7 7 11 7h3c1.2 0 2.3.4 3 1l2.5-1-.5 3c1 .8 1.5 1.8 1.5 3 0 1.5-.8 2.7-2 3.3V19h-3v-1.5H10V19H7v-2.7C5 15.7 4 14.2 4 12.5z" fill={c.fill} stroke={c.line} />
      <circle cx="15.5" cy="11.5" r=".8" fill={c.line} stroke="none" />
      <path d="M9.5 7V6M11 11h4" fill="none" stroke={c.line} />
    </>
  ),
  house: (c) => (
    <>
      <path d="M3 11.5L12 4l9 7.5" fill="none" stroke={c.line} />
      <path d="M5.5 10.2V20h13v-9.8L12 5z" fill={c.fill} stroke={c.line} />
      <path d="M10 20v-5h4v5" fill="none" stroke={c.line} />
    </>
  ),
  car: (c) => (
    <>
      <path d="M3 16v-3.5l2-4.5h14l2 4.5V16z" fill={c.fill} stroke={c.line} />
      <path d="M5.5 12h13" fill="none" stroke={c.line} />
      <circle cx="7.5" cy="16.5" r="2" fill="var(--bg)" stroke={c.line} />
      <circle cx="16.5" cy="16.5" r="2" fill="var(--bg)" stroke={c.line} />
    </>
  ),
  phone: (c) => (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" fill={c.fill} stroke={c.line} />
      <path d="M10.5 5h3M11 19h2" fill="none" stroke={c.line} />
    </>
  ),
  "vada-pav": (c) => (
    <>
      <path d="M3.5 13c0-4 3-6.5 8.5-6.5s8.5 2.500 8.500 6.500z" fill={c.fill} stroke={c.line} />
      <path d="M3.5 15h17v1.500c0 1.700-1.300 3-3 3h-11c-1.700 0-3-1.300-3-3z" fill={c.fill} stroke={c.line} />
      <circle cx="12" cy="13.500" r="3" fill="var(--bg)" stroke={c.line} />
    </>
  ),
  chai: (c) => (
    <>
      <path d="M5 10h11v4.500a4 4 0 01-4 4H9a4 4 0 01-4-4z" fill={c.fill} stroke={c.line} />
      <path d="M16 11.500h1.500a2 2 0 010 4H16M8 4.500c-1 1 1 1.700 0 3M12 4.500c-1 1 1 1.700 0 3" fill="none" stroke={c.line} />
    </>
  ),
  basket: (c) => (
    <>
      <path d="M3 10h18l-2 9H5z" fill={c.fill} stroke={c.line} />
      <path d="M7.500 10L10 4.500M16.500 10L14 4.500M9 13v3M12 13v3M15 13v3" fill="none" stroke={c.line} />
    </>
  ),
  bank: (c) => (
    <>
      <path d="M3 9.500L12 4l9 5.500z" fill={c.fill} stroke={c.line} />
      <path d="M5.500 11v6M9.500 11v6M14.500 11v6M18.500 11v6M3.500 19.500h17" fill="none" stroke={c.line} />
    </>
  ),
  govt: (c) => (
    <>
      <path d="M5 3.500h10l4 4V20.500H5z" fill={c.fill} stroke={c.line} />
      <path d="M15 3.500v4h4M8.500 11.500h7M8.500 14.500h7" fill="none" stroke={c.line} />
      <circle cx="12" cy="18" r="1.300" fill="none" stroke={c.line} />
    </>
  ),
  share: (c) => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.500" fill={c.fill} stroke={c.line} />
      <path d="M6.500 15l3-3.500 2.500 2 4.500-5" fill="none" stroke={c.line} />
      <path d="M6.500 8h4" fill="none" stroke={c.line} />
    </>
  ),
  umbrella: (c) => (
    <>
      <path d="M3 12C3 7.500 7 4 12 4s9 3.500 9 8c-1.500-1.200-3-1.200-4.500 0-1.500-1.200-3-1.200-4.500 0-1.500-1.200-3-1.200-4.500 0C6 10.800 4.500 10.800 3 12z" fill={c.fill} stroke={c.line} />
      <path d="M12 12v6.500a1.800 1.800 0 003.600 0" fill="none" stroke={c.line} />
    </>
  ),
  "ice-cream": (c) => (
    <>
      <path d="M7 11.500L12 21l5-9.500z" fill={c.fill} stroke={c.line} />
      <path d="M6.500 11.500a5.500 5.500 0 1111 0z" fill={c.fill} stroke={c.line} />
      <path d="M9.500 14l5 2.500M12 11.500l2.500 5" fill="none" stroke={c.line} />
    </>
  ),
};

export const ICON_NAMES = Object.keys(ICONS);

/** Whether a name is one of the drawn objects. An unknown name is drawn as a coin, and library-v2 warns about it. */
export function isKnownObject(name: string): boolean {
  return Object.hasOwn(ICONS, name);
}

/** One object at 24 x 24 (scaled by `size`), drawn in the given ink. `ghost` draws only a faint outline. */
export function Icon({ name, ink, ghost = false, size = 28 }: { name: string; ink: Ink; ghost?: boolean; size?: number }) {
  const draw = isKnownObject(name) ? ICONS[name] : ICONS.coin;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      data-icon={isKnownObject(name) ? name : "coin"}
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={ghost ? { opacity: 0.4, color: ink.line } : { color: ink.line }}
    >
      {ghost ? draw({ fill: "none", line: name === "gold-bar" ? GOLD.line : "var(--border)" }) : draw(ink)}
    </svg>
  );
}

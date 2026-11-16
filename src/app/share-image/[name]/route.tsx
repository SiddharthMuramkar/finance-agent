import { ImageResponse } from "next/og";
import { SHARE_IMAGE_SIZE } from "@/app/site-metadata";
import { BRAND } from "@/site/copy";
import { SHARE_IMAGES } from "@/site/routes";
import { shareCard, type ShareCard } from "@/site/share-card";

// The share cards (issue #71), at /share-image/<name>.png: Home's and one per Example, drawn at build time in today's
// look (spec §3.1 Light tokens: paper, wash, ink, the one blue), so a shared link shows its own question and never the
// old screenshot. Public: src/site/routes.ts lists each one. The colours are the spec's literals: an image cannot read
// the stylesheet's tokens.

export const dynamicParams = false;

export function generateStaticParams() {
  return SHARE_IMAGES.map((name) => ({ name: `${name}.png` }));
}

const INK = "#0b0d12";
const INK_2 = "#30353f";
const BLUE = "#1f3fae";
const WASH = "#f5f7fb";
const RULE = "#e2e5ea";

/** The site's mark (src/app/icon.svg): four rising bars on the blue. */
function Mark() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, width: 64, height: 64, padding: "12px 10px", borderRadius: 12, background: BLUE }}>
      {[10, 20, 30, 40].map((h) => (
        <div key={h} style={{ width: 8, height: h, borderRadius: 2, background: "#ffffff" }} />
      ))}
    </div>
  );
}

function Card({ eyebrow, title, line }: ShareCard) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: WASH, color: INK }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Mark />
        <div style={{ fontSize: 36, fontWeight: 700 }}>{BRAND}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingLeft: 28, borderLeft: `8px solid ${BLUE}` }}>
        <div style={{ fontSize: 28, color: BLUE, fontWeight: 600 }}>{eyebrow}</div>
        <div style={{ fontSize: title.length > 48 ? 56 : 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>{title}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 24, borderTop: `2px solid ${RULE}`, fontSize: 26, color: INK_2 }}>
        <div style={{ display: "flex", maxWidth: 820, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{line}</div>
        <div style={{ color: BLUE, fontWeight: 600 }}>value-it.xyz</div>
      </div>
    </div>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const card = shareCard((await params).name.replace(/\.png$/, ""));
  if (!card) return new Response(null, { status: 404 });
  return new ImageResponse(<Card {...card} />, SHARE_IMAGE_SIZE);
}

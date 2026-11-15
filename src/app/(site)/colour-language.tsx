import { COLOURS, type ColourTile } from "@/site/copy";
import { SectionHead } from "./parts";

// The colour language (spec 7.2.4): five colours and one pattern, each with a small example, its name, its meaning and
// one line. Home and How it works share it with different bodies.

const TILE: Record<ColourTile, string> = {
  knob: "v-t-knob",
  gain: "v-t-gain",
  loss: "v-t-loss",
  wait: "v-t-wait v-swatch-claim",
  pin: "v-t-pin",
  hatch: "v-t-hatch v-swatch-hatch",
};

export function ColourLanguage({ eyebrow, title, body, headingId }: { eyebrow: string; title: string; body: string; headingId: string }) {
  return (
    <section className="v-section v-wash" aria-labelledby={headingId} data-site-section="colours">
      <div className="v-wrap">
        <SectionHead eyebrow={eyebrow} title={title} body={body} id={headingId} />
        <ul className="v-colours">
          {COLOURS.map((colour) => (
            <li key={colour.tile}>
              <span className="v-tile" aria-hidden="true">
                <span className={TILE[colour.tile]} />
              </span>
              <p>
                <span className="name">{colour.name}</span>
                <span className="means">{colour.means}</span>
              </p>
              <p className="v-small">{colour.line}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

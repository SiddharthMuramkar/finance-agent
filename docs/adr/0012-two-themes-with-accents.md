# Two themes, Light and Dark, in one blue with four accents; Light is no longer frozen

Status: accepted, 2026-11-05.

The site has Light, Paper, Midnight and Forest. The owner finds the page "monotone", the buttons indistinct and the choice "too many colours". Four themes also meant four sets of contrast rules, a Day theme and a Night theme to explain, and a frozen Light that no one could improve (themes spec, T-01: Light's values were locked so the other three could be tuned around it). This decision replaces them with two themes. Both use one brand colour in three tones (deep #1E3A8A, main #2F5BEA, soft #DCE6FF) and four accents that each carry a meaning: mint #12B886 for the Learner and gains, coral #FF6B57 for losses and warnings, sunflower #FFC233 for history and stories, violet #8B5CF6 for lingo. Light gets new values; Dark replaces Midnight with a deep navy and desaturated accents. Each accent has a text-safe "ink" variant, because the owner's fills fail 4.5:1 as text (mint is 2.4:1 on the page).

## Considered Options

- Keep four themes and add accents to each: four palettes to keep in step with every new accent; the owner asked for fewer, not more.
- One theme, no Dark: a Learner studying at night loses the dark reading mode the first themes spec added for glare.
- Use the owner's accent hexes directly as text: fails WCAG (mint 2.4:1, sunflower 1.5:1); would force bigger or bolder type to compensate.

## Consequences

- Light is unfrozen. `scripts/check-theme-contrast.mjs` freezes the new Light values instead (`LIGHT_FROZEN`) and now also runs the text rules on Light; changing a Light value needs an ADR note.
- Stored choices migrate when read: `paper` becomes Light, `forest` and `midnight` become Dark, a day/night pair becomes "Match my Mac". Old cookies keep working with no write.
- The theme menu offers Light, Dark and Match my Mac. "Day theme" and "Night theme" leave the glossary.
- `--you` is mint and `--src` is sunflower; both keep their names so no component changes. An accent's fill never carries text; its `-ink` does.
- Dark accents are desaturated (OKLCH chroma at most 0.135), so they are not the owner's exact hexes there.
- Print stays in Light.
- Accent fills are checked at 3:1 against their surface only when colour alone carries the meaning (WCAG 2.2 SC 1.4.11, issue #457). Every use today is decorative or paired with a text label or an icon, so the Light fills keep the owner's hexes (sunflower is 1.5:1 on the page). A colour-only use goes on the contrast script's `COLOUR_ONLY` list and must reach 3:1; `src/dev/accent-fill-uses.test.ts` holds every use and its verdict.

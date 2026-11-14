import { REPLY_CHOICES } from "@/tutor/session-item-kinds";

/**
 * Code stores two or three Choices after every checked reply (D3a, ADR 0010), as a reply_choices item. A test about
 * another item (a divider, a Widget, a card) reads its items without them; the Choices have their own tests
 * (choices.test.ts, choices-turn.test.ts). Works on turn events (`{ type: "item", item }`), thread lines
 * (`{ role: "item", kind }`) and stored items (`{ kind }`).
 */
export function withoutChoices<T>(list: readonly T[]): T[] {
  return list.filter((x) => {
    const o = x as { kind?: unknown; item?: { kind?: unknown } };
    return o?.kind !== REPLY_CHOICES && o?.item?.kind !== REPLY_CHOICES;
  });
}

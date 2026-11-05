import { EMOJI, isEmojiName, type EmojiName } from "./registry";

export const EMOJI_SIZES = [16, 20, 24, 32, 48, 64, 80] as const;
export type EmojiSize = (typeof EMOJI_SIZES)[number];

const warned = new Set<string>();

/**
 * One vendored Fluent Emoji 3D picture (spec 2026-11-05, ticket E1). Decorative by default (`alt=""`, `aria-hidden`);
 * give `label` text, or `label` true for the registry's own alt, when the picture carries meaning. An unknown name is a
 * type error; at runtime it renders nothing and warns once.
 */
export function Emoji({ name, size, label }: { name: EmojiName; size: EmojiSize; label?: string | true }) {
  if (!isEmojiName(name)) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`<Emoji>: "${name}" is not in src/emoji/registry.ts`);
    }
    return null;
  }
  const entry = EMOJI[name];
  const meaningful = label !== undefined && label !== false;
  const alt = label === true ? entry.alt : (label ?? "");
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a fixed 160 px WebP from /public, already sized
    <img
      src={`/emoji/${entry.file}`}
      width={size}
      height={size}
      alt={alt}
      {...(meaningful ? {} : { "aria-hidden": true })}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

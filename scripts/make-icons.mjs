// Draws the favicon and the Apple touch icon from the one icon, src/app/icon.svg (issue #70):
//   node scripts/make-icons.mjs
// writes src/app/favicon.ico (32 and 16 px PNGs in one .ico, for browsers and crawlers that ask for /favicon.ico) and
// src/app/apple-icon.png (180 px, square: iOS rounds the corners itself). Next.js serves both by its file conventions.
// Run it again whenever icon.svg changes, and commit what it writes.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg", "utf8");
/** The same mark with square corners, for the touch icon. */
const square = svg.replace(/(<rect width="32" height="32") rx="\d+"/, "$1");

const png = (source, size) => sharp(Buffer.from(source), { density: (72 * size) / 32 }).resize(size, size).png().toBuffer();

/** An .ico holding PNG images (every browser reads PNG entries): a 6-byte header, a 16-byte entry each, then the images. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const sizes = [32, 16];
writeFileSync("src/app/favicon.ico", ico(await Promise.all(sizes.map(async (size) => ({ size, data: await png(svg, size) })))));
writeFileSync("src/app/apple-icon.png", await png(square, 180));
console.log("wrote src/app/favicon.ico and src/app/apple-icon.png");

#!/usr/bin/env node
/**
 * Generate the PWA icons as flat PNGs, so the repo carries no binary assets it
 * cannot regenerate. A minimal PNG writer (zlib is in node's stdlib) beats
 * adding an image dependency for two solid-colour squares with a glyph.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [13, 54, 107];      // #0d366b, the app's theme colour
const FG = [201, 225, 255];    // light blue mark

/** A crude 5x7 bitmap "M" for map — legible down to 48px, no font needed. */
const GLYPH = [
  '#...#',
  '##.##',
  '#.#.#',
  '#.#.#',
  '#...#',
  '#...#',
  '#...#',
];

function png(size) {
  const px = Buffer.alloc(size * size * 3);
  const put = (x, y, [r, g, b]) => {
    const o = (y * size + x) * 3;
    px[o] = r; px[o + 1] = g; px[o + 2] = b;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BG);

  // Centre the glyph at ~46% of the icon height.
  const cell = Math.floor((size * 0.46) / GLYPH.length);
  const w = GLYPH[0].length * cell, h = GLYPH.length * cell;
  const ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2);
  GLYPH.forEach((row, ry) => {
    [...row].forEach((c, rx) => {
      if (c !== '#') return;
      for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) {
        put(ox + rx * cell + dx, oy + ry * cell + dy, FG);
      }
    });
  });

  // PNG wants a filter byte in front of every scanline.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

mkdirSync('icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`icons/icon-${size}.png`, png(size));
  console.log(`  icons/icon-${size}.png`);
}

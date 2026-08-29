/**
 * Genera los iconos PNG de la PWA sin dependencias externas (encoder PNG a mano
 * con zlib). Dibuja la marca: fondo oscuro, una "f" blanca y un punto verde.
 *
 *   node scripts/gen-icons.mjs
 *
 * Salidas: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BG = [17, 24, 39, 255]; // #111827
const FG = [255, 255, 255, 255];
const DOT = [34, 197, 94, 255]; // #22c55e

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function draw(size, { pad = 0 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  };
  const rect = (x0, y0, w, h, color) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, color);
  };
  const disc = (cx, cy, radius, color) => {
    for (let y = cy - radius; y <= cy + radius; y++)
      for (let x = cx - radius; x <= cx + radius; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) put(x, y, color);
  };

  rect(0, 0, size, size, BG);

  // "f" dentro del área segura (pad para iconos maskable)
  const inner = size - pad * 2;
  const u = inner / 16; // unidad de grilla
  const ox = pad;
  const oy = pad;
  const stemX = Math.round(ox + u * 6);
  const stemW = Math.round(u * 2.4);
  rect(stemX, Math.round(oy + u * 3), stemW, Math.round(u * 10), FG); // asta
  rect(stemX, Math.round(oy + u * 3), Math.round(u * 6), Math.round(u * 2.2), FG); // curva sup
  rect(Math.round(ox + u * 4), Math.round(oy + u * 7), Math.round(u * 6), Math.round(u * 2.1), FG); // travesaño

  disc(Math.round(ox + u * 11.2), Math.round(oy + u * 11.6), Math.round(u * 1.7), DOT);

  return buf;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "icon-192.png"), encodePng(192, 192, draw(192)));
writeFileSync(join(OUT_DIR, "icon-512.png"), encodePng(512, 512, draw(512)));
writeFileSync(
  join(OUT_DIR, "icon-maskable-512.png"),
  encodePng(512, 512, draw(512, { pad: 64 })),
);
console.log("Iconos generados en", OUT_DIR);

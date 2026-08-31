/**
 * Genera los iconos de la PWA + favicons sin dependencias externas (encoder PNG
 * a mano con zlib). Dibuja la marca de fivi: un cuadrado redondeado y un círculo
 * que se solapa en la esquina inferior derecha (ver brand/fivi-isotipo.svg).
 *
 *   node scripts/gen-icons.mjs
 *
 * Salidas (public/):
 *   icons/icon-192.png            app icon (fondo de marca, 192)
 *   icons/icon-512.png            app icon (512)
 *   icons/icon-maskable-512.png   app icon con área segura para máscaras
 *   icons/apple-touch-icon.png    app icon 180 (iOS aplica su propia máscara)
 *   icons/favicon-32.png          isotipo sobre transparente (32)
 *   icons/favicon-16.png          isotipo sobre transparente (16)
 *   favicon.ico                   ICO con el favicon 16 + 32
 *
 * El SVG equivalente vive en public/icons/icon.svg (editado a mano).
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const ICONS_DIR = join(PUBLIC_DIR, "icons");

// --- Paleta de marca -------------------------------------------------------
const BRAND_DARK = [23, 22, 26]; //  #17161a  fondo del app icon
const BRAND_BLUE = [31, 95, 214]; //  #1f5fd6  cuadrado (isotipo)
const BRAND_ORANGE = [226, 102, 47]; // #e2662f  círculo
const WHITE = [255, 255, 255];

/** multiply blend por canal (para el solape del isotipo sobre claro). */
const multiply = (a, b) => a.map((v, i) => Math.round((v * b[i]) / 255));

// --- Geometría de la marca (en unidades 0..100, como el SVG) --------------
// cuadrado: x,y = 0..76, radio de esquina 21 · círculo: centro (78,78) r=22.
const SQ = { x: 0, y: 0, w: 76, r: 21 };
const CI = { cx: 78, cy: 78, r: 22 };

function insideRoundRect(px, py, { x, y, w, r }) {
  const x1 = x + w;
  const y1 = y + w;
  if (px < x || px > x1 || py < y || py > y1) return false;
  // zona central en cruz
  if ((px >= x + r && px <= x1 - r) || (py >= y + r && py <= y1 - r)) return true;
  // esquinas: dentro del radio del centro de esquina más cercano
  const cx = px < x + r ? x + r : x1 - r;
  const cy = py < y + r ? y + r : y1 - r;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

const insideCircle = (px, py, { cx, cy, r }) =>
  (px - cx) ** 2 + (py - cy) ** 2 <= r * r;

// --- Encoder PNG ---------------------------------------------------------------
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
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
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
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Render ---------------------------------------------------------------------
const SS = 4; // supersampling para antialias

/**
 * Dibuja la marca a `size` px.
 *  - `bg`      color de fondo, o `null` para transparente (favicon)
 *  - `square`  color del cuadrado
 *  - `blend`   si true, el solape cuadrado∩círculo se multiplica (isotipo claro)
 *  - `margin`  fracción de borde libre alrededor de la marca (app icon vs favicon)
 */
function render(size, { bg, square, blend = false, margin }) {
  const rgba = Buffer.alloc(size * size * 4);
  const overlap = multiply(square, BRAND_ORANGE);
  // la marca ocupa 100 u; se mapea a [margin, 1-margin] del lienzo.
  const span = size * (1 - 2 * margin);
  const off = size * margin;
  const toUnit = (p) => ((p + 0.5 / SS - off) / span) * 100;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = toUnit(x + sx / SS);
          const uy = toUnit(y + sy / SS);
          const inSq = insideRoundRect(ux, uy, SQ);
          const inCi = insideCircle(ux, uy, CI);
          let c = null;
          if (inSq && inCi) c = blend ? overlap : BRAND_ORANGE;
          else if (inCi) c = BRAND_ORANGE;
          else if (inSq) c = square;
          else if (bg) c = bg;
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      // promedio sobre las muestras cubiertas; alpha = cobertura.
      const cov = a / n;
      if (cov > 0) {
        rgba[i] = Math.round(r / (a / 255));
        rgba[i + 1] = Math.round(g / (a / 255));
        rgba[i + 2] = Math.round(b / (a / 255));
      }
      rgba[i + 3] = Math.round(cov);
    }
  }
  return rgba;
}

// --- ICO (contenedor con PNGs 16 y 32) ---------------------------------------
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, idx) => {
    const o = idx * 16;
    dir[o] = e.size >= 256 ? 0 : e.size;
    dir[o + 1] = e.size >= 256 ? 0 : e.size;
    dir[o + 2] = 0; // paleta
    dir[o + 3] = 0; // reservado
    dir.writeUInt16LE(1, o + 4); // planos
    dir.writeUInt16LE(32, o + 6); // bits por pixel
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

// --- Salidas -----------------------------------------------------------------
mkdirSync(ICONS_DIR, { recursive: true });

// App icon: fondo de marca, cuadrado blanco, círculo naranja opaco.
const appIcon = { bg: BRAND_DARK, square: WHITE, blend: false, margin: 0.225 };
writeFileSync(
  join(ICONS_DIR, "icon-192.png"),
  encodePng(192, 192, render(192, appIcon)),
);
writeFileSync(
  join(ICONS_DIR, "icon-512.png"),
  encodePng(512, 512, render(512, appIcon)),
);
writeFileSync(
  join(ICONS_DIR, "apple-touch-icon.png"),
  encodePng(180, 180, render(180, appIcon)),
);
// Maskable: más margen para sobrevivir a la máscara del launcher.
writeFileSync(
  join(ICONS_DIR, "icon-maskable-512.png"),
  encodePng(512, 512, render(512, { ...appIcon, margin: 0.3 })),
);

// Favicon: isotipo (cuadrado azul + círculo naranja multiplicado) sin fondo.
const favicon = { bg: null, square: BRAND_BLUE, blend: true, margin: 0 };
const fav32 = encodePng(32, 32, render(32, favicon));
const fav16 = encodePng(16, 16, render(16, favicon));
writeFileSync(join(ICONS_DIR, "favicon-32.png"), fav32);
writeFileSync(join(ICONS_DIR, "favicon-16.png"), fav16);
writeFileSync(
  join(PUBLIC_DIR, "favicon.ico"),
  encodeIco([
    { size: 16, png: fav16 },
    { size: 32, png: fav32 },
  ]),
);

console.log("Iconos y favicons generados en", PUBLIC_DIR);

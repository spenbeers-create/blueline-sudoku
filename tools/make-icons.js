// Draws the app icons as PNG files: node tools/make-icons.js
// Design (512 units): blue tile, white board, a placed number in the top-right
// cell with its row and column shaded in see-through blue.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BLUE = [42, 100, 232], WHITE = [255, 255, 255], LINE = [201, 211, 227];

function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Shapes in 512-unit space, painted in order.
function shapes(fullBleed) {
  const g0 = 112, cell = 96, inset = 7;
  const list = [];
  list.push(fullBleed ? { rect: [0, 0, 512, 512, 0], color: BLUE, a: 1 } : { rect: [0, 0, 512, 512, 112], color: BLUE, a: 1 });
  list.push({ rect: [88, 88, 424, 424, 48], color: WHITE, a: 1 });
  for (const t of [g0 + cell, g0 + 2 * cell]) {
    list.push({ rect: [t - 2.5, g0, t + 2.5, g0 + 3 * cell, 0], color: LINE, a: 1 });
    list.push({ rect: [g0, t - 2.5, g0 + 3 * cell, t + 2.5, 0], color: LINE, a: 1 });
  }
  list.push({ rect: [g0 + inset, g0 + inset, g0 + 2 * cell - inset, g0 + cell - inset, 16], color: BLUE, a: 0.2 });
  list.push({ rect: [g0 + 2 * cell + inset, g0 + cell + inset, g0 + 3 * cell - inset, g0 + 3 * cell - inset, 16], color: BLUE, a: 0.2 });
  list.push({ rect: [g0 + 2 * cell + inset, g0 + inset, g0 + 3 * cell - inset, g0 + cell - inset, 16], color: BLUE, a: 1 });
  return list;
}

function render(size, { fullBleed = false, scale = 1 } = {}) {
  const list = shapes(fullBleed);
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      let u = ((x + (sx + 0.5) / SS) / size) * 512, v = ((y + (sy + 0.5) / SS) / size) * 512;
      let cr = 0, cg = 0, cb = 0, ca = 0;
      list.forEach((s, i) => {
        let uu = u, vv = v;
        if (i > 0 && scale !== 1) { uu = 256 + (u - 256) / scale; vv = 256 + (v - 256) / scale; }
        const [x0, y0, x1, y1, rad] = s.rect;
        if (!inRound(uu, vv, x0, y0, x1, y1, rad)) return;
        const sa = s.a;
        cr = s.color[0] * sa + cr * (1 - sa);
        cg = s.color[1] * sa + cg * (1 - sa);
        cb = s.color[2] * sa + cb * (1 - sa);
        ca = sa + ca * (1 - sa);
      });
      r += cr; g += cg; b += cb; a += ca;
    }
    const n = SS * SS, i = (y * size + x) * 4;
    const al = a / n;
    px[i] = al ? Math.round(r / n / al) : 0;
    px[i + 1] = al ? Math.round(g / n / al) : 0;
    px[i + 2] = al ? Math.round(b / n / al) : 0;
    px[i + 3] = Math.round(al * 255);
  }
  return encodePng(size, size, px);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, { fullBleed: true, scale: 0.86 }));
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), render(180, { fullBleed: true }));
fs.writeFileSync(path.join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#2A64E8"/>
<rect x="88" y="88" width="336" height="336" rx="48" fill="#fff"/>
<path d="M208 112v288M304 112v288M112 208h288M112 304h288" stroke="#C9D3E3" stroke-width="5"/>
<rect x="119" y="119" width="178" height="82" rx="16" fill="#2A64E8" fill-opacity=".2"/>
<rect x="311" y="215" width="82" height="178" rx="16" fill="#2A64E8" fill-opacity=".2"/>
<rect x="311" y="119" width="82" height="82" rx="16" fill="#2A64E8"/>
</svg>
`);
console.log('Icons written to', out);

/* Measure Up stage: things drawn as solid silhouettes standing on one ground line,
   all to the same scale, over a faint grid. Each silhouette is the item's emoji
   cut out and filled with one color (cropped to the shape itself, so heights are
   true). On the reveal, a dashed line marks each player's guess.
   MeasureStage.create(canvas).draw({ k, items, lines })
     k      pixels per meter
     items  [{ id, emoji, color, v, x (0..1 across), alpha, top (label above), handle, mystery }]
     lines  [{ v, color, label, x0, x1 (0..1) }] */
(() => {
  'use strict';
  const FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  const cache = new Map();
  // Hand-drawn outlines for things no emoji shows well (and for emojis that draw as a
  // whole square picture). [width, height, SVG path or draw function]; each one runs
  // from the very top of its box to the very bottom, so its height is the real height.
  const OUTLINES = {
    tower: [30, 100, 'M14 0h2v12h3v10h3v18h3v60H5V40h3V22h3V12h3z'],
    bridge: [32, 100, 'M3 100V3l6-3v100zM23 100V0l6 3v97zM9 9h14v6H9zM9 31h14v5H9zM9 53h14v5H9zM9 75h14v4H9z'],
    atom: [64, 100, g => {
      // nine balls on a cube stood on its corner, on three legs
      const P = [[32, 8], [12, 28], [52, 28], [32, 44], [12, 60], [52, 60], [32, 78]];
      g.strokeStyle = g.fillStyle; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath();
      for (const [a, b] of [[0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [1, 4], [2, 5], [3, 4], [3, 5], [3, 6], [4, 6], [5, 6]]) { g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); }
      g.moveTo(32, 78); g.lineTo(32, 100); g.moveTo(14, 64); g.lineTo(6, 100); g.moveTo(50, 64); g.lineTo(58, 100);
      g.stroke();
      for (const [x, y] of P) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); }
    }],
    obelisk: [16, 100, 'M8 0l3 6 1.5 94h-9L5 6z'],
    sail: [40, 100, 'M6 100V2l2-2q28 30 26 100z'],
    arch: [100, 100, 'M0 100Q50-100 100 100H90Q50-72 10 100z'],
    needle: [36, 100, 'M17 0h2v6h8l8 6-8 4h-6l2 84h-9l2-84h-6l-8-4 8-6h7z'],
    clocktower: [30, 100, 'M14 0h2l6 18v6h2v76H6V24h2v-6z'],
    leaning: [40, 100, 'M6 100L18 0h16L22 100z'],
    shells: [100, 70, 'M0 70Q14 18 46 0Q36 36 48 70zM34 70Q50 26 76 14Q68 44 76 70zM64 70Q76 40 100 32Q94 54 98 70z'],
    arms: [100, 100, g => {
      g.beginPath(); g.arc(50, 7, 7, 0, Math.PI * 2); g.fill();
      g.fill(new Path2D('M43 15h14l1 6h38v8H58l-2 71H44l-2-71H4v-8h38z'));
    }],
    letter: [44, 100, 'M0 100V0h14v40h16V0h14v100H30V56H14v44z'],
    wings: [100, 37, 'M45 0h10l2 37H43zM0 6l44 2v6L0 13zM100 6l-44 2v6l44-1z'],
    hoop: [40, 100, 'M2 0h22v14h-2V4H5v96H2zM24 0h14v4H24z'],
    goalpost: [40, 100, 'M18 100V42H3V0h4v38h26V0h4v42H22v58z'],
    platform: [40, 100, 'M0 0h40v5H0zM8 5h4v95H8zM28 5h4v95h-4z'],
    net: [100, 100, 'M0 0h4v100H0zM96 0h4v100h-4zM4 0h92v40H4z'],
    lownet: [100, 40, 'M0 0h3v40H0zM97 0h3v40h-3zM3 0h94v40H3z'],
    goal: [100, 34, 'M0 0h100v34h-4V4H4v30H0z'],
    ball: [100, 100, g => { g.beginPath(); g.arc(50, 50, 50, 0, Math.PI * 2); g.fill(); }],
    pole: [24, 100, 'M10 0h4v8h10v4H14v88h-4V12H0V8h10z'],
    counter: [100, 60, 'M0 0h100v6h-3v54H3V6H0z'],
    pencil: [8, 100, 'M4 0l4 14v86H0V14z'],
    can: [36, 66, 'M3 66V8q0-8 8-8h14q8 0 8 8v58z'],
  };
  OUTLINES['🏙️'] = OUTLINES['🏙'] = OUTLINES.tower;
  OUTLINES['🌉'] = OUTLINES.bridge;
  OUTLINES['⚛️'] = OUTLINES['⚛'] = OUTLINES.atom;
  function outline(o, color) {
    const [w, h, d] = o, k = 4, c = document.createElement('canvas');
    c.width = w * k; c.height = h * k;
    const g = c.getContext('2d');
    g.scale(k, k); g.fillStyle = color;
    if (typeof d === 'function') d(g); else g.fill(new Path2D(d));
    return c;
  }
  function block(color) {
    const out = document.createElement('canvas'); out.width = 60; out.height = 100;
    const o = out.getContext('2d'); o.fillStyle = color;
    o.beginPath(); o.moveTo(8, 100); o.lineTo(8, 14); o.quadraticCurveTo(8, 0, 22, 0); o.lineTo(38, 0); o.quadraticCurveTo(52, 0, 52, 14); o.lineTo(52, 100); o.fill();
    return out;
  }

  // The emoji (or a named outline) as a one-color cut-out, cropped to its ink.
  function shape(emoji, color) {
    const key = emoji + '|' + color;
    if (cache.has(key)) return cache.get(key);
    if (OUTLINES[emoji]) {
      const img = outline(OUTLINES[emoji], color), res = { img, aspect: img.width / img.height };
      cache.set(key, res);
      return res;
    }
    const S = 220, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = `${Math.round(S * 0.78)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.fillText(emoji, S / 2, S / 2 + S * 0.03);
    const d = g.getImageData(0, 0, S, S).data;
    let top = S, bottom = -1, left = S, right = -1, ink = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (d[(y * S + x) * 4 + 3] > 24) { ink++; if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x; }
    }
    const boxArea = (right - left + 1) * (bottom - top + 1);
    let out;
    if (bottom < 0 || (ink / boxArea > 0.93 && boxArea > S * S * 0.35)) {
      // No emoji font here (some TV browsers), or the emoji is a square picture:
      // a rounded block stands in.
      out = block(color);
    } else {
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, S, S);
      const w = right - left + 1, h = bottom - top + 1;
      out = document.createElement('canvas'); out.width = w; out.height = h;
      out.getContext('2d').drawImage(c, left, top, w, h, 0, 0, w, h);
    }
    const res = { img: out, aspect: out.width / out.height };
    cache.set(key, res);
    return res;
  }

  // Width over height of an emoji's silhouette.
  const aspects = new Map();
  function aspect(emoji) {
    if (!aspects.has(emoji)) aspects.set(emoji, shape(emoji, '#000').aspect);
    return aspects.get(emoji);
  }

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, rects = {};
    function size() {
      // clientWidth/Height, not the on-screen box, so a scaled screen (TV fit) stays sharp
      dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
    }
    const ground = () => H - Math.max(26, H * 0.09);
    function draw(sc) {
      if (!W || !H) size();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const gy = ground(), fs = Math.max(11, Math.round(H * 0.045));
      // grid
      ctx.strokeStyle = 'rgba(140, 156, 184, 0.10)';
      ctx.lineWidth = 1;
      const step = Math.max(28, Math.round(H / 8));
      ctx.beginPath();
      for (let x = (W / 2) % step; x < W; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, gy); }
      for (let y = gy; y > 0; y -= step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
      ctx.stroke();
      // ground
      ctx.fillStyle = 'rgba(111, 155, 255, 0.07)';
      ctx.fillRect(0, gy, W, H - gy);
      ctx.strokeStyle = 'rgba(111, 155, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      // silhouettes
      rects = {};
      const tops = [];
      for (const it of sc.items || []) {
        const cx = it.x * W;
        if (it.mystery) {
          const h = Math.min(gy - 10, it.v * sc.k), w = Math.max(30, h * 0.55);
          ctx.save();
          ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.strokeStyle = it.color;
          ctx.strokeRect(cx - w / 2, gy - h, w, h);
          ctx.fillStyle = it.color; ctx.font = `800 ${Math.round(Math.min(h * 0.5, H * 0.25))}px system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', cx, gy - h / 2);
          ctx.restore();
          rects[it.id] = { x: cx - w / 2, y: gy - h, w, h };
          continue;
        }
        const s = shape(it.emoji, it.color), h = Math.max(2, it.v * sc.k), w = h * s.aspect;
        ctx.save();
        ctx.globalAlpha = it.alpha == null ? 1 : it.alpha;
        ctx.drawImage(s.img, cx - w / 2, gy - h, w, h);
        ctx.restore();
        rects[it.id] = { x: cx - w / 2, y: gy - h, w, h };
        if (it.top || it.handle) tops.push({ it, cx, w, ly: Math.max(fs + 2, gy - h - 6) });
      }
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      // Labels never sit on top of each other: each takes a free spot nearest its own height.
      const placed = [];
      const hits = a => placed.some(b => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
      for (const t of tops) {
        t.tw = t.it.top ? ctx.measureText(t.it.top).width : 0;
        if (t.it.top) placed.push({ x: t.cx - t.tw / 2 - 4, y: t.ly - fs - 2, w: t.tw + 8, h: fs + 4 });
      }
      // guess lines
      const lines = (sc.lines || []).map(l => Object.assign({ y: gy - l.v * sc.k }, l)).sort((a, b) => a.y - b.y);
      for (const l of lines) {
        l.x0p = (l.x0 == null ? 0.5 : l.x0) * W; l.x1p = (l.x1 == null ? 0.98 : l.x1) * W;
        ctx.save();
        ctx.setLineDash([7, 5]); ctx.lineWidth = 2; ctx.strokeStyle = l.color;
        ctx.beginPath(); ctx.moveTo(l.x0p, l.y); ctx.lineTo(l.x1p, l.y); ctx.stroke();
        ctx.restore();
      }
      for (const l of lines) {
        const tw = ctx.measureText(l.label).width, base = Math.min(gy - 2, Math.max(fs + 3, l.y));
        const box = ty => ({ x: l.x1p - tw - 6, y: ty - fs - 3, w: tw + 8, h: fs + 4 });
        let ty = base;
        if (hits(box(base))) {
          for (let n = 1; n < 20; n++) {
            const cand = base + Math.ceil(n / 2) * (fs + 4) * (n % 2 ? -1 : 1);
            if (cand < fs + 3 || cand > gy - 2) continue;
            if (!hits(box(cand))) { ty = cand; break; }
          }
        }
        placed.push(box(ty));
        ctx.fillStyle = 'rgba(7, 12, 22, 0.8)';
        ctx.fillRect(l.x1p - tw - 6, ty - fs - 3, tw + 8, fs + 4);
        ctx.fillStyle = l.color; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(l.label, l.x1p, ty);
      }
      // heights above the silhouettes, and the ↗ handle on the one you size
      for (const t of tops) {
        if (t.it.top) {
          ctx.fillStyle = 'rgba(7, 12, 22, 0.55)';
          ctx.fillRect(t.cx - t.tw / 2 - 4, t.ly - fs - 2, t.tw + 8, fs + 4);
          ctx.fillStyle = t.it.labelColor || t.it.color; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(t.it.top, t.cx, t.ly);
        }
        if (t.it.handle) {
          const hx = Math.min(W - 10, t.cx + Math.max(t.w / 2 + 4, t.tw / 2 + 8) + 7), hy = Math.max(10, t.ly - fs / 2);
          ctx.save();
          ctx.strokeStyle = 'rgba(238, 242, 250, 0.85)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx - 7, hy + 7); ctx.lineTo(hx + 7, hy - 7); ctx.moveTo(hx, hy - 7); ctx.lineTo(hx + 7, hy - 7); ctx.lineTo(hx + 7, hy); ctx.stroke();
          ctx.restore();
        }
      }
    }
    return { draw, size, ground, rects: () => rects, width: () => W, height: () => H };
  }

  window.MeasureStage = { create, shape, aspect };
})();

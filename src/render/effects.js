/**
 * Redaction rendering. Every effect destroys information (block-averaging) *before* any smoothing,
 * so blurred regions cannot be "un-blurred" – the original pixels are never kept in the output.
 */

export const STYLES = {
  blur:     { label: 'Blur' },
  pixelate: { label: 'Pixelate' },
  blackout: { label: 'Blackout' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Rectangle actually covered for a region (adds breathing room, more for faces). */
export function coverRect(r, W, H) {
  const isFace = r.type === 'face';
  const padX = isFace ? r.w * 0.18 : Math.max(3, r.h * 0.18);
  const padY = isFace ? r.h * 0.28 : Math.max(2, r.h * 0.14);
  const x0 = clamp(Math.floor(r.x - padX), 0, W);
  const y0 = clamp(Math.floor(r.y - padY), 0, H);
  const x1 = clamp(Math.ceil(r.x + r.w + padX), 0, W);
  const y1 = clamp(Math.ceil(r.y + r.h + padY), 0, H);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Size (px) of one mosaic cell. strength 0..1 (higher = coarser). */
export function cellSize(rect, type, strength) {
  const shorter = Math.min(rect.w, rect.h);
  // Text gets very coarse cells (≈1–2.4 across a line's height): fine mosaics of known fonts can be brute-forced back
  // into text (see "Depix"/"Unredacter"), so a text cell must span most of a glyph.
  const cells = type === 'face' || type === 'barcode' ? 11 - 6 * strength : 2.4 - 1.4 * strength; // cells across the short side
  return Math.max(3, Math.round(shorter / cells));
}

function shapePath(ctx, rect, type) {
  ctx.beginPath();
  if (type === 'face') {
    ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
  } else {
    const rad = Math.min(rect.h / 4, 6);
    const { x, y, w, h } = rect;
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
}

/** Average colour of each `cell`×`cell` block → tiny canvas (1px per block). */
function averageBlocks(source, rect, cell, noise = 0) {
  const sctx = source.getContext('2d', { willReadFrequently: true });
  const { data } = sctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  const bw = Math.ceil(rect.w / cell);
  const bh = Math.ceil(rect.h / cell);
  const small = document.createElement('canvas');
  small.width = bw; small.height = bh;
  const out = small.getContext('2d');
  const img = out.createImageData(bw, bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let r = 0, g = 0, b = 0, n = 0;
      const y1 = Math.min(rect.h, (by + 1) * cell);
      const x1 = Math.min(rect.w, (bx + 1) * cell);
      for (let y = by * cell; y < y1; y++) {
        let i = (y * rect.w + bx * cell) * 4;
        for (let x = bx * cell; x < x1; x++, i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
      }
      const o = (by * bw + bx) * 4;
      // Random jitter per block defeats attacks that re-pixelate candidate text and look for an exact colour match.
      const j = noise ? (Math.random() * 2 - 1) * noise : 0;
      img.data[o] = r / n + j; img.data[o + 1] = g / n + j; img.data[o + 2] = b / n + j; img.data[o + 3] = 255;
    }
  }
  out.putImageData(img, 0, 0);
  return { small, bw, bh };
}

const FILTER_OK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

function applyOne(ctx, source, region, style, strength) {
  const W = source.width, H = source.height;
  const rect = coverRect(region, W, H);
  ctx.save();
  shapePath(ctx, rect, region.type);
  ctx.clip();

  if (style === 'blackout') {
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else {
    const cell = cellSize(rect, region.type, strength);
    // Blur samples a slightly larger area so the soft edge blends with the surroundings.
    const grow = style === 'blur' ? cell : 0;
    const area = {
      x: clamp(rect.x - grow, 0, W), y: clamp(rect.y - grow, 0, H),
      w: 0, h: 0,
    };
    area.w = clamp(rect.x + rect.w + grow, 0, W) - area.x;
    area.h = clamp(rect.y + rect.h + grow, 0, H) - area.y;
    const { small, bw, bh } = averageBlocks(source, area, cell, region.type === 'face' ? 0 : 10);
    if (style === 'pixelate') {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, bw, bh, area.x, area.y, bw * cell, bh * cell);
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (FILTER_OK) ctx.filter = `blur(${(cell * 0.55).toFixed(1)}px)`;
      ctx.drawImage(small, 0, 0, bw, bh, area.x, area.y, bw * cell, bh * cell);
      ctx.filter = 'none';
    }
  }
  ctx.restore();
}

/**
 * Draws `source` onto `target` with all given regions redacted.
 * @param {HTMLCanvasElement} target
 * @param {HTMLCanvasElement} source original page (never modified)
 * @param {{type:string,x:number,y:number,w:number,h:number}[]} regions already filtered to the enabled ones
 */
export function renderRedactions(target, source, regions, style = 'blur', strength = 0.6) {
  if (target.width !== source.width) target.width = source.width;
  if (target.height !== source.height) target.height = source.height;
  const ctx = target.getContext('2d');
  ctx.drawImage(source, 0, 0);
  for (const r of regions) applyOne(ctx, source, r, style, strength);
}

/**
 * Barcode & QR detection. Uses the browser's native BarcodeDetector when available (Chrome on macOS/Android/ChromeOS),
 * otherwise falls back to ZXing (pure JS). ZXing only reports scan-line points for 1D codes, so we estimate their
 * full height from the image's stripe energy.
 */
import {
  MultiFormatReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource,
  DecodeHintType, BarcodeFormat,
} from '@zxing/library';

function grayscale(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  return { gray, width, height };
}

async function nativeDetect(canvas) {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const det = new window.BarcodeDetector();
    const res = await det.detect(canvas);
    return res.map((r) => {
      const xs = r.cornerPoints.map((p) => p.x), ys = r.cornerPoints.map((p) => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, confidence: 0.95 };
    });
  } catch { return null; }
}

/** Grow a 1D scan line into a box by following rows/columns that still contain bar-like energy. */
function refineLinear(gray, W, H, p0, p1) {
  const horizontal = Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y);
  const a = horizontal ? Math.min(p0.x, p1.x) : Math.min(p0.y, p1.y);
  const b = horizontal ? Math.max(p0.x, p1.x) : Math.max(p0.y, p1.y);
  const mid = Math.round(horizontal ? (p0.y + p1.y) / 2 : (p0.x + p1.x) / 2);
  const limit = horizontal ? H : W;
  const energy = (k) => {
    let e = 0;
    for (let t = Math.max(1, Math.floor(a)); t < Math.min(horizontal ? W : H, Math.ceil(b)); t++) {
      const i = horizontal ? k * W + t : t * W + k;
      const j = horizontal ? i - 1 : i - W;
      e += Math.abs(gray[i] - gray[j]);
    }
    return e;
  };
  const base = Math.max(1, energy(clampi(mid, 0, limit - 1)));
  let lo = mid, hi = mid, miss = 0;
  for (let k = mid; k >= 0; k--) { if (energy(k) > base * 0.35) { lo = k; miss = 0; } else if (++miss > 3) break; }
  miss = 0;
  for (let k = mid; k < limit; k++) { if (energy(k) > base * 0.35) { hi = k; miss = 0; } else if (++miss > 3) break; }
  // A real 1D code looks (almost) the same on every row across its height; lines of text do not.
  // Compare the binarised scan line with rows at 25% / 75% of the found height.
  const sample = (k) => {
    const v = [];
    for (let t = Math.floor(a); t < Math.ceil(b); t++) v.push(gray[horizontal ? k * W + t : t * W + k]);
    return v;
  };
  const midRow = sample(clampi(mid, 0, limit - 1));
  const thr = (Math.min(...midRow) + Math.max(...midRow)) / 2;
  let coherence = 0;
  if (hi - lo >= 8) {
    const rows = [0.25, 0.75].map((f) => sample(Math.round(lo + (hi - lo) * f)));
    const agree = rows.map((r) => r.reduce((n, v, i) => n + ((v < thr) === (midRow[i] < thr) ? 1 : 0), 0) / r.length);
    coherence = Math.min(...agree);
  }
  const quiet = (b - a) * 0.04 + 4;
  // Human-readable digits are often printed under the bars: extend the box only if there is real ink there.
  const maxCap = Math.ceil((hi - lo + 1) * 0.6);
  let capEnd = hi;
  for (let k = hi + 1; k <= Math.min(limit - 1, hi + maxCap); k++) if (energy(k) > base * 0.12) capEnd = k;
  const cap = capEnd > hi ? capEnd - hi + 3 : 0;
  return horizontal
    ? { x: a - quiet, y: lo, w: b - a + quiet * 2, h: hi - lo + 1 + cap, coherence }
    : { x: lo, y: a - quiet, w: hi - lo + 1 + cap, h: b - a + quiet * 2, coherence };
}
const clampi = (v, a, b) => Math.max(a, Math.min(b, v));

function zxingPass(canvas) {
  const { gray, width, height } = grayscale(canvas);
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC, BarcodeFormat.PDF_417,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
  ]);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  const found = [];
  for (let iter = 0; iter < 8; iter++) {
    let result;
    try {
      const src = new RGBLuminanceSource(gray, width, height);
      result = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(src)));
    } catch { break; }
    const pts = result.getResultPoints().map((p) => ({ x: p.getX(), y: p.getY() }));
    if (!pts.length) break;
    let box;
    if (pts.length >= 3 && result.getBarcodeFormat() !== BarcodeFormat.PDF_417) {
      const [bl, tl, tr] = pts;
      const br = { x: bl.x + tr.x - tl.x, y: bl.y + tr.y - tl.y };
      const all = [bl, tl, tr, br];
      const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      const pad = Math.max(w, h) * 0.2 + 3;
      box = { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    } else if (pts.length >= 2) {
      box = refineLinear(gray, width, height, pts[0], pts[pts.length - 1]);
      if (box.coherence < 0.85) {
        console.debug('[redactit] ignored a 1D decode that does not look like a barcode', BarcodeFormat[result.getBarcodeFormat()], box.coherence.toFixed(2));
        box.reject = true;
      }
    } else {
      box = { x: pts[0].x - 40, y: pts[0].y - 40, w: 80, h: 80 };
    }
    box.x = clampi(box.x, 0, width); box.y = clampi(box.y, 0, height);
    box.w = Math.min(box.w, width - box.x); box.h = Math.min(box.h, height - box.y);
    if (!box.reject) found.push({ x: box.x, y: box.y, w: box.w, h: box.h, confidence: 0.9 });
    // blank the area so the next pass can find another code
    const fill = 200;
    for (let y = Math.floor(box.y); y < Math.min(height, Math.ceil(box.y + box.h)); y++) {
      gray.fill(fill, y * width + Math.floor(box.x), y * width + Math.min(width, Math.ceil(box.x + box.w)));
    }
  }
  return found;
}

const overlaps = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter > 0.4 * Math.min(a.w * a.h, b.w * b.h);
};

/** Soft / resampled codes (typical in screenshots) often only decode at a different scale, so try several. */
async function zxingDetect(canvas, onProgress) {
  const all = [];
  const scales = [1, 0.5, 0.7, 0.35, 1.5].filter((s) => s === 1 || (canvas.width * s >= 240 && canvas.height * s >= 240 && canvas.width * s <= 4000));
  let i = 0;
  for (const s of scales) {
    let c = canvas;
    if (s !== 1) {
      c = document.createElement('canvas');
      c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, c.width, c.height);
    }
    for (const b of zxingPass(c)) {
      const box = { x: b.x / s, y: b.y / s, w: b.w / s, h: b.h / s, confidence: b.confidence };
      if (!all.some((o) => overlaps(o, box))) all.push(box);
    }
    onProgress?.(++i / scales.length);
    await new Promise((r) => setTimeout(r)); // keep the UI responsive
  }
  return all;
}

export async function detectBarcodes(canvas, onProgress) {
  const native = await nativeDetect(canvas);
  if (native && native.length) return native;
  return zxingDetect(canvas, onProgress);
}

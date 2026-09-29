/**
 * Face detection – SSD MobileNet v1 running locally via TensorFlow.js (bundled in @vladmandic/face-api).
 * Large images are scanned in overlapping tiles too, so small faces in group photos are not missed.
 */
let libPromise = null;

async function getLib() {
  if (!libPromise) {
    libPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api/dist/face-api.esm.js');
      // WebGL when the GPU allows it, plain CPU otherwise (never the WASM backend – it would need extra files).
      let ok = false;
      try { ok = await faceapi.tf.setBackend('webgl'); } catch { ok = false; }
      if (!ok) await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      await faceapi.nets.ssdMobilenetv1.loadFromUri(new URL(import.meta.env.BASE_URL + 'vendor/face-models', window.location.href).href);
      return faceapi;
    })();
  }
  return libPromise;
}

function iou(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

function nms(boxes, thr = 0.4) {
  boxes.sort((a, b) => b.confidence - a.confidence);
  const keep = [];
  for (const b of boxes) {
    if (!keep.some((k) => iou(k, b) > thr || contains(k, b) || contains(b, k))) keep.push(b);
  }
  return keep;
}
function contains(a, b) { // b mostly inside a
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0) > 0.7 * b.w * b.h;
}

export async function detectFaces(canvas, onProgress, { minConfidence = 0.55 } = {}) {
  const faceapi = await getLib();
  const opts = new faceapi.SsdMobilenetv1Options({ minConfidence, maxResults: 40 });
  const found = [];
  const W = canvas.width, H = canvas.height;

  const run = async (sx, sy, sw, sh) => {
    // SSD-MobileNet squashes its input into a square, which distorts faces in wide/tall images and tanks the score.
    // So every window is letterboxed onto a square canvas (top-left aligned, so coordinates map 1:1).
    const side = Math.max(sw, sh);
    const input = document.createElement('canvas');
    input.width = side; input.height = side;
    const ictx = input.getContext('2d');
    ictx.fillStyle = '#808080';
    ictx.fillRect(0, 0, side, side);
    ictx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    const dets = await faceapi.detectAllFaces(input, opts);
    for (const d of dets) {
      const b = d.box;
      if (b.width < 14 || b.height < 14) continue;
      found.push({ x: sx + b.x, y: sy + b.y, w: b.width, h: b.height, confidence: d.score });
    }
  };

  const windows = [[0, 0, W, H]];
  const longest = Math.max(W, H);
  if (longest > 640) {
    // Small faces score much higher when a tile is scanned at higher effective resolution.
    const n = longest > 2200 ? 3 : 2;
    const tw = Math.round(W / (n - 0.4)), th = Math.round(H / (n - 0.4));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      windows.push([Math.round((i * (W - tw)) / (n - 1)), Math.round((j * (H - th)) / (n - 1)), tw, th]);
    }
  }
  let done = 0;
  for (const w of windows) { await run(...w); onProgress?.(++done / windows.length); }
  return nms(found);
}

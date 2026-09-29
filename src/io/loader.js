/**
 * Turns a dropped File into page canvases. Images are decoded honouring EXIF orientation
 * (so the exported result is upright even though we drop the orientation tag).
 * PDFs are rasterised page-by-page – which is also what makes PDF redaction *real*: the text under a
 * redaction box no longer exists in the output.
 */
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { readImageMetadata, readPdfMetadata } from './metadata.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const PDF_SCALE = 2;          // 144 dpi – crisp text, reasonable memory
export const MAX_PDF_PAGES = 60;
const MAX_SIDE = 9000;

const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

export function classify(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (IMAGE_TYPES.test(file.type) || IMAGE_EXT.test(file.name)) return 'image';
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) return 'heic';
  return null;
}

async function imageToCanvas(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await createImageBitmap(file);
  }
  let { width: w, height: h } = bmp;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.round(w * k); h = Math.round(h * k);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';           // flatten transparency so exports never show through
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return canvas;
}

/**
 * @param {File} file
 * @param {(msg:string)=>void} [onStatus]
 * @returns {Promise<{kind:'image'|'pdf', name:string, pages:HTMLCanvasElement[], meta:{fields:any[],rawCount:number}, truncated:boolean}>}
 */
export async function loadFile(file, onStatus) {
  const kind = classify(file);
  if (kind === 'heic') throw new Error('HEIC photos aren’t supported by browsers yet. Convert to JPG/PNG first (on iPhone: Settings → Camera → Formats → Most Compatible).');
  if (!kind) throw new Error('Unsupported file type. Drop a PNG, JPG, WebP, GIF, BMP, AVIF or PDF.');

  const name = file.name || 'pasted-image.png';
  if (kind === 'image') {
    const [canvas, meta] = await Promise.all([imageToCanvas(file), readImageMetadata(file)]);
    return { kind, name, pages: [canvas], meta, truncated: false };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const base = new URL(import.meta.env.BASE_URL + 'vendor/pdfjs/', window.location.href).href;
  const pdf = await pdfjs.getDocument({
    data,
    standardFontDataUrl: base + 'standard_fonts/',
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    isEvalSupported: false,
  }).promise;
  const meta = await readPdfMetadata(pdf);
  const count = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pages = [];
  for (let i = 1; i <= count; i++) {
    onStatus?.(`Rendering page ${i} of ${count}…`);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: PDF_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas);
    page.cleanup();
  }
  pdf.destroy();
  return { kind, name, pages, meta, truncated: pdf.numPages > MAX_PDF_PAGES };
}

/**
 * Export = re-encode from raw pixels. Nothing from the source file (EXIF, XMP, IPTC, ICC, PDF info, embedded
 * text layers, thumbnails…) can be carried over because we never copy bytes – we only write fresh pixels.
 */
import { PDFDocument } from 'pdf-lib';
import { renderRedactions } from '../render/effects.js';
import { PDF_SCALE } from './loader.js';
import { verifyImageClean } from './metadata.js';

const toBlob = (canvas, type, quality) =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed'))), type, quality));

function flatten(source, regions, style, strength) {
  const c = document.createElement('canvas');
  renderRedactions(c, source, regions, style, strength);
  return c;
}

export function outputName(name, ext) {
  const base = name.replace(/\.[^.]+$/, '') || 'document';
  return `${base}-redacted.${ext}`;
}

/** @param pages {{canvas:HTMLCanvasElement, regions:any[]}[]} */
export async function exportImage(page, { style, strength, format }) {
  const out = flatten(page.canvas, page.regions, style, strength);
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await toBlob(out, mime, 0.93);
  const clean = await verifyImageClean(blob);
  return { blob, ext: format === 'jpeg' ? 'jpg' : 'png', clean };
}

export async function exportPdf(pages, { style, strength }) {
  const doc = await PDFDocument.create({ updateMetadata: false }); // no default Producer / dates
  for (const p of pages) {
    const out = flatten(p.canvas, p.regions, style, strength);
    const jpg = await toBlob(out, 'image/jpeg', 0.92);
    const img = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const page = doc.addPage([out.width / PDF_SCALE, out.height / PDF_SCALE]);
    page.drawImage(img, { x: 0, y: 0, width: out.width / PDF_SCALE, height: out.height / PDF_SCALE });
  }
  const bytes = await doc.save({ useObjectStreams: false });
  const blob = new Blob([bytes], { type: 'application/pdf' });

  // Verify: reopen and make sure the info dictionary is empty.
  const check = await PDFDocument.load(bytes, { updateMetadata: false });
  const clean = ![check.getAuthor(), check.getTitle(), check.getCreator(), check.getProducer(), check.getSubject(), check.getKeywords(), check.getCreationDate(), check.getModificationDate()]
    .some((v) => v !== undefined && v !== null && v !== '');
  return { blob, ext: 'pdf', clean };
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyImage(blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

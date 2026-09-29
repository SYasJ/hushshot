// Copies the OCR engine, language data, face model and PDF.js fonts out of node_modules into
// public/vendor so the app is fully self-contained and never touches a CDN at runtime.
import { cpSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'public', 'vendor', p);

function copy(src, dest) {
  if (!existsSync(src)) { console.warn(`[assets] missing ${src} – did you run npm install?`); return; }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

// Tesseract OCR: worker + LSTM-only WASM cores (plain + SIMD) + English model
copy(nm('tesseract.js/dist/worker.min.js'), out('tesseract/worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
  copy(nm(`tesseract.js-core/${f}`), out(`tesseract/${f}`));
}
copy(nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), out('tesseract/eng.traineddata.gz'));

// Face detection model (SSD MobileNet v1)
for (const f of readdirSync(nm('@vladmandic/face-api/model')).filter((n) => n.startsWith('ssd_mobilenetv1'))) {
  copy(nm(`@vladmandic/face-api/model/${f}`), out(`face-models/${f}`));
}

// PDF.js fonts + CMaps (needed for PDFs that don't embed their fonts)
copy(nm('pdfjs-dist/standard_fonts'), out('pdfjs/standard_fonts'));
copy(nm('pdfjs-dist/cmaps'), out('pdfjs/cmaps'));

console.log('[assets] vendored offline assets ready in public/vendor');

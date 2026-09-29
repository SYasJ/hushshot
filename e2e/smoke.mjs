// End-to-end smoke test: opens the production build in headless Chromium, feeds it the fictional sample
// documents and asserts what gets detected, redacted and stripped.
//   npm run build && npm run preview &   then   node e2e/smoke.mjs [url] [--shots]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const url = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4173/';
const shots = process.argv.includes('--shots');
const root = new URL('..', import.meta.url).pathname;
if (shots) mkdirSync(root + 'docs', { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push('[pageerror] ' + e.message));
const external = [];
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(new URL(url).origin) && !/^(blob|data):/.test(u)) external.push(u); });

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) failed++; };

await page.goto(url);
if (shots) await page.screenshot({ path: root + 'docs/landing.png' });

// ── 1. sample pay stub ──
await page.setInputFiles('#file', root + 'public/samples/sample-paystub.png');
await page.waitForSelector('body[data-scan="done"]', { timeout: 240_000 });
const counts = await page.$$eval('.cat', (els) => Object.fromEntries(els.map((e) => [e.dataset.type, +e.querySelector('.n').textContent])));
console.log('detected:', counts);
ok(counts.email >= 1, 'email detected');
ok(counts.phone >= 2, 'both phone numbers detected');
ok(counts.ssn >= 1, 'SSN detected');
ok(counts.address >= 2, 'street + city/state/zip detected');
ok(counts.card >= 1, 'credit card detected');
ok(counts.account >= 2, 'account + routing detected');
ok(counts.dob >= 1, 'date of birth detected');
ok(counts.face >= 1, 'face detected');
ok(counts.barcode >= 2, 'QR + barcode detected');
if (shots) await page.screenshot({ path: root + 'docs/screenshot-app.png' });

// save PNG and check pixels differ inside a region + metadata clean
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save')]);
const out = await dl.path();
mkdirSync(root + 'e2e/out', { recursive: true });
await dl.saveAs(root + 'e2e/out/paystub-redacted.png');
ok(dl.suggestedFilename() === 'sample-paystub-redacted.png', `filename ${dl.suggestedFilename()}`);
await page.waitForSelector('#save-note:not([hidden])');
ok((await page.textContent('#save-note')).includes('0 metadata fields'), 'export verified clean');

// Independent check: OCR the *exported* image. None of the secrets may still be readable.
{
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('eng', 1, { langPath: root + 'public/vendor/tesseract', gzip: true, cacheMethod: 'none' });
  const { data } = await w.recognize(root + 'e2e/out/paystub-redacted.png');
  await w.terminate();
  const flat = data.text.replace(/\s+/g, ' ');
  for (const secret of ['123-45-6789', 'jordan.doe', '555-2671', '4242 4242', 'Evergreen', '62704', '00123456789', '021000021', '04/12/1988']) {
    ok(!flat.includes(secret), `exported image no longer contains "${secret}" (OCR)`);
  }
  ok(flat.includes('Northwind') && flat.includes('Net pay'), 'non-sensitive text is still readable');
}

// ── 2. JPEG with GPS EXIF ──
await page.click('#btn-reset');
await page.setInputFiles('#file', root + 'public/samples/sample-with-gps.jpg');
await page.waitForSelector('#workspace:not([hidden])');
const metaText = await page.textContent('#meta');
ok(/iPhone 15 Pro/.test(metaText) && /34\.0647/.test(metaText), 'EXIF camera + GPS shown before stripping');
await page.waitForSelector('body[data-scan="done"]', { timeout: 240_000 });
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save')]);
const jpg = readFileSync(await dl2.path());
ok(!jpg.includes(Buffer.from('Exif')) && !jpg.includes(Buffer.from('iPhone')), 'output JPEG has no EXIF segment / camera string');
ok(jpg[0] === 0xff && jpg[1] === 0xd8, 'output is a valid JPEG');

// ── 3. manual box + style switch ──
await page.click('.seg button[data-style="blackout"]');
const box = await page.$('#overlay');
const bb = await box.boundingBox();
await page.mouse.move(bb.x + bb.width * 0.1, bb.y + bb.height * 0.85);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.93, { steps: 5 });
await page.mouse.up();
ok((await page.$$('.box.manual')).length === 1, 'manual box drawn');

// ── 4. PDF round trip ──
await page.click('#btn-reset');
const pdfPath = root + 'public/samples/sample-lease.pdf';
await page.setInputFiles('#file', pdfPath);
await page.waitForSelector('body[data-scan="done"]', { timeout: 240_000 });
const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save')]);
const pdfBytes = readFileSync(await dl3.path());
const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
ok(doc.getPageCount() === 2, 'PDF keeps 2 pages');
ok(!doc.getAuthor() && !doc.getTitle() && !doc.getProducer(), 'PDF info dictionary empty');
ok(!pdfBytes.includes(Buffer.from('123-45-6789')), 'PDF contains no selectable secret text');

ok(external.length === 0, `no external network requests${external.length ? ': ' + external.join(', ') : ''}`);
const real = problems.filter((p) => !/GPU stall|WebGL|swiftshader|Automatic fallback/i.test(p));
if (real.length) console.log('console problems:\n' + real.join('\n'));
ok(real.length === 0, 'no console errors / CSP violations');
await browser.close();
process.exit(failed ? 1 : 0);

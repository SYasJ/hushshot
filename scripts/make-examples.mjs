// Runs every sample through the real app (production build) and saves before/blur/pixelate/blackout exports
// to docs/examples/<name>/, then composes docs/examples/<name>-comparison.png.
//   npm run build && npx vite preview --port 4173 &  node scripts/make-examples.mjs
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';

const url = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4173/';
const root = new URL('..', import.meta.url).pathname;
const STYLES = ['blur', 'pixelate', 'blackout'];

// name, file, crop (fraction of blank bottom to trim in the comparison sheet)
const DOCS = [
  ['paystub', 'sample-paystub.png', 0.2],
  ['chat-dark-mode', 'sample-chat-dark.png', 0],
  ['id-card', 'sample-id-card.png', 0],
  ['medical-form', 'sample-medical-form.png', 0],
  ['checkout', 'sample-checkout.png', 0],
  ['group-photo', 'sample-group-photo.jpg', 0],
  ['lease-pdf-page2', 'sample-lease.pdf', 0.55],
];
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const summary = {};

for (const [name, file, crop] of DOCS) {
  if (only && only !== name) continue;
  const dir = `${root}docs/examples/${name}`;
  mkdirSync(dir, { recursive: true });
  const isPdf = file.endsWith('.pdf');
  const ext = file.endsWith('.jpg') ? 'jpg' : 'png';
  console.log(`\n▶ ${name}`);
  await page.goto(url);
  await page.setInputFiles('#file', `${root}public/samples/${file}`);
  await page.waitForSelector('body[data-scan="done"]', { timeout: 600_000 });
  const counts = await page.$$eval('.cat', (els) => Object.fromEntries(els.map((e) => [e.dataset.type, +e.querySelector('.n').textContent]).filter(([, n]) => n)));
  summary[name] = counts;
  console.log('  found:', JSON.stringify(counts));

  if (isPdf) {
    await page.click('#pg-next');                       // page 2 has the SSN / DOB / card
    const grab = () => page.evaluate(() => document.getElementById('preview').toDataURL('image/png').split(',')[1]);
    // "before" = every category switched off
    // The category list re-renders on every click, so look each one up fresh by type.
    const toggleAll = async (on) => {
      const types = await page.$$eval('.cat', (els) => els.map((e) => e.dataset.type));
      for (const t of types) {
        await page.evaluate(([t, on]) => { const c = document.querySelector(`.cat[data-type="${t}"]`); if (c && c.classList.contains('enabled') !== on) c.click(); }, [t, on]);
      }
    };
    await toggleAll(false);
    await page.waitForTimeout(300);
    writeFileSync(`${dir}/before.png`, Buffer.from(await grab(), 'base64'));
    await toggleAll(true);
    for (const s of STYLES) {
      await page.click(`.seg button[data-style="${s}"]`);
      await page.waitForTimeout(400);
      writeFileSync(`${dir}/${s}.png`, Buffer.from(await grab(), 'base64'));
    }
  } else {
    copyFileSync(`${root}public/samples/${file}`, `${dir}/before.${ext}`);
    for (const s of STYLES) {
      await page.click(`.seg button[data-style="${s}"]`);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save')]);
      await dl.saveAs(`${dir}/${s}.${ext}`);
      console.log(`  saved ${s}`);
    }
  }
  // comparison sheet (2×2)
  const b64 = (p) => `data:image/${p.endsWith('jpg') ? 'jpeg' : 'png'};base64,` + readFileSync(p).toString('base64');
  const dims = (p) => { const b = readFileSync(p); return b.readUInt32BE(16) ? [b.readUInt32BE(16), b.readUInt32BE(20)] : [1, 1]; };
  const cell = (label, p, color) => {
    const [w, h] = p.endsWith('png') ? dims(p) : [4, 3];
    const ar = crop ? `${w} / ${h * (1 - crop)}` : 'auto';
    return `<div><div class=l style="color:${color}">${label}</div><div class=im style="aspect-ratio:${ar}"><img src="${b64(p)}" style="${crop ? 'height:100%;object-fit:cover;object-position:top' : ''}"></div></div>`;
  };
  const e = (n) => `${dir}/${n}.${isPdf ? 'png' : ext}`;
  const sheet = await ctx.newPage();
  await sheet.setViewportSize({ width: 1500, height: 800 });
  await sheet.setContent(`<style>body{margin:0;background:#0a0c11;color:#eceff7;font-family:system-ui;padding:28px;width:1500px;box-sizing:border-box}
  .g{display:grid;grid-template-columns:1fr 1fr;gap:26px 28px;align-items:start}.l{font-weight:800;letter-spacing:.12em;font-size:14px;margin-bottom:10px}
  .im{border-radius:12px;overflow:hidden;box-shadow:0 20px 50px -20px #000;line-height:0;background:#000}img{width:100%;display:block}</style>
  <div class=g>${cell('BEFORE', e('before'), '#f87171')}${cell('BLUR (default)', e('blur'), '#34d399')}${cell('PIXELATE', e('pixelate'), '#22d3ee')}${cell('BLACKOUT', e('blackout'), '#a78bfa')}</div>`);
  await sheet.waitForTimeout(500);
  await sheet.screenshot({ path: `${root}docs/examples/${name}-comparison.png`, fullPage: true });
  await sheet.close();
}
writeFileSync(`${root}docs/examples/summary.json`, JSON.stringify(summary, null, 2));
await browser.close();
console.log('\ndone');

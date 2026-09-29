import './style.css';
import { CATEGORIES } from './detect/patterns.js';
import { TEXT_TYPES } from './detect/patterns.js';
import { regionsFromLines, maskHint } from './detect/textRegions.js';
import { renderRedactions } from './render/effects.js';

const $ = (id) => document.getElementById(id);
const BASE = import.meta.env.BASE_URL;

const TAGS = {
  card: 'Credit card', ssn: 'SSN / ID', email: 'Email', phone: 'Phone', address: 'Address', account: 'Account no.',
  dob: 'Birth date', secret: 'Secret / key', face: 'Face', barcode: 'Barcode / QR', manual: 'Manual',
};
const CAT_ORDER = ['card', 'ssn', 'email', 'phone', 'address', 'account', 'dob', 'secret', 'face', 'barcode', 'manual'];

/** @type {{doc:any, page:number, style:string, strength:number, catOn:Record<string,boolean>, scanning:boolean, run:number}} */
const state = { doc: null, page: 0, style: 'blur', strength: 0.65, catOn: {}, scanning: false, run: 0 };
let nextId = 1;

/* ───────────────────────── helpers ───────────────────────── */
const isActive = (r) => state.catOn[r.type] !== false && r.on;
const cur = () => state.doc.pages[state.page];
const activeRegions = (p) => p.regions.filter(isActive);
const preview = $('preview');
let rafId = 0;
const schedule = () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(renderNow); };

function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), ms);
}
function showError(msg) {
  const e = $('landing-error');
  e.textContent = msg; e.hidden = !msg;
}

/* ───────────────────────── rendering ───────────────────────── */
function renderNow() {
  if (!state.doc) return;
  const p = cur();
  renderRedactions(preview, p.canvas, activeRegions(p), state.style, state.strength);
}

function drawOverlay() {
  const ov = $('overlay');
  ov.replaceChildren();
  if (!state.doc) return;
  const p = cur();
  const W = p.canvas.width, H = p.canvas.height;
  for (const r of p.regions) {
    const el = document.createElement('div');
    el.className = `box ${isActive(r) ? 'on' : 'off'} ${r.type === 'face' ? 'face' : ''} ${r.manual ? 'manual' : ''}`;
    const padX = r.type === 'face' ? r.w * 0.18 : Math.max(3, r.h * 0.18);
    const padY = r.type === 'face' ? r.h * 0.28 : Math.max(2, r.h * 0.14);
    el.style.left = `${((r.x - padX) / W) * 100}%`;
    el.style.top = `${((r.y - padY) / H) * 100}%`;
    el.style.width = `${((r.w + padX * 2) / W) * 100}%`;
    el.style.height = `${((r.h + padY * 2) / H) * 100}%`;
    el.dataset.id = r.id;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `${TAGS[r.type]}${r.hint ? ' · ' + r.hint : ''}${isActive(r) ? '' : ' · NOT hidden'}`;
    el.append(tag);
    if (r.manual) {
      const x = document.createElement('span');
      x.className = 'x'; x.textContent = '×'; x.title = 'Remove';
      x.dataset.remove = r.id;
      el.append(x);
    }
    ov.append(el);
  }
}

function drawCategories() {
  const ul = $('cats');
  ul.replaceChildren();
  const counts = {};
  let total = 0;
  if (state.doc) for (const p of state.doc.pages) for (const r of p.regions) counts[r.type] = (counts[r.type] || 0) + 1;
  const order = CAT_ORDER.filter((t) => t !== 'manual' || counts.manual);
  order.sort((a, b) => (counts[b] ? 1 : 0) - (counts[a] ? 1 : 0) || CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));
  for (const t of order) {
    const n = counts[t] || 0;
    if (state.catOn[t] !== false) total += n;
    const li = document.createElement('li');
    li.className = `cat ${n ? 'has' : 'none'} ${state.catOn[t] !== false ? 'enabled' : ''}`;
    li.dataset.type = t;
    li.setAttribute('role', 'switch');
    li.setAttribute('aria-checked', String(state.catOn[t] !== false));
    li.tabIndex = 0;
    const meta = t === 'manual' ? { icon: '✏️', label: 'Drawn by you' } : CATEGORIES[t];
    li.innerHTML = '<span class="ic"></span><span class="lbl"></span><span class="n"></span><span class="switch"></span>';
    li.children[0].textContent = meta.icon;
    li.children[1].textContent = meta.label;
    li.children[2].textContent = n;
    ul.append(li);
  }
  $('scan-count').textContent = total ? `${total} hidden` : '';
  if (!state.scanning && state.doc) $('scan-title').textContent = total ? `Shielded ${total} item${total === 1 ? '' : 's'}` : 'Nothing sensitive found';
}

function drawMeta() {
  const ul = $('meta');
  ul.replaceChildren();
  const { fields } = state.doc.meta;
  const tag = document.querySelector('#meta-card .tag');
  if (!fields.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = state.doc.kind === 'pdf'
      ? 'No document info found. Pages are flattened, so any hidden text layer is discarded too.'
      : 'No EXIF, GPS or camera data found. The export is metadata-free either way.';
    ul.append(li);
    tag.textContent = 'clean'; tag.className = 'tag ok';
    return;
  }
  tag.textContent = `${fields.length} field${fields.length === 1 ? '' : 's'} will be stripped`;
  tag.className = 'tag warn';
  for (const f of fields) {
    const li = document.createElement('li');
    const k = document.createElement('span'); k.className = 'k'; k.textContent = `${f.icon} ${f.label}`;
    const v = document.createElement('span'); v.className = `v ${f.risk}`; v.textContent = f.value;
    li.append(k, v);
    ul.append(li);
  }
}

function drawPageNav() {
  const n = state.doc.pages.length;
  $('pagenav').hidden = n < 2;
  $('pg-label').textContent = `Page ${state.page + 1} / ${n}`;
  $('pg-prev').disabled = state.page === 0;
  $('pg-next').disabled = state.page === n - 1;
}

function refreshAll() { drawOverlay(); drawCategories(); schedule(); }

/* ───────────────────────── scanning ───────────────────────── */
const STEPS = [
  ['ocr', 'Reading text'],
  ['barcode', 'Barcodes & QR codes'],
  ['face', 'Faces'],
];
function initSteps() {
  const ul = $('steps');
  ul.replaceChildren();
  for (const [id, label] of STEPS) {
    const li = document.createElement('li');
    li.id = `step-${id}`;
    li.innerHTML = '<span class="ic">○</span><span class="l"></span><span class="r"></span>';
    li.children[1].textContent = label;
    ul.append(li);
  }
}
function setStep(id, status, right = '') {
  const li = $(`step-${id}`);
  li.className = status;
  li.children[0].textContent = status === 'done' ? '✓' : status === 'fail' ? '!' : status === 'run' ? '' : '○';
  li.children[2].textContent = right;
}

async function scanDocument(runId) {
  const doc = state.doc;
  state.scanning = true;
  document.body.dataset.scan = 'running';
  $('scan-card').classList.remove('done');
  $('scan-title').textContent = 'Scanning…';
  $('scanfx').hidden = false;
  $('btn-save').disabled = true; $('btn-copy').disabled = true;
  initSteps();
  const nPages = doc.pages.length;
  const bar = $('scan-bar');
  const totals = { ocr: 0, barcode: 0, face: 0 };
  const fails = new Set();
  const stale = () => runId !== state.run;

  const load = (p) => p.catch((err) => { console.error('[redactit] could not load detector', err); return null; });
  const [ocrMod, barMod, faceMod] = await Promise.all([
    load(import('./detect/ocr.js')), load(import('./detect/barcodes.js')), load(import('./detect/faces.js')),
  ]);

  const stepOrder = ['ocr', 'barcode', 'face'];
  for (let pi = 0; pi < nPages; pi++) {
    const page = doc.pages[pi];
    const suffix = nPages > 1 ? ` · p${pi + 1}/${nPages}` : '';
    const progress = (si, f) => { bar.style.width = `${(((pi * 3 + si + f) / (nPages * 3)) * 100).toFixed(1)}%`; };

    for (let si = 0; si < 3; si++) {
      const id = stepOrder[si];
      if (fails.has(id)) { progress(si, 1); continue; }
      setStep(id, 'run', suffix.replace(' · ', ''));
      progress(si, 0);
      try {
        let found = [];
        if (!{ ocr: ocrMod, barcode: barMod, face: faceMod }[id]) throw new Error('detector not loaded');
        if (id === 'ocr') {
          const lines = await ocrMod.recognizeLines(page.canvas, (f) => !stale() && progress(si, f));
          page.lines = lines;
          found = regionsFromLines(lines, TEXT_TYPES).map((r) => ({ ...r, hint: maskHint(r.text) }));
        } else if (id === 'barcode') {
          found = (await barMod.detectBarcodes(page.canvas)).map((r) => ({ ...r, type: 'barcode' }));
        } else {
          found = (await faceMod.detectFaces(page.canvas, (f) => !stale() && progress(si, f))).map((r) => ({ ...r, type: 'face' }));
        }
        if (stale()) return;
        for (const r of found) page.regions.push({ id: nextId++, on: true, manual: false, type: r.type, x: r.x, y: r.y, w: r.w, h: r.h, hint: r.hint || '' });
        totals[id] += found.length;
        setStep(id, 'done', `${totals[id]} found`);
        if (pi === state.page) refreshAll(); else drawCategories();
      } catch (err) {
        console.error(`[redactit] ${id} failed`, err);
        fails.add(id);
        setStep(id, 'fail', 'unavailable');
        toast(`Couldn’t run ${STEPS.find((s) => s[0] === id)[1].toLowerCase()} detection – you can still draw boxes by hand.`, 5000);
      }
    }
  }
  if (stale()) return;
  bar.style.width = '100%';
  state.scanning = false;
  $('scan-card').classList.add('done');
  $('scanfx').hidden = true;
  $('btn-save').disabled = false; $('btn-copy').disabled = false;
  refreshAll();
  document.body.dataset.scan = 'done';
}

/* ───────────────────────── open / reset ───────────────────────── */
async function openFile(file) {
  showError('');
  const runId = ++state.run;
  $('dropzone').style.opacity = .6;
  try {
    const { loadFile } = await import('./io/loader.js');
    const doc = await loadFile(file, (m) => ($('dropzone').querySelector('.dz-title').textContent = m));
    if (runId !== state.run) return;
    doc.pages = doc.pages.map((canvas) => ({ canvas, regions: [], lines: [] }));
    state.doc = doc;
    state.page = 0;
    state.catOn = {};
    if (doc.truncated) toast('Only the first 60 pages were loaded.', 5000);
    $('landing').hidden = true;
    $('workspace').hidden = false;
    $('btn-reset').hidden = false;

    const fmt = $('format');
    fmt.replaceChildren();
    const opts = doc.kind === 'pdf'
      ? [['pdf', 'PDF (pages flattened)']]
      : [['png', 'PNG (lossless)'], ['jpeg', 'JPG (smaller)']];
    for (const [v, l] of opts) fmt.append(new Option(l, v));
    fmt.value = doc.kind === 'pdf' ? 'pdf' : (/\.jpe?g$/i.test(doc.name) ? 'jpeg' : 'png');
    $('btn-copy').hidden = doc.kind === 'pdf';
    $('save-note').hidden = true;

    drawMeta();
    drawPageNav();
    preview.width = doc.pages[0].canvas.width;
    preview.height = doc.pages[0].canvas.height;
    refreshAll();
    window.scrollTo({ top: 0 });
    scanDocument(runId);
  } catch (err) {
    console.error(err);
    showError(err.message || 'Could not open that file.');
    $('dropzone').querySelector('.dz-title').textContent = 'Drop a screenshot, photo or PDF here';
  } finally {
    $('dropzone').style.opacity = 1;
  }
}

function reset() {
  state.run++;
  state.doc = null;
  state.scanning = false;
  document.body.dataset.scan = '';
  $('workspace').hidden = true;
  $('landing').hidden = false;
  $('btn-reset').hidden = true;
  $('file').value = '';
  $('dropzone').querySelector('.dz-title').textContent = 'Drop a screenshot, photo or PDF here';
  $('scanfx').hidden = true;
  showError('');
  import('./detect/ocr.js').then((m) => m.disposeOcr()).catch(() => {});
}

/* ───────────────────────── interactions ───────────────────────── */
const fileInput = $('file');
fileInput.addEventListener('change', () => fileInput.files[0] && openFile(fileInput.files[0]));
$('dropzone').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
$('btn-reset').addEventListener('click', reset);
$('brand').addEventListener('click', (e) => { e.preventDefault(); if (state.doc) reset(); });

// built-in example documents (all fictional)
$('samples').addEventListener('click', async (e) => {
  const name = e.target.closest('[data-sample]')?.dataset.sample;
  if (!name) return;
  try {
    const res = await fetch(`${BASE}samples/${name}`);
    if (!res.ok) throw new Error(res.statusText);
    const blob = await res.blob();
    openFile(new File([blob], name, { type: blob.type }));
  } catch { showError('Could not load the sample.'); }
});

// drag & drop anywhere on the page
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('dragveil').hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dragveil').hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; $('dragveil').hidden = true;
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  if (files.length > 1) toast('Opened the first file – RedactIt handles one document at a time.');
  openFile(files[0]);
});
// paste a screenshot straight from the clipboard
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && /^image\//.test(i.type));
  if (!item) return;
  const f = item.getAsFile();
  openFile(new File([f], `pasted-screenshot.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }));
});

// categories
$('cats').addEventListener('click', (e) => {
  const li = e.target.closest('.cat');
  if (!li) return;
  const t = li.dataset.type;
  state.catOn[t] = state.catOn[t] === false;
  refreshAll();
});
$('cats').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('cat')) { e.preventDefault(); e.target.click(); }
});

// style + strength
$('styles').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-style]');
  if (!b) return;
  state.style = b.dataset.style;
  for (const x of $('styles').children) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }
  schedule();
});
$('strength').addEventListener('input', (e) => { state.strength = e.target.value / 100; schedule(); });

// page nav
$('pg-prev').addEventListener('click', () => gotoPage(state.page - 1));
$('pg-next').addEventListener('click', () => gotoPage(state.page + 1));
function gotoPage(i) {
  if (!state.doc || i < 0 || i >= state.doc.pages.length) return;
  state.page = i;
  drawPageNav();
  refreshAll();
}
window.addEventListener('keydown', (e) => {
  if (!state.doc || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight') gotoPage(state.page + 1);
  if (e.key === 'ArrowLeft') gotoPage(state.page - 1);
});

// peek at original
const peekOn = () => { if (!state.doc) return; $('frame').classList.add('peeking'); preview.getContext('2d').drawImage(cur().canvas, 0, 0); };
const peekOff = () => { $('frame').classList.remove('peeking'); schedule(); };
const peek = $('btn-peek');
peek.addEventListener('pointerdown', (e) => { peek.setPointerCapture(e.pointerId); peekOn(); });
peek.addEventListener('pointerup', peekOff);
peek.addEventListener('pointercancel', peekOff);
peek.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); peekOn(); } });
peek.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') peekOff(); });

// overlay: toggle boxes, remove manual, draw new
const overlay = $('overlay');
overlay.addEventListener('click', (e) => {
  if (!state.doc) return;
  const rm = e.target.closest('[data-remove]');
  const box = e.target.closest('.box');
  if (rm) {
    const p = cur();
    p.regions = p.regions.filter((r) => String(r.id) !== rm.dataset.remove);
    refreshAll();
  } else if (box) {
    const r = cur().regions.find((x) => String(x.id) === box.dataset.id);
    if (r) {
      // If the whole category is off, first click turns the region "on" and the category back on.
      if (state.catOn[r.type] === false) { state.catOn[r.type] = true; r.on = true; } else r.on = !r.on;
      refreshAll();
    }
  }
});
let drag = null;
overlay.addEventListener('pointerdown', (e) => {
  if (!state.doc || e.target !== overlay || e.button !== 0) return;
  const rect = overlay.getBoundingClientRect();
  drag = { rect, x0: e.clientX - rect.left, y0: e.clientY - rect.top, el: document.createElement('div') };
  drag.el.className = 'box draft';
  overlay.append(drag.el);
  overlay.setPointerCapture(e.pointerId);
});
overlay.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const x = Math.max(0, Math.min(drag.rect.width, e.clientX - drag.rect.left));
  const y = Math.max(0, Math.min(drag.rect.height, e.clientY - drag.rect.top));
  Object.assign(drag.el.style, {
    left: `${Math.min(x, drag.x0)}px`, top: `${Math.min(y, drag.y0)}px`,
    width: `${Math.abs(x - drag.x0)}px`, height: `${Math.abs(y - drag.y0)}px`,
  });
});
const endDrag = (e) => {
  if (!drag) return;
  const { rect, el } = drag;
  drag = null;
  const w = parseFloat(el.style.width) || 0, h = parseFloat(el.style.height) || 0;
  const l = parseFloat(el.style.left) || 0, t = parseFloat(el.style.top) || 0;
  el.remove();
  if (w < 8 || h < 8 || e.type === 'pointercancel') return;
  const p = cur();
  const sx = p.canvas.width / rect.width, sy = p.canvas.height / rect.height;
  p.regions.push({ id: nextId++, type: 'manual', manual: true, on: true, hint: '', x: l * sx, y: t * sy, w: w * sx, h: h * sy });
  state.catOn.manual = true;
  refreshAll();
};
overlay.addEventListener('pointerup', endDrag);
overlay.addEventListener('pointercancel', endDrag);

// export
$('btn-save').addEventListener('click', async () => {
  if (!state.doc || state.scanning) return;
  const btn = $('btn-save');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sanitizing…';
  const note = $('save-note');
  try {
    const ex = await import('./io/exporter.js');
    const opts = { style: state.style, strength: state.strength };
    const pagesIn = state.doc.pages.map((p) => ({ canvas: p.canvas, regions: activeRegions(p) }));
    let res;
    if (state.doc.kind === 'pdf') res = await ex.exportPdf(pagesIn, opts);
    else res = await ex.exportImage(pagesIn[0], { ...opts, format: $('format').value });
    const name = ex.outputName(state.doc.name, res.ext);
    ex.download(res.blob, name);
    const hidden = pagesIn.reduce((n, p) => n + p.regions.length, 0);
    const stripped = state.doc.meta.fields.length;
    note.className = `save-note ${res.clean ? '' : 'bad'}`;
    note.textContent = res.clean
      ? `✓ Saved ${name} · ${hidden} region${hidden === 1 ? '' : 's'} hidden · ${stripped ? stripped + ' metadata field' + (stripped === 1 ? '' : 's') + ' removed · ' : ''}re-checked: 0 metadata fields in the output`
      : `Saved ${name}, but a metadata check still found data. Please report this bug.`;
    note.hidden = false;
  } catch (err) {
    console.error(err);
    note.className = 'save-note bad'; note.textContent = `Export failed: ${err.message}`; note.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
});
$('btn-copy').addEventListener('click', async () => {
  if (!state.doc || state.scanning) return;
  try {
    const ex = await import('./io/exporter.js');
    const res = await ex.exportImage({ canvas: cur().canvas, regions: activeRegions(cur()) }, { style: state.style, strength: state.strength, format: 'png' });
    await ex.copyImage(res.blob);
    toast('Copied! Paste it into Slack, Discord, ChatGPT… 🛡️');
  } catch (err) {
    console.error(err);
    toast('Your browser blocked clipboard access – use Save instead.', 4500);
  }
});

// Debug hook for tests/development only: open the app with ?debug to inspect internal state from the console.
if (new URLSearchParams(location.search).has('debug')) window.__redactit = {
  state,
  detectFaces: async (...a) => (await import('./detect/faces.js')).detectFaces(...a),
  detectBarcodes: async (...a) => (await import('./detect/barcodes.js')).detectBarcodes(...a),
};

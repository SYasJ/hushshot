/**
 * Turns pattern matches on OCR lines into pixel rectangles.
 * Pure – no DOM – so it is unit-tested in Node.
 *
 * A line is { words: [{ text, bbox:{x0,y0,x1,y1} }] }.
 */
import { findSensitive } from './patterns.js';

export function lineToText(line) {
  let text = '';
  const spans = [];
  for (const w of line.words) {
    if (!w.text || !w.text.trim()) continue;
    if (text) text += ' ';
    const start = text.length;
    text += w.text;
    spans.push({ start, end: text.length, word: w });
  }
  return { text, spans };
}

/** Bounding box of [start,end) inside a line, trimming partially-covered words proportionally. */
export function rectForRange(spans, start, end) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of spans) {
    if (s.end <= start || s.start >= end) continue;
    const b = s.word.bbox;
    const len = s.end - s.start;
    let from = Math.max(start, s.start) - s.start;
    let to = Math.min(end, s.end) - s.start;
    const w = b.x1 - b.x0;
    const charW = w / len;
    const token = s.word.text;
    // Trailing/leading punctuation isn't worth leaving a sliver for ("NW," → cover the comma too).
    if (to < len && /^[.,;:!?)\]"'”’]+$/.test(token.slice(to))) to = len;
    if (from > 0 && /^[("'“‘\[]+$/.test(token.slice(0, from))) from = 0;
    // Character positions are estimated proportionally; cut a little generously on the *sensitive* side.
    let bx0 = b.x0 + w * from / len - (from > 0 ? charW * 0.35 : 0);
    let bx1 = b.x0 + w * to / len + (to < len ? charW * 0.35 : 0);
    bx0 = Math.max(b.x0, bx0); bx1 = Math.min(b.x1, bx1);
    x0 = Math.min(x0, bx0); x1 = Math.max(x1, bx1);
    y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
  }
  if (!isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const WRAPPABLE = ['phone', 'address', 'card'];

function lineBox(spans) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { word: { bbox: b } } of spans) { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  return { x0, y0, x1, y1 };
}

const overlapRatio = (a, b) => {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
};

/**
 * @param {{words:any[]}[]} lines
 * @param {string[]} types
 * @returns {{type:string,x:number,y:number,w:number,h:number,confidence:number,text:string}[]}
 */
export function regionsFromLines(lines, types) {
  const regions = [];
  const infos = [];
  for (const line of lines) {
    const { text, spans } = lineToText(line);
    infos.push({ text, spans, box: text ? lineBox(spans) : null });
    if (!text) continue;
    for (const hit of findSensitive(text, types)) {
      const r = rectForRange(spans, hit.start, hit.end);
      if (r && r.w > 0 && r.h > 0) {
        regions.push({ type: hit.type, ...r, confidence: hit.confidence, text: text.slice(hit.start, hit.end) });
      }
    }
  }

  // Second pass: things that wrap onto the next line ("+1 303 555⏎0166", "742 Evergreen⏎Terrace, Apt 4B").
  const wrapTypes = types.filter((t) => WRAPPABLE.includes(t));
  if (wrapTypes.length) {
    for (let i = 0; i + 1 < infos.length; i++) {
      const a = infos[i], b = infos[i + 1];
      if (!a.text || !b.text) continue;
      const lineH = Math.min(a.box.y1 - a.box.y0, b.box.y1 - b.box.y0);
      const gap = b.box.y0 - a.box.y1;
      const stacked = gap < lineH * 1.0 && gap > -lineH * 0.6 && b.box.x0 < a.box.x1 && a.box.x0 < b.box.x1;
      if (!stacked) continue;
      const boundary = a.text.length;
      for (const hit of findSensitive(`${a.text} ${b.text}`, wrapTypes)) {
        if (!(hit.start < boundary - 1 && hit.end > boundary + 2)) continue; // must genuinely cross the line break
        const r1 = rectForRange(a.spans, hit.start, boundary);
        const r2 = rectForRange(b.spans, 0, hit.end - boundary - 1);
        const text = `${a.text} ${b.text}`.slice(hit.start, hit.end);
        for (const r of [r1, r2]) {
          if (!r || r.w <= 0 || r.h <= 0) continue;
          if (regions.some((x) => x.type === hit.type && overlapRatio(x, r) > 0.6)) continue;
          regions.push({ type: hit.type, ...r, confidence: hit.confidence * 0.9, text });
        }
      }
    }
  }
  return mergeAdjacent(regions);
}

/**
 * Same-type hits that sit next to each other on one line (e.g. "1600 Pennsylvania Ave NW," + "Washington, DC 20500")
 * become one box – otherwise the rounded corners of two neighbours can leave a sliver of text visible between them.
 */
export function mergeAdjacent(regions) {
  const out = [];
  for (const r of regions.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
    const prev = out.find((o) => {
      if (o.type !== r.type) return false;
      const vOverlap = Math.min(o.y + o.h, r.y + r.h) - Math.max(o.y, r.y);
      if (vOverlap < 0.6 * Math.min(o.h, r.h)) return false;
      const gap = r.x - (o.x + o.w);
      return gap > -4 && gap < 0.9 * Math.min(o.h, r.h);
    });
    if (prev) {
      const x1 = Math.max(prev.x + prev.w, r.x + r.w), y1 = Math.max(prev.y + prev.h, r.y + r.h);
      prev.x = Math.min(prev.x, r.x); prev.y = Math.min(prev.y, r.y);
      prev.w = x1 - prev.x; prev.h = y1 - prev.y;
      prev.text = `${prev.text} ${r.text}`;
    } else out.push({ ...r });
  }
  return out;
}

/** Mask a matched string for display: keep at most the first character. */
export function maskHint(s) {
  if (!s) return '';
  const t = s.trim();
  return t[0] + '•'.repeat(Math.min(8, Math.max(2, t.length - 1)));
}

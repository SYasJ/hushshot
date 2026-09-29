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
    const from = Math.max(start, s.start) - s.start;
    const to = Math.min(end, s.end) - s.start;
    const w = b.x1 - b.x0;
    const bx0 = b.x0 + (w * from) / len;
    const bx1 = b.x0 + (w * to) / len;
    x0 = Math.min(x0, bx0); x1 = Math.max(x1, bx1);
    y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
  }
  if (!isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * @param {{words:any[]}[]} lines
 * @param {string[]} types
 * @returns {{type:string,x:number,y:number,w:number,h:number,confidence:number,text:string}[]}
 */
export function regionsFromLines(lines, types) {
  const regions = [];
  for (const line of lines) {
    const { text, spans } = lineToText(line);
    if (!text) continue;
    for (const hit of findSensitive(text, types)) {
      const r = rectForRange(spans, hit.start, hit.end);
      if (r && r.w > 0 && r.h > 0) {
        regions.push({ type: hit.type, ...r, confidence: hit.confidence, text: text.slice(hit.start, hit.end) });
      }
    }
  }
  return regions;
}

/** Mask a matched string for display: keep at most the first character. */
export function maskHint(s) {
  if (!s) return '';
  const t = s.trim();
  return t[0] + '•'.repeat(Math.min(8, Math.max(2, t.length - 1)));
}

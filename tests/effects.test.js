import test from 'node:test';
import assert from 'node:assert/strict';
import { cellSize } from '../src/render/effects.js';

// A text mosaic finer than a glyph can be brute-forced back into text (Depix), so cells must stay coarse.
test('text redaction cells span at least ~40% of the line height at any strength', () => {
  for (const s of [0, 0.3, 0.65, 1]) {
    const cell = cellSize({ w: 400, h: 30 }, 'ssn', s);
    assert.ok(cell >= 30 * 0.4, `strength ${s}: cell ${cell}px is too fine`);
  }
});

test('faces keep a finer mosaic than text', () => {
  assert.ok(cellSize({ w: 200, h: 200 }, 'face', 0.65) < 200 / 4);
});

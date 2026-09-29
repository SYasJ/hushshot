import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTags } from '../src/io/metadata.js';

test('summarizeTags surfaces GPS, device, serial and dates', () => {
  const out = summarizeTags({
    latitude: 34.0647, longitude: -118.2436, Make: 'Apple', Model: 'iPhone 15 Pro',
    BodySerialNumber: 'F2LXK123', DateTimeOriginal: new Date('2026-01-02T03:04:05Z'), Software: 'Photos 9.0',
  });
  const by = Object.fromEntries(out.map((f) => [f.label, f]));
  assert.equal(by['GPS location'].value, '34.0647, -118.2436');
  assert.equal(by['GPS location'].risk, 'high');
  assert.equal(by['Camera / device'].value, 'Apple iPhone 15 Pro');
  assert.equal(by['Camera serial number'].risk, 'high');
  assert.ok(by['Original capture date']);
  assert.ok(by['Edited with']);
});

test('summarizeTags copes with empty input', () => {
  assert.deepEqual(summarizeTags(null), []);
  assert.deepEqual(summarizeTags({}), []);
});

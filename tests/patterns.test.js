import test from 'node:test';
import assert from 'node:assert/strict';
import { findSensitive, luhn } from '../src/detect/patterns.js';
import { regionsFromLines, rectForRange, lineToText } from '../src/detect/textRegions.js';

const found = (text, types) => findSensitive(text, types).map((h) => ({ type: h.type, s: text.slice(h.start, h.end) }));

test('luhn', () => {
  assert.ok(luhn('4111111111111111'));
  assert.ok(luhn('378282246310005'));
  assert.ok(!luhn('4111111111111112'));
});

test('credit cards', () => {
  assert.deepEqual(found('Card 4111 1111 1111 1111 exp 12/29', ['card']), [{ type: 'card', s: '4111 1111 1111 1111' }]);
  assert.deepEqual(found('Amex 3782 822463 10005', ['card']), [{ type: 'card', s: '3782 822463 10005' }]);
  assert.deepEqual(found('4111-1111-1111-1111', ['card']).length, 1);
  assert.deepEqual(found('order #1234567890123456789012', ['card']), []);
  assert.equal(found('Visa **** **** **** 4242', ['card']).length, 1);
});

test('ssn', () => {
  assert.deepEqual(found('SSN 123-45-6789 ok', ['ssn']), [{ type: 'ssn', s: '123-45-6789' }]);
  assert.deepEqual(found('SSN: 123456789', ['ssn']), [{ type: 'ssn', s: '123456789' }]);
  assert.deepEqual(found('ref 000-12-3456', ['ssn']), []);
});

test('email', () => {
  assert.deepEqual(found('mail jane.doe+x@example.co.uk, thanks', ['email']), [{ type: 'email', s: 'jane.doe+x@example.co.uk' }]);
});

test('phone', () => {
  assert.equal(found('Call (415) 555-2671 now', ['phone'])[0].s, '(415) 555-2671');
  assert.equal(found('Call 415-555-2671', ['phone'])[0].s, '415-555-2671');
  assert.equal(found('+1 415 555 2671', ['phone']).length, 1);
  assert.equal(found('Tel +44 20 7946 0958', ['phone']).length, 1);
  assert.deepEqual(found('SSN 123-45-6789', ['phone']), []);
});

test('address', () => {
  assert.equal(found('Lives at 742 Evergreen Terrace, Apt 4B today', ['address'])[0].s, '742 Evergreen Terrace, Apt 4B');
  assert.equal(found('1600 Pennsylvania Ave NW', ['address'])[0].s.startsWith('1600 Pennsylvania Ave'), true);
  assert.equal(found('Springfield, IL 62704', ['address'])[0].s, 'Springfield, IL 62704');
  assert.equal(found('New York NY 10001', ['address']).length, 1);
  assert.equal(found('PO Box 1234', ['address']).length, 1);
  assert.deepEqual(found('We shipped 3 items to the Way', ['address']), []);
});

test('labelled account, dob, secrets', () => {
  assert.equal(found('Account No: 00123456789', ['account'])[0].s, '00123456789');
  assert.equal(found('Routing # 021000021', ['account'])[0].s, '021000021');
  assert.equal(found('DOB: 04/12/1988', ['dob'])[0].s, '04/12/1988');
  assert.equal(found('Date of Birth March 3, 1990', ['dob'])[0].s, 'March 3, 1990');
  assert.equal(found('key sk-abcdefghijklmnopqrstuvwxyz123456', ['secret']).length, 1);
  assert.equal(found('AKIAIOSFODNN7EXAMPLE', ['secret']).length, 1);
  assert.equal(found('password: hunter2!', ['secret'])[0].s, 'hunter2!');
});

test('does not flag plain prose', () => {
  assert.deepEqual(findSensitive('The quick brown fox jumps over the lazy dog on 5 May.'), []);
});

test('word rect mapping with partial words', () => {
  const line = { words: [
    { text: 'Email:jane@x.com', bbox: { x0: 100, y0: 10, x1: 260, y1: 30 } },
  ] };
  const [r] = regionsFromLines([line], ['email']);
  assert.equal(r.type, 'email');
  assert.ok(r.x > 100 && r.x <= 160);          // trimmed off "Email:"
  assert.equal(Math.round(r.x + r.w), 260);
});

test('multi-word match unions boxes', () => {
  const line = { words: [
    { text: 'Card', bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } },
    { text: '4111', bbox: { x0: 50, y0: 2, x1: 90, y1: 22 } },
    { text: '1111', bbox: { x0: 100, y0: 2, x1: 140, y1: 22 } },
    { text: '1111', bbox: { x0: 150, y0: 2, x1: 190, y1: 22 } },
    { text: '1111', bbox: { x0: 200, y0: 2, x1: 240, y1: 22 } },
  ] };
  const [r] = regionsFromLines([line], ['card']);
  assert.deepEqual([r.x, r.y, r.w, r.h], [50, 2, 190, 20]);
  const { spans } = lineToText(line);
  assert.equal(rectForRange(spans, 0, 4).w, 40);
});

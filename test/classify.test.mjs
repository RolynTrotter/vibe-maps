import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classOf, legendRows, colorFor, format, NODATA_COLOR, ZERO_COLOR } from '../js/classify.js';

const BINS = [5, 10, 15, 20, 25, 30];   // 6 breakpoints -> 7 classes
const PALETTE = {
  light: ['#c1', '#c2', '#c3', '#c4', '#c5', '#c6', '#c7'],
  dark: ['#d1', '#d2', '#d3', '#d4', '#d5', '#d6', '#d7'],
};
const V = { id: 'x', bins: BINS, unit: '%', palette: 'p' };

test('classOf places values in the class whose lower edge they clear', () => {
  assert.equal(classOf(0, BINS), 0);      // under 5
  assert.equal(classOf(4.9, BINS), 0);
  assert.equal(classOf(5, BINS), 1);      // edges belong to the class above
  assert.equal(classOf(29.9, BINS), 5);
  assert.equal(classOf(30, BINS), 6);     // top class is open-ended
  assert.equal(classOf(98.6, BINS), 6);
});

test('classOf never exceeds the last class', () => {
  // The regression this guards: a leading 0 in bins used to push the top
  // value past the end of the palette, silently falling back to a colour
  // that was one step off for every district.
  for (const v of [0, 1, 5, 17, 30, 100, 1e6]) {
    assert.ok(classOf(v, BINS) <= BINS.length, `class of ${v} is in range`);
    assert.ok(classOf(v, BINS) >= 0);
  }
});

test('classOf reports no-data distinctly from zero', () => {
  assert.equal(classOf(null, BINS), -1);
  assert.equal(classOf(undefined, BINS), -1);
  assert.equal(classOf(NaN, BINS), -1);
  assert.equal(classOf(0, BINS), 0);
});

test('negative values fall in the bottom class, not out of range', () => {
  assert.equal(classOf(-98.6, [-20, -5, 5, 20]), 0);
  assert.equal(classOf(-6, [-20, -5, 5, 20]), 1);
  assert.equal(classOf(0, [-20, -5, 5, 20]), 2);
});

test('a palette must carry exactly one more colour than there are breakpoints', () => {
  assert.throws(
    () => legendRows({ ...V, bins: [0, ...BINS] }, PALETTE, 'light'),
    /7 breakpoints need 8 colours/
  );
});

test('legend runs darkest class first and ends with no-data', () => {
  const rows = legendRows(V, PALETTE, 'light');
  assert.equal(rows.length, 8);                       // 7 classes + no data
  assert.equal(rows[0].label, '30% and above');
  assert.equal(rows[0].color, '#c7');
  assert.equal(rows[6].label, 'under 5%');
  assert.equal(rows[7].label, 'no data');
});

test('zero gets its own legend row only where the manifest says it means something', () => {
  const plain = legendRows(V, PALETTE, 'light', { hasZero: true });
  assert.ok(!plain.some((r) => r.label === '0%'));

  const flagged = legendRows({ ...V, zeroDistinct: true }, PALETTE, 'light', { hasZero: true });
  const zero = flagged.find((r) => r.label === '0%');
  assert.ok(zero, 'zero row present');
  assert.equal(zero.note, 'none recorded');
  assert.equal(zero.color, ZERO_COLOR.light);
});

test('zero and no-data are never the same colour', () => {
  const v = { ...V, zeroDistinct: true };
  assert.notEqual(colorFor(0, v, PALETTE, 'light'), colorFor(null, v, PALETTE, 'light'));
  assert.equal(colorFor(null, v, PALETTE, 'light'), NODATA_COLOR.light);
  assert.equal(colorFor(0, v, PALETTE, 'light'), ZERO_COLOR.light);
  // Without the flag, zero is simply the bottom class.
  assert.equal(colorFor(0, V, PALETTE, 'light'), '#c1');
});

test('format signs percentage-point differences and marks missing values', () => {
  assert.equal(format(31.94, '%'), '31.9%');
  assert.equal(format(9.63, 'pp'), '+9.6 pp');
  assert.equal(format(-12.4, 'pp'), '-12.4 pp');
  assert.equal(format(null, '%'), '—');
  assert.equal(format(NaN, '%'), '—');
});

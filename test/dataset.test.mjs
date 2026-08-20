import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, series, ranked, aggregate } from '../js/dataset.js';

const columns = {
  Population: [100, 200, 0, 50],
  SC:         [ 20,  10, 5,  0],
  ST:         [  5, 120, 1,  0],
  Male:       [ 50, 100, 0, 25],
  Female:     [ 50, 100, 0, 25],
  Male_Literate:   [40, 60, 0, 20],
  Female_Literate: [30, 40, 0, 20],
};
const table = {
  codes: [1, 2, 3, 4],
  districts: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  states: ['One', 'One', 'Two', 'Two'],
  columns,
};

test('ratio is a percentage of the denominator', () => {
  assert.equal(evaluate({ type: 'ratio', num: 'SC', den: 'Population' }, columns, 0), 20);
  assert.equal(evaluate({ type: 'ratio', num: 'SC', den: 'Population' }, columns, 1), 5);
});

test('a zero denominator yields no data, not a division blow-up', () => {
  assert.equal(evaluate({ type: 'ratio', num: 'SC', den: 'Population' }, columns, 2), null);
});

test('a zero numerator yields a real zero, not no-data', () => {
  // The distinction the whole SC map turns on: Nagaland records 0, it is not
  // missing. These must not collapse into each other.
  assert.equal(evaluate({ type: 'ratio', num: 'SC', den: 'Population' }, columns, 3), 0);
});

test('sum_ratio adds numerators before dividing', () => {
  assert.equal(evaluate({ type: 'sum_ratio', nums: ['SC', 'ST'], den: 'Population' }, columns, 0), 25);
  assert.equal(evaluate({ type: 'sum_ratio', nums: ['SC', 'ST'], den: 'Population' }, columns, 1), 65);
});

test('diff subtracts two rates and reports points', () => {
  const f = {
    type: 'diff',
    a: { num: 'Male_Literate', den: 'Male' },
    b: { num: 'Female_Literate', den: 'Female' },
  };
  assert.equal(evaluate(f, columns, 0), 20);   // 80% - 60%
  assert.equal(evaluate(f, columns, 3), 0);
  assert.equal(evaluate(f, columns, 2), null); // undefined either side -> null
});

test('an unknown column or formula type fails loudly', () => {
  assert.throws(() => evaluate({ type: 'ratio', num: 'Nope', den: 'Population' }, columns, 0),
    /unknown column "Nope"/);
  assert.throws(() => evaluate({ type: 'wat' }, columns, 0), /unknown formula type "wat"/);
});

test('series runs parallel to the code list', () => {
  const v = { formula: { type: 'ratio', num: 'SC', den: 'Population' } };
  assert.deepEqual(series(v, table), [20, 5, null, 0]);
});

test('ranked drops no-data rather than sorting it to an end', () => {
  const values = [20, 5, null, 0];
  const top = ranked(values, table, { descending: true, limit: 10 });
  assert.equal(top.length, 3);
  assert.deepEqual(top.map((r) => r.district), ['Alpha', 'Beta', 'Delta']);
  assert.equal(top[0].state, 'One');

  const bottom = ranked(values, table, { descending: false, limit: 10 });
  assert.deepEqual(bottom.map((r) => r.district), ['Delta', 'Beta', 'Alpha']);
});

test('aggregate weights by the denominator, it does not average the rates', () => {
  // Alpha 20/100 and Beta 10/200 together are 30/300 = 10%, not (20+5)/2.
  const v = { formula: { type: 'ratio', num: 'SC', den: 'Population' } };
  assert.equal(aggregate(v, table, [0, 1]), 10);
  assert.notEqual(aggregate(v, table, [0, 1]), 12.5);
});

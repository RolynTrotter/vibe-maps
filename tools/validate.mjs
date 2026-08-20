#!/usr/bin/env node
/**
 * Validate the built attribute table against published Census 2011 figures.
 *
 *   npm run validate
 *
 * A district-level choropleth built on a broken join still renders. It looks
 * fine. That is the whole danger: the failure mode of this project is a
 * plausible map that is quietly wrong. So the join is checked by aggregating
 * the district numbers back up to state level and comparing against figures
 * published by the Census, which the build had no way of seeing.
 *
 * If Punjab is not the highest-SC state, or the national share is not 16.6%,
 * the join is broken -- regardless of how good the map looks.
 */

import { readFileSync } from 'node:fs';

const table = JSON.parse(readFileSync('data/india-census-2011.json', 'utf8'));

// Published Census of India 2011 state-level SC shares (%). Tolerance is 0.15pp
// to absorb rounding in the published figures.
const SC_SHARE = {
  'Punjab': 31.9, 'Himachal Pradesh': 25.2, 'West Bengal': 23.5,
  'Uttar Pradesh': 20.7, 'Haryana': 20.2, 'Tamil Nadu': 20.0,
  'Kerala': 9.1, 'Gujarat': 6.7, 'Nagaland': 0.0,
};
const TOLERANCE = 0.15;

let failures = 0;
const check = (name, actual, expected, tol = TOLERANCE) => {
  const pass = Math.abs(actual - expected) <= tol;
  if (!pass) failures++;
  const mark = pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${mark} ${name.padEnd(34)} ${actual.toFixed(2).padStart(7)}  expected ${expected}`);
};

const col = (c) => table.columns[c];
const sum = (c, idx) => idx.reduce((a, i) => a + col(c)[i], 0);

// --- shape -----------------------------------------------------------------
console.log('\n\x1b[1mstructure\x1b[0m');
check('districts', table.codes.length, 640, 0);
check('unique census codes', new Set(table.codes).size, 640, 0);

// --- national --------------------------------------------------------------
console.log('\n\x1b[1mnational totals\x1b[0m');
const all = table.codes.map((_, i) => i);
const pop = sum('Population', all);
check('population (crore)', pop / 1e7, 121.09, 0.02);
check('SC share of India (%)', (100 * sum('SC', all)) / pop, 16.6, 0.1);
check('ST share of India (%)', (100 * sum('ST', all)) / pop, 8.6, 0.1);

// --- state level -----------------------------------------------------------
console.log('\n\x1b[1mstate SC shares (join integrity)\x1b[0m');
const byState = new Map();
table.states.forEach((s, i) => {
  if (!byState.has(s)) byState.set(s, []);
  byState.get(s).push(i);
});
for (const [state, expected] of Object.entries(SC_SHARE)) {
  const idx = byState.get(state);
  if (!idx) { console.log(`  \x1b[31m✗\x1b[0m ${state} not present in the table`); failures++; continue; }
  check(state, (100 * sum('SC', idx)) / sum('Population', idx), expected);
}

// --- the ordering claim ----------------------------------------------------
console.log('\n\x1b[1mordering\x1b[0m');
const ranked = [...byState.entries()]
  .map(([s, idx]) => [s, (100 * sum('SC', idx)) / sum('Population', idx)])
  .sort((a, b) => b[1] - a[1]);
const top = ranked[0];
const topOk = top[0] === 'Punjab';
if (!topOk) failures++;
console.log(`  ${topOk ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} highest-SC state is Punjab      ` +
            `${top[0]} (${top[1].toFixed(1)}%)`);

// --- vintage ---------------------------------------------------------------
// Telangana was carved out of Andhra Pradesh in 2014. If it appears as a
// state, the table is not a 2011 snapshot and the boundaries will not match.
console.log('\n\x1b[1mvintage\x1b[0m');
const hasTelangana = byState.has('Telangana');
if (hasTelangana) failures++;
console.log(`  ${hasTelangana ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'} ` +
            `Telangana absent (2014 split)     ${hasTelangana ? 'PRESENT — not a 2011 table' : 'absent'}`);

// Zero is a real value, not missing data. These states have no SCs listed at
// all -- rendering them as "no data" would hide the SC/ST substitution finding.
const zeroStates = ['Nagaland', 'Lakshadweep', 'Andaman and Nicobar Islands'];
for (const s of zeroStates) {
  const idx = byState.get(s);
  if (!idx) continue;
  const share = (100 * sum('SC', idx)) / sum('Population', idx);
  const isZero = share === 0;
  if (!isZero) failures++;
  console.log(`  ${isZero ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ` +
              `${s} SC is exactly 0`.padEnd(36) + ` ${share.toFixed(3)}`);
}

console.log(
  failures === 0
    ? '\n\x1b[32mall checks passed\x1b[0m — the join reproduces published Census figures\n'
    : `\n\x1b[31m${failures} check(s) failed\x1b[0m — do not trust the map\n`
);
process.exit(failures === 0 ? 0 : 1);

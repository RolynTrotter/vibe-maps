/**
 * Checks the shipped manifest against the shipped table.
 *
 * These are the failures that would otherwise reach the browser as a blank
 * map or, worse, a map that renders confidently in the wrong colours.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { series } from '../js/dataset.js';
import { classOf, legendRows } from '../js/classify.js';

const manifest = JSON.parse(readFileSync('data/datasets/india-census-2011.json', 'utf8'));
const table = JSON.parse(readFileSync('data/india-census-2011.json', 'utf8'));

test('every artifact the manifest points at exists', () => {
  assert.ok(existsSync(manifest.table.url), manifest.table.url);
  assert.ok(existsSync(manifest.geometry.pmtiles), manifest.geometry.pmtiles);
});

test('every variable has a palette with one more colour than it has breakpoints', () => {
  for (const v of manifest.variables) {
    const palette = manifest.palettes[v.palette];
    assert.ok(palette, `${v.id}: palette "${v.palette}" is defined`);
    for (const mode of ['light', 'dark']) {
      assert.equal(
        palette[mode].length, v.bins.length + 1,
        `${v.id}: ${v.bins.length} breakpoints vs ${palette[mode].length} ${mode} colours`
      );
    }
  }
});

test('no variable starts its breakpoints at the bottom of its own range', () => {
  // A leading 0 creates an unreachable "under 0" class and shifts every
  // district one colour too dark. It renders, which is what makes it nasty.
  for (const v of manifest.variables) {
    const values = series(v, table).filter((x) => x !== null);
    const min = Math.min(...values);
    assert.ok(
      v.bins[0] > min,
      `${v.id}: first breakpoint ${v.bins[0]} is at or below the data minimum ${min}`
    );
  }
});

test('breakpoints ascend', () => {
  for (const v of manifest.variables) {
    for (let i = 1; i < v.bins.length; i++) {
      assert.ok(v.bins[i] > v.bins[i - 1], `${v.id}: breakpoints out of order at ${i}`);
    }
  }
});

test('every formula resolves against real columns, for every district', () => {
  for (const v of manifest.variables) {
    const values = series(v, table);
    assert.equal(values.length, 640, `${v.id}: one value per district`);
    assert.ok(
      values.some((x) => x !== null && Number.isFinite(x)),
      `${v.id}: produced no usable values at all`
    );
  }
});

test('every district lands inside its variable palette', () => {
  for (const v of manifest.variables) {
    const steps = manifest.palettes[v.palette].light;
    for (const value of series(v, table)) {
      if (value === null) continue;
      const cls = classOf(value, v.bins);
      assert.ok(steps[cls] !== undefined, `${v.id}: value ${value} -> class ${cls}, off the ramp`);
    }
  }
});

test('the breakpoints actually spread the data out', () => {
  // A ramp where every district lands in one or two classes is a ramp that
  // shows nothing. Each variable should use at least four of its classes.
  for (const v of manifest.variables) {
    const used = new Set(series(v, table).filter((x) => x !== null).map((x) => classOf(x, v.bins)));
    assert.ok(used.size >= 4, `${v.id}: only ${used.size} of ${v.bins.length + 1} classes used`);
  }
});

test('legends build for every variable in both modes', () => {
  for (const v of manifest.variables) {
    for (const mode of ['light', 'dark']) {
      const rows = legendRows(v, manifest.palettes[v.palette], mode, { hasZero: true });
      assert.equal(rows.at(-1).label, 'no data', `${v.id}/${mode}`);
      for (const r of rows) assert.match(r.color, /^#[0-9a-f]{3,8}$/i, `${v.id}/${mode}: ${r.color}`);
    }
  }
});

test('every variable belongs to a declared group and is uniquely identified', () => {
  const groups = new Set(manifest.groups.map((g) => g.id));
  const seen = new Set();
  for (const v of manifest.variables) {
    assert.ok(groups.has(v.group), `${v.id}: unknown group "${v.group}"`);
    assert.ok(!seen.has(v.id), `duplicate variable id "${v.id}"`);
    seen.add(v.id);
    assert.ok(v.label && v.description, `${v.id}: needs a label and a description`);
  }
});

test('exactly one variable is featured, and it is the one the project is about', () => {
  const featured = manifest.variables.filter((v) => v.featured);
  assert.equal(featured.length, 1);
  assert.equal(featured[0].id, 'sc_share');
});

test('annotations sit inside the map bounds', () => {
  const [[w, s], [e, n]] = manifest.geometry.maxBounds;
  for (const v of manifest.variables) {
    for (const a of v.annotations || []) {
      assert.ok(a.lng > w && a.lng < e, `${v.id}: annotation lng ${a.lng} outside bounds`);
      assert.ok(a.lat > s && a.lat < n, `${v.id}: annotation lat ${a.lat} outside bounds`);
      assert.ok(a.title && a.body, `${v.id}: annotation needs a title and body`);
    }
  }
});

test('the glossary defines the abbreviations the copy actually uses', () => {
  const defined = new Set((manifest.glossary || []).map((g) => g.term));
  for (const term of ['SC', 'ST', 'PCA', 'pp', 'Dalit']) {
    assert.ok(defined.has(term), `glossary is missing "${term}"`);
  }
});

test('zero is styled apart exactly where zero is a real recorded value', () => {
  for (const id of ['sc_share', 'st_share']) {
    const v = manifest.variables.find((x) => x.id === id);
    assert.ok(v.zeroDistinct, `${id}: should mark zero distinctly`);
    assert.ok(series(v, table).includes(0), `${id}: expected some district to record a true zero`);
  }
});

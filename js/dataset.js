/**
 * Dataset loading and variable evaluation.
 *
 * A dataset is a manifest (data/datasets/*.json) plus a columnar attribute
 * table. The manifest declares its variables as small declarative formulas
 * rather than code, so adding "Muslim share of population" to the app is a
 * JSON entry, not a patch:
 *
 *   { "type": "ratio",     "num": "Muslims", "den": "Population" }
 *   { "type": "sum_ratio", "nums": ["Hindus","Sikhs"], "den": "Population" }
 *   { "type": "diff",      "a": {...}, "b": {...} }        // a - b, in points
 *
 * Deliberately not an expression language: no eval, no parser, no way for a
 * manifest to do anything but arithmetic on named columns. A second dataset —
 * a different country, a different census — is a new manifest and a new table,
 * with no changes here.
 */

/** Evaluate one district's value for a formula. Returns null if undefined. */
export function evaluate(formula, columns, i) {
  const at = (name) => {
    const col = columns[name];
    if (!col) throw new Error(`formula references unknown column "${name}"`);
    return col[i];
  };
  const ratio = (num, den) => {
    const d = at(den);
    return d ? (100 * at(num)) / d : null;
  };

  switch (formula.type) {
    case 'ratio':
      return ratio(formula.num, formula.den);
    case 'sum_ratio': {
      const d = at(formula.den);
      if (!d) return null;
      return (100 * formula.nums.reduce((sum, n) => sum + at(n), 0)) / d;
    }
    case 'diff': {
      const a = ratio(formula.a.num, formula.a.den);
      const b = ratio(formula.b.num, formula.b.den);
      return a === null || b === null ? null : a - b;
    }
    default:
      throw new Error(`unknown formula type "${formula.type}"`);
  }
}

/** Evaluate a variable across every row. Parallel to table.codes. */
export function series(variable, table) {
  return table.codes.map((_, i) => evaluate(variable.formula, table.columns, i));
}

/**
 * Load a dataset manifest and its table, and index the table by join key so
 * the map can look a district up from a clicked tile feature.
 */
export async function loadDataset(manifestUrl) {
  const manifest = await fetchJson(manifestUrl);
  // Paths inside a manifest are relative to the site root, not to the manifest
  // file -- the same convention map.js uses for the pmtiles archive.
  const table = await fetchJson(new URL(manifest.table.url, location.href).href);

  const byCode = new Map();
  table.codes.forEach((code, i) => byCode.set(code, i));

  return {
    manifest,
    table,
    byCode,
    /** Row index for a join-key value, or undefined. */
    indexOf: (code) => byCode.get(Number(code)),
    variable: (id) => manifest.variables.find((v) => v.id === id),
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return res.json();
}

/** Rank districts by a variable. Nulls are dropped, not sorted to an end. */
export function ranked(values, table, { descending = true, limit = 10 } = {}) {
  const rows = values
    .map((value, i) => ({ value, i }))
    .filter((r) => r.value !== null && Number.isFinite(r.value));
  rows.sort((a, b) => (descending ? b.value - a.value : a.value - b.value));
  return rows.slice(0, limit).map(({ value, i }) => ({
    value,
    district: table.districts[i],
    state: table.states[i],
    code: table.codes[i],
  }));
}

/** Population-weighted aggregate of a variable, for state roll-ups. */
export function aggregate(variable, table, indices) {
  const f = variable.formula;
  const sum = (name) => indices.reduce((a, i) => a + table.columns[name][i], 0);
  switch (f.type) {
    case 'ratio':
      return sum(f.den) ? (100 * sum(f.num)) / sum(f.den) : null;
    case 'sum_ratio':
      return sum(f.den) ? (100 * f.nums.reduce((a, n) => a + sum(n), 0)) / sum(f.den) : null;
    case 'diff': {
      const a = sum(f.a.den) ? (100 * sum(f.a.num)) / sum(f.a.den) : null;
      const b = sum(f.b.den) ? (100 * sum(f.b.num)) / sum(f.b.den) : null;
      return a === null || b === null ? null : a - b;
    }
    default:
      return null;
  }
}

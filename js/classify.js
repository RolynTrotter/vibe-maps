/**
 * Turning numbers into colours, and saying so in a legend.
 *
 * Classification is by explicit breakpoints from the manifest rather than
 * quantiles computed at runtime. Quantiles would guarantee an evenly-filled
 * legend and destroy the comparison: every map would look equally dramatic,
 * and Punjab at 31.9% would occupy the same visual class as a state at 6%
 * simply for being top of its own distribution. Fixed bins let two maps be
 * compared, and let a flat distribution look flat.
 *
 * `bins` holds the INTERNAL breakpoints only -- not the bottom of the scale
 * and not the top. N breakpoints therefore describe N+1 classes and want a
 * palette of N+1 colours:
 *
 *   bins [5,10,15,20,25,30]  ->  under 5 | 5-10 | 10-15 | 15-20 | 20-25 |
 *                                25-30 | 30 and above          (7 classes)
 *
 * Putting a 0 at the front is the easy mistake: it adds an unreachable
 * "under 0" class and shifts every district one step too dark.
 */

/** Class index (0-based) for a value, or -1 for no data. */
export function classOf(value, bins) {
  if (value === null || value === undefined || !Number.isFinite(value)) return -1;
  let cls = 0;
  for (const edge of bins) if (value >= edge) cls++;
  return Math.min(cls, bins.length);
}

/**
 * Zero is styled apart from the first colour class wherever the manifest says
 * zero carries meaning. Nagaland, Mizoram, Lakshadweep and the Andamans list
 * no Scheduled Castes at all; folding them into a "0–5%" class would hide the
 * fact that the category is simply absent there.
 */
export const ZERO_COLOR = { light: '#ffffff', dark: '#2a2a28' };
export const NODATA_COLOR = { light: '#d8d6d1', dark: '#4a4844' };

export function colorFor(value, variable, palette, mode) {
  const steps = palette[mode];
  if (value === null || !Number.isFinite(value)) return NODATA_COLOR[mode];
  if (value === 0 && variable.zeroDistinct) return ZERO_COLOR[mode];
  return steps[classOf(value, variable.bins)] ?? steps[steps.length - 1];
}

/** Legend rows, coarsest class first, as the eye reads a ramp. */
export function legendRows(variable, palette, mode, { hasZero = false } = {}) {
  const steps = palette[mode];
  const { bins, unit } = variable;
  if (steps.length !== bins.length + 1) {
    throw new Error(
      `variable "${variable.id}": ${bins.length} breakpoints need ` +
      `${bins.length + 1} colours, palette "${variable.palette}" has ${steps.length}`
    );
  }
  const rows = [];

  for (let cls = steps.length - 1; cls >= 0; cls--) {
    rows.push({ color: steps[cls], label: classLabel(cls, bins, unit) });
  }
  if (hasZero && variable.zeroDistinct) {
    rows.push({ color: ZERO_COLOR[mode], label: unit === '%' ? '0%' : `0 ${unit}`,
                note: 'none recorded', outline: true });
  }
  rows.push({ color: NODATA_COLOR[mode], label: 'no data', note: 'not enumerated', outline: true });
  return rows;
}

function classLabel(cls, bins, unit) {
  const n = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const u = unit === 'pp' ? ' pp' : unit === '%' ? '%' : ` ${unit}`;
  if (cls === 0) return `under ${n(bins[0])}${u}`;
  if (cls === bins.length) return `${n(bins[bins.length - 1])}${u} and above`;
  return `${n(bins[cls - 1])} – ${n(bins[cls])}${u}`;
}

/**
 * A MapLibre `match` expression mapping join key -> colour, so switching
 * variable is one setPaintProperty call rather than a re-tiled source.
 * 641 branches sounds like a lot and costs about a millisecond.
 */
export function colorExpression(values, table, variable, palette, mode, joinKey) {
  const expr = ['match', ['get', joinKey]];
  values.forEach((value, i) => {
    expr.push(table.codes[i], colorFor(value, variable, palette, mode));
  });
  expr.push(NODATA_COLOR[mode]); // fallback: any polygon with no row, incl. code 0
  return expr;
}

/** Format a value for display. */
export function format(value, unit) {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = unit === 'pp' && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}${unit === '%' ? '%' : unit === 'pp' ? ' pp' : ''}`;
}

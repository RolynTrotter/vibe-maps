# Contributing

## Adding a variable

Edit `data/datasets/india-census-2011.json`. A variable needs an `id`, `label`,
`group`, `unit`, `formula`, `bins` and `palette`. If the column you want isn't
in `data/india-census-2011.json`, add it to `KEEP` in
`tools/build-india-2011.mjs` and re-run `npm run build:india`.

Then `npm test`. The manifest tests will tell you if:

- your palette doesn't have exactly one more colour than you have breakpoints;
- your first breakpoint sits at or below the data minimum (this creates an
  unreachable bottom class and shifts every district one colour too dark);
- your breakpoints leave the data bunched into fewer than four classes;
- your formula references a column that isn't there.

## Adding a dataset

A new manifest in `data/datasets/`, an attribute table, and a `.pmtiles` file.
Nothing in `js/` should need to change — if it does, that's the bug worth
reporting.

## Rules that aren't negotiable

- **Join on codes, never on names.** District names are transliterated
  inconsistently and repeat across states.
- **Keep the boundary vintage matched to the data vintage.** A 2011 table on
  2020 boundaries renders fine and is wrong.
- **Zero is not no-data.** Style and label them separately.
- **Fixed breakpoints, not runtime quantiles.** Quantiles make every map look
  equally dramatic and destroy comparability between maps.
- **State the denominator.** Every rate in the app divides by something named.

## Before pushing

```bash
npm test && npm run validate
```

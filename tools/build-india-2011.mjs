#!/usr/bin/env node
/**
 * Build the India Census 2011 district dataset: vector tiles + attribute table.
 *
 *   node tools/build-india-2011.mjs
 *
 * Downloads into ./_cache (gitignored) and writes two committed artifacts:
 *
 *   data/india-districts-2011.pmtiles   district polygons, 2011 vintage
 *   data/india-census-2011.json         attribute table, columnar
 *
 * ---------------------------------------------------------------------------
 * THE VINTAGE TRAP
 * ---------------------------------------------------------------------------
 * India had 640 districts in 2011 and has 780+ now, because states keep
 * splitting them. Almost every district boundary file online uses CURRENT
 * boundaries. Join one of those to 2011 census figures and you get a
 * plausible-looking map that is quietly wrong: unmatched districts render as
 * holes, and split districts double-count their parent's population.
 *
 * So: DataMeet's 2011-vintage shapefile, joined on the numeric `censuscode`
 * (1..640) and never on district names. Names are transliterated
 * inconsistently between sources and are not unique across states -- there are
 * several Aurangabads, Bilaspurs, Hamirpurs and Pratapgarhs.
 *
 * The join is asserted, not hoped for: this script exits non-zero unless all
 * 640 districts match and the state-level SC shares reproduce the published
 * Census figures. See tools/validate.mjs for the assertions.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = '_cache';
const OUT_TILES = 'data/india-districts-2011.pmtiles';
const OUT_TABLE = 'data/india-census-2011.json';

// DataMeet, Census 2011 vintage, carries `censuscode`. CC-BY 4.0.
const SHP_REPO = 'https://github.com/datameet/maps';
const SHP_PATH = 'Districts/Census_2011/2011_Dist.shp';

// Consolidated district-level Primary Census Abstract. Same figures as the
// per-state A-10 Appendix XLSX files on censusindia.gov.in, in one file,
// because scraping 30-odd spreadsheets from behind a JS catalogue is misery.
const PCA_URL =
  'https://raw.githubusercontent.com/nishusharma1608/India-Census-2011-Analysis/' +
  'master/india-districts-census-2011.csv';

// Columns kept in the attribute table. Everything the variable definitions in
// data/datasets/india-census-2011.json reference, plus their denominators.
// The source CSV has 118 columns; most are household-size and married-couples
// breakdowns with no measured relationship to anything we map.
const KEEP = [
  'Population', 'Male', 'Female',
  'SC', 'ST',
  'Literate', 'Male_Literate', 'Female_Literate',
  'Workers', 'Cultivator_Workers', 'Agricultural_Workers',
  'Main_Workers', 'Marginal_Workers', 'Non_Workers',
  'Hindus', 'Muslims', 'Christians', 'Sikhs', 'Buddhists', 'Jains',
  'Others_Religions', 'Religion_Not_Stated',
  'Households', 'Rural_Households', 'Urban_Households',
  'Having_latrine_facility_within_the_premises_Total_Households',
  'Not_having_latrine_facility_within_the_premises_Alternative_source_Open_Households',
  'Location_of_drinking_water_source_Away_Households',
  'Main_source_of_drinking_water_Tapwater_Households',
  'Main_source_of_drinking_water_Handpump_Tubewell_Borewell_Households',
  'Condition_of_occupied_census_houses_Dilapidated_Households',
  'Housholds_with_Electric_Lighting',   // sic -- the source misspells it
  'Total_Education', 'Graduate_Education', 'Illiterate_Education',
];

const sh = (cmd, args) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 }).toString();

function step(msg) { process.stdout.write(`\n\x1b[1m${msg}\x1b[0m\n`); }
function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }

// ---------------------------------------------------------------------------
// 1. Sources
// ---------------------------------------------------------------------------

function getShapefile() {
  const dir = join(CACHE, 'datameet');
  const shp = join(dir, SHP_PATH);
  if (existsSync(shp)) { ok(`cached ${SHP_PATH}`); return shp; }
  console.log(`  cloning ${SHP_REPO} (large; shallow)`);
  sh('git', ['clone', '--depth', '1', SHP_REPO, dir]);
  if (!existsSync(shp)) {
    throw new Error(
      `${SHP_PATH} not found in the DataMeet checkout -- the repo layout moved.\n` +
      `Browse ${SHP_REPO} and update SHP_PATH.`
    );
  }
  ok(`cloned ${SHP_PATH}`);
  return shp;
}

function getPca() {
  const csv = join(CACHE, 'district_pca.csv');
  if (existsSync(csv) && statSync(csv).size > 0) { ok('cached district_pca.csv'); return csv; }
  console.log(`  downloading ${PCA_URL}`);
  sh('curl', ['-sSL', '--fail', PCA_URL, '-o', csv]);
  ok('downloaded district_pca.csv');
  return csv;
}

// ---------------------------------------------------------------------------
// 2. Attribute table
// ---------------------------------------------------------------------------

/** Minimal RFC4180-ish CSV reader. The census file has no embedded newlines. */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const split = (line) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

/**
 * Columnar rather than row-of-objects: 640 rows x 35 columns as parallel
 * arrays is roughly a third the bytes of the equivalent array of objects,
 * and the app indexes by position anyway.
 */
function buildTable(csvPath) {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  rows.sort((a, b) => Number(a['District code']) - Number(b['District code']));

  const missing = KEEP.filter((c) => !(c in rows[0]));
  if (missing.length) throw new Error(`census CSV is missing columns: ${missing.join(', ')}`);

  const table = {
    key: 'censuscode',
    codes: rows.map((r) => Number(r['District code'])),
    districts: rows.map((r) => r['District name']),
    states: rows.map((r) => titleCase(r['State name'])),
    columns: {},
  };
  for (const c of KEEP) table.columns[c] = rows.map((r) => Number(r[c]) || 0);
  return table;
}

// The source CSV shouts state names in caps. Districts are already mixed case.
function titleCase(s) {
  return s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase())
    .replace(/\bAnd\b/g, 'and').replace(/^and/, 'And');
}

// ---------------------------------------------------------------------------
// 3. Geometry -> vector tiles
// ---------------------------------------------------------------------------

function buildTiles(shp, table) {
  mkdirSync(CACHE, { recursive: true });
  const geojson = join(CACHE, 'districts.geojson');

  // Visvalingam simplification at 6% keeps district shapes recognisable at
  // national zoom while cutting the file by an order of magnitude.
  // `keep-shapes` stops small districts (Mahe, Daman, the island districts)
  // from collapsing to nothing at that threshold.
  console.log('  simplifying with mapshaper');
  sh('node_modules/.bin/mapshaper', [
    shp,
    '-simplify', 'visvalingam', '6%', 'keep-shapes',
    '-filter-fields', 'censuscode,DISTRICT,ST_NM',
    '-o', 'format=geojson', 'precision=0.0001', geojson,
  ]);
  ok(`simplified -> ${(statSync(geojson).size / 1e6).toFixed(1)} MB geojson`);

  // Sanity-check the geometry's join keys before spending time on tiles.
  const fc = JSON.parse(readFileSync(geojson, 'utf8'));
  const codes = fc.features.map((f) => Number(f.properties.censuscode));
  const inTable = new Set(table.codes);
  const unmatched = codes.filter((c) => c !== 0 && !inTable.has(c));
  const absent = table.codes.filter((c) => !codes.includes(c));
  console.log(`  polygons: ${codes.length}   census rows: ${table.codes.length}`);
  if (unmatched.length) throw new Error(`polygons with no census row: ${unmatched.join(', ')}`);
  if (absent.length) throw new Error(`census rows with no polygon: ${absent.join(', ')}`);
  ok(`join verified: ${table.codes.length}/640 districts matched, 0 unmatched`);

  // censuscode 0 is DataMeet's "Data Not Available" polygon for the parts of
  // Jammu & Kashmir the census could not enumerate. It is kept deliberately:
  // it is genuinely *no data*, and the app styles it differently from a
  // genuine zero (Nagaland, Mizoram and the islands have no SCs listed at
  // all, which is a finding, not a gap).
  const nodata = codes.filter((c) => c === 0).length;
  ok(`${nodata} "Data Not Available" polygon kept and styled separately`);

  // State outlines, dissolved from the same districts so the two can never
  // disagree. A choropleth with no internal structure above district level is
  // very hard to read -- you cannot find Punjab without them.
  const states = join(CACHE, 'states.geojson');
  console.log('  dissolving state boundaries');
  sh('node_modules/.bin/mapshaper', [
    shp,
    '-simplify', 'visvalingam', '6%', 'keep-shapes',
    '-dissolve', 'ST_NM',
    '-o', 'format=geojson', 'precision=0.0001', states,
  ]);
  ok(`${JSON.parse(readFileSync(states, 'utf8')).features.length} state/UT outlines`);

  console.log('  building vector tiles with tippecanoe');
  sh('tippecanoe', [
    '-o', OUT_TILES, '--force',
    '-Z', '2', '-z', '9',              // national view to district-detail
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--no-tile-compression',           // GitHub Pages serves these raw
    '-L', `districts:${geojson}`,
    '-L', `states:${states}`,
  ]);
  ok(`${OUT_TILES} -> ${(statSync(OUT_TILES).size / 1e6).toFixed(1)} MB`);
}

// ---------------------------------------------------------------------------

function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync('data', { recursive: true });

  step('1/3  sources');
  const shp = getShapefile();
  const csv = getPca();

  step('2/3  attribute table');
  const table = buildTable(csv);
  writeFileSync(OUT_TABLE, JSON.stringify(table));
  ok(`${OUT_TABLE} -> ${(statSync(OUT_TABLE).size / 1e3).toFixed(0)} kB, ` +
     `${table.codes.length} districts x ${Object.keys(table.columns).length} columns`);

  step('3/3  geometry');
  buildTiles(shp, table);

  step('done');
  console.log('  now run:  npm run validate\n');
}

main();

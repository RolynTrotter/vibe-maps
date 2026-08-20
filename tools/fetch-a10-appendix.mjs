#!/usr/bin/env node
/**
 * Download Census table A-10 Appendix: district-wise population of each
 * individual Scheduled Caste, for every state.
 *
 *   node tools/fetch-a10-appendix.mjs            # all states
 *   node tools/fetch-a10-appendix.mjs 03 33      # just these state codes
 *
 * Files land in _cache/a10-appendix/ as .xlsx. This only fetches; turning them
 * into a dataset is a separate step.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS TABLE IS, AND WHY IT IS THE INTERESTING ONE
 * ---------------------------------------------------------------------------
 * The Primary Census Abstract counts Scheduled Castes as one aggregate. A-10
 * Appendix breaks that aggregate into the individual castes -- Ad Dharmi,
 * Balmiki, Mazhabi, Chamar, Mahar, Paraiyan and so on -- by district, with a
 * Total/Rural/Urban split. Punjab alone lists 40.
 *
 * Note the ceiling: A-10 Appendix carries POPULATION ONLY. The main A-10 table
 * has literacy and worker breakdowns for each caste but is published at STATE
 * level only, so neither table yields district-level SC literacy or work. A
 * caste-*gap* map still needs a different source.
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS THAT WILL WASTE YOUR AFTERNOON
 * ---------------------------------------------------------------------------
 * 1. censusindia.gov.in serves an INCOMPLETE TLS CHAIN. It sends the leaf and
 *    omits the emSign SSL CA - G1 intermediate, so anything that does not chase
 *    the AIA extension -- curl, node, python -- fails with "unable to get local
 *    issuer certificate". Browsers hide this by fetching the intermediate
 *    themselves. This script does the same: it downloads the intermediate and
 *    supplies it. That completes the chain; it does not weaken verification,
 *    and the certificate is still checked against the real emSign root.
 *
 * 2. The site is behind a WAF that rejects the NADA /api/catalog/{id} endpoint
 *    outright, and rejects requests without a browser User-Agent. The catalog
 *    HTML page is served fine, and it carries the download link, so the file id
 *    is scraped from there rather than asked for politely.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '_cache/a10-appendix';
const CHAIN = '_cache/censusindia-chain.pem';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE = 'https://censusindia.gov.in/nada/index.php';
const AIA = 'http://repository.emsign.com/certs/emSignSSLCAG1.crt';

const sh = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });

/** Build a trust file: system roots plus the intermediate the server omits. */
function ensureChain() {
  if (existsSync(CHAIN) && statSync(CHAIN).size > 0) return CHAIN;
  mkdirSync('_cache', { recursive: true });
  console.log('  completing the certificate chain censusindia.gov.in does not send');
  const der = '_cache/emsign-int.der';
  sh('curl', ['-sS', '--fail', '--max-time', '60', AIA.replace('http://', 'https://'), '-o', der]);
  sh('sh', ['-c',
    `openssl x509 -inform DER -in ${der} -out _cache/emsign-int.pem && ` +
    `cat /etc/ssl/certs/ca-certificates.crt _cache/emsign-int.pem > ${CHAIN}`]);
  return CHAIN;
}

const curl = (url, extra = []) =>
  sh('curl', ['-sS', '--fail', '-L', '--cacert', CHAIN, '--max-time', '120', '-A', UA, ...extra, url]);

/** Find every A-10 Appendix record and its catalog id, via the NADA search API. */
function findRecords() {
  const url = `${BASE}/api/catalog/search?sk=PCA+scheduled+caste&ps=200`;
  const data = JSON.parse(curl(url));
  const rows = (data.result?.rows || []).filter((r) => /^PC11_A10a-/.test(r.idno || ''));
  if (!rows.length) throw new Error('no A-10 Appendix records in the search response — has the catalogue moved?');
  return rows.map((r) => ({ id: r.id, state: r.idno.replace('PC11_A10a-', ''), title: r.title }));
}

/**
 * The download URL carries an internal file id that is not in the search
 * response, so scrape it from the catalogue page. /api/catalog/{id} would be
 * the polite way and the WAF rejects it.
 */
function downloadUrlFor(catalogId) {
  const html = curl(`${BASE}/catalog/${catalogId}`);
  const m = html.match(/href="([^"]*\/download\/\d+\/[^"]*\.xlsx)"/i);
  if (!m) throw new Error(`no .xlsx download link on catalogue page ${catalogId}`);
  return m[1].replace(/&amp;/g, '&');
}

function main() {
  const want = process.argv.slice(2);
  ensureChain();
  mkdirSync(OUT, { recursive: true });

  const records = findRecords()
    .filter((r) => !want.length || want.includes(r.state))
    .sort((a, b) => a.state.localeCompare(b.state));
  console.log(`  ${records.length} state files to fetch\n`);

  let ok = 0, failed = [];
  for (const rec of records) {
    const dest = join(OUT, `a10-appendix-${rec.state}.xlsx`);
    if (existsSync(dest) && statSync(dest).size > 10000) {
      console.log(`  cached  ${rec.state}  ${rec.title.slice(0, 58)}`);
      ok++;
      continue;
    }
    try {
      const url = downloadUrlFor(rec.id);
      curl(url, ['-e', `${BASE}/catalog/${rec.id}`, '-o', dest]);
      console.log(`  ✓ ${rec.state}  ${(statSync(dest).size / 1024).toFixed(0).padStart(4)} kB  ${rec.title.slice(0, 52)}`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${rec.state}  ${err.message.split('\n')[0].slice(0, 70)}`);
      failed.push(rec.state);
    }
  }
  console.log(`\n  ${ok} fetched into ${OUT}/`);
  if (failed.length) {
    console.log(`  ${failed.length} failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

main();

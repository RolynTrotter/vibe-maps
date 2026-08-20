#!/usr/bin/env node
/**
 * Copy the runtime libraries out of node_modules into vendor/.
 *
 *   npm run vendor
 *
 * The app itself has no build step and no node_modules at runtime: index.html
 * loads these files directly, and the service worker caches them so the map
 * keeps working offline. node_modules is only ever a build-time staging area,
 * so the copies in vendor/ are committed.
 */
import { copyFileSync, mkdirSync } from 'node:fs';

const FILES = [
  ['node_modules/maplibre-gl/dist/maplibre-gl.js', 'vendor/maplibre-gl.js'],
  ['node_modules/maplibre-gl/dist/maplibre-gl.css', 'vendor/maplibre-gl.css'],
  ['node_modules/pmtiles/dist/pmtiles.js', 'vendor/pmtiles.js'],
];

mkdirSync('vendor', { recursive: true });
for (const [from, to] of FILES) {
  copyFileSync(from, to);
  console.log(`  ${to}`);
}

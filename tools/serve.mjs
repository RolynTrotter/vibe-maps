#!/usr/bin/env node
/**
 * Static dev server with HTTP range support.
 *
 *   npm start        # http://localhost:8099
 *
 * `python3 -m http.server` cannot serve byte ranges, and the whole map is
 * delivered as range requests into a single .pmtiles archive -- so under it
 * the tiles fail with "Check that your storage backend supports HTTP Byte
 * Serving" and you get a blank map. GitHub Pages does support ranges, so
 * this difference only ever bites locally, which is exactly when it is most
 * confusing. Hence a real one.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, normalize, join } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 8099;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.pmtiles': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';

  // Contain the served tree: no climbing out of the repo with ../
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

  let stat;
  try { stat = statSync(file); } catch { res.writeHead(404).end('not found'); return; }
  if (stat.isDirectory()) { res.writeHead(404).end('not found'); return; }

  const type = TYPES[extname(file)] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === '' ? stat.size - Number(m[2]) : Number(m[1]);
      let end = m[1] === '' || m[2] === '' ? stat.size - 1 : Number(m[2]);
      start = Math.max(0, start);
      end = Math.min(stat.size - 1, end);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`  vibe-maps  →  http://localhost:${PORT}`));

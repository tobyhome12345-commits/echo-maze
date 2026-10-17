/*
 * tools/serve.js - a plain static server for the game and its test pages. Node only, no packages.
 *
 *   node tools/serve.js [port] [root]        (defaults: 8121, the repo)  ->  http://localhost:8121/?debug
 *
 * Nothing is cached (Cache-Control: no-store), so an edit shows up on the next reload, and any origin may read it
 * (Access-Control-Allow-Origin: *), so another build's page can load these files - tools/layout-test.js and an
 * old-vs-new identity run fetch one build's scripts into another's page. It serves files only from inside `root`.
 * Also usable from a script: require('./serve.js').start(port, root) -> Promise<http.Server>.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function start(port = 8121, root = path.join(__dirname, '..')) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch (e) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(base, '.' + p);
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

module.exports = { start };

if (require.main === module) {
  const port = +(process.argv[2] || 8121);
  const root = process.argv[3] || path.join(__dirname, '..');
  start(port, root).then(() => console.log(`serving ${path.resolve(root)} at http://localhost:${port}/  (the game's test hooks: http://localhost:${port}/?debug)`));
}

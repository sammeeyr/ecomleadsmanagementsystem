'use strict';
// Local preview: serves /public and the /api routes on http://localhost:3000 with an in-memory database (no Neon needed).
// Run with: node test/dev.js   (data is lost when you stop it)
const Module = require('module');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const pg = new PGlite();
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@neondatabase/serverless') return { neon: () => ({ query: async (t, p) => (await pg.query(t, p || [])).rows }) };
  return origLoad.apply(this, arguments);
};
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://local';
process.env.OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'preview-password';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'preview-secret-preview-secret';

const root = path.join(__dirname, '..');
const routes = {
  '/api/submit': require('../api/submit'), '/api/login': require('../api/login'), '/api/logout': require('../api/logout'), '/api/leads': require('../api/leads')
};
const byId = require('../api/leads/[id]');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;
  if (p.startsWith('/api/')) {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', async () => {
      try { req.body = data && /json/.test(req.headers['content-type'] || '') ? JSON.parse(data) : data; } catch (e) { req.body = null; }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      let h = routes[p];
      req.query = {};
      const m = p.match(/^\/api\/leads\/([^/]+)$/);
      if (m) { h = byId; req.query = { id: m[1] }; }
      if (!h) return res.status(404).json({ error: 'not_found' });
      h(req, res);
    });
    return;
  }
  if (p === '/pipeline') p = '/pipeline.html';
  if (p === '/') p = '/index.html';
  const file = path.join(root, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(buf);
  });
}).listen(process.env.PORT || 3000, () => console.log('Preview on http://localhost:' + (process.env.PORT || 3000) + '  (owner password: ' + process.env.OWNER_PASSWORD + ')'));

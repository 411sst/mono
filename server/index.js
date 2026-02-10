import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadMapCatalog } from './maps/catalog.js';
import { richupPreset } from './rules/richupPreset.js';
import { FileStore } from './persistence/store.js';
import { SessionManager } from './core/sessionManager.js';

const mapCatalog = loadMapCatalog();
const store = new FileStore();
const sessions = new SessionManager({ mapCatalog, rules: richupPreset, store });

const publicDir = path.resolve('public');

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function body(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d ? JSON.parse(d) : {}));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/api/maps') return json(res, 200, { maps: [...mapCatalog.values()] });
  if (req.method === 'GET' && url.pathname === '/api/sessions') return json(res, 200, { sessions: sessions.listSessions() });

  if (req.method === 'POST' && url.pathname === '/api/queue') {
    const b = await body(req);
    const p = sessions.enqueue((b.name || 'Guest').slice(0, 16));
    return json(res, 200, { queued: true, player: p, sessions: sessions.listSessions() });
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/sessions\/[\w-]+\/action$/)) {
    const sessionId = url.pathname.split('/')[3];
    const b = await body(req);
    const result = sessions.act(sessionId, b.action, b.expectedVersion, b.playerId);
    return json(res, result.ok ? 200 : 400, result);
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/sessions\/[\w-]+\/stream$/)) {
    const sessionId = url.pathname.split('/')[3];
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'HELLO', sessionId })}\n\n`);
    sessions.attachStream(sessionId, res);
    return;
  }

  const filePath = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (filePath.startsWith(publicDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const ct = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(fs.readFileSync(filePath));
    return;
  }

  json(res, 404, { error: 'Not found' });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Meownopoly server listening on http://localhost:${port}`));

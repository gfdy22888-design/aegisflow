#!/usr/bin/env node
/* =============================================================================
 * AegisFlow — Ops Console server (pure Node stdlib, zero dependencies)
 * -----------------------------------------------------------------------------
 * Serves the dashboard (public/), a JSON control API and a Server-Sent-Events
 * realtime stream. With USE_AWS=1 the mitigation dispatcher routes to real AWS
 * (see lib/aws-adapter.js); default mode uses the local simulator.
 * Run:  npm start   (or: node server.js)   →  http://localhost:8080
 * ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createEngine } = require('./lib/engine.js');
const { getMitigationDispatcher } = require('./lib/aws-adapter.js');

const PORT = Number(process.env.PORT || 8080);
const USE_AWS = process.env.USE_AWS === '1';

const engine = createEngine({ tickMs: 1000 });
const dispatchMitigation = getMitigationDispatcher(USE_AWS); // local sim | real AWS WAF

/* ------------------------------ static files ------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};
const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* --------------------------------- SSE ------------------------------------ */
const streams = new Set();
function broadcast(snapshot) {
  const payload = `event: tick\ndata: ${JSON.stringify(snapshot)}\n\n`;
  for (const res of streams) res.write(payload);
}

/* -------------------------------- API ------------------------------------- */
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

async function handleApi(req, res) {
  const u = req.url.split('?')[0];
  if (u === '/api/state' && req.method === 'GET') return json(res, 200, engine.snapshot());
  if (u === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, uptimeSec: Math.round(process.uptime()), useAws: USE_AWS, tick: engine.snapshot().tick });
  if (u === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*'
    });
    res.write(`event: tick\ndata: ${JSON.stringify(engine.snapshot())}\n\n`);
    streams.add(res);
    req.on('close', () => streams.delete(res));
    return;
  }
  if (req.method !== 'POST') return json(res, 404, { error: 'not found' });
  const body = await readBody(req);
  switch (u) {
    case '/api/scenario': {
      if (body.action === 'stop-all') { engine.stopAllScenarios(); break; }
      if (body.action === 'start') engine.startScenario(body.name);
      else if (body.action === 'stop') engine.stopScenario(body.name);
      break;
    }
    case '/api/mitigation': {
      if (body.op === 'clear') engine.clearMitigations();
      else if (body.op === 'remove') engine.removeMitigation(body.id);
      else if (body.op === 'add') {
        // In USE_AWS=1 mode this call would also push the rule to AWS WAFv2.
        const id = engine.applyMitigation(body.spec);
        dispatchMitigation(body.spec).catch((e) => console.error('[aws-adapter]', e.message));
        return json(res, 200, { ok: true, id });
      }
      break;
    }
    case '/api/auto': { engine.setAuto(body.enabled); break; }
    default: return json(res, 404, { error: 'not found' });
  }
  return json(res, 200, { ok: true, snapshot: engine.snapshot() });
}

/* ------------------------------- bootstrap -------------------------------- */
// Warm the detector's EWMA baseline so the demo starts calibrated.
for (let i = 0; i < 60; i++) engine.tick();

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res).catch(() => json(res, 500, { error: 'internal' }));
  return serveStatic(req, res);
});
server.listen(PORT, () => {
  console.log(`  ┌─────────────────────────────────────────────────────┐`);
  console.log(`  │  AegisFlow — Shield Ops Console                     │`);
  console.log(`  │  http://localhost:${PORT}                              │`);
  console.log(`  │  mode: ${USE_AWS ? 'AWS (USE_AWS=1) — WAFv2 dispatcher active' : 'LOCAL simulation'}          │`);
  console.log(`  └─────────────────────────────────────────────────────┘`);
});

let tickTimer = setInterval(() => {
  const snap = engine.tick();
  broadcast(snap);
}, 1000);
tickTimer.unref?.();

process.on('SIGINT', () => { console.log('\nshutting down'); process.exit(0); });

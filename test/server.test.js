'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('server boots, exposes launchable scenarios and survives malformed static URLs', async t => {
  const port = 30000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), USE_AWS: '0' },
    stdio: 'ignore', windowsHide: true
  });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    try { healthy = (await fetch(base + '/api/health').then(r => r.json())).ok; } catch {}
    if (healthy) break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal(healthy, true);
  const state = await fetch(base + '/api/state').then(r => r.json());
  assert.equal(state.scenarioList.length, 5);
  assert.equal((await fetch(base + '/')).status, 200);
  const rawGet = requestPath => new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: requestPath }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
  assert.equal(await rawGet('/%ZZ'), 400);
  assert.equal(await rawGet('/../public-neighbor/secret.txt'), 403);
  assert.equal((await fetch(base + '/api/health').then(r => r.json())).ok, true);
});

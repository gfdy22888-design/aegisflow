'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../lib/engine');
const e = createEngine();
for (let i = 0; i < 60; i++) e.tick();
for (let i = 0; i < 120; i++) {
  if (i === 30) e.startScenario('http-flood');
  if (i === 70) e.applyMitigation({ type: 'rate-limit', scopeType: 'path', scopeValue: '/api/search', limit: 30 });
  e.tick();
}
const s = e.snapshot();
const data = { history: s.history, alerts: s.alerts, mitigations: s.mitigations };
const file = path.join(__dirname, '../demo/index.html');
let html = fs.readFileSync(file, 'utf8');
html = html.replace(/const DATA = .*?;\r?\nconst H =/, `const DATA = ${JSON.stringify(data)};\nconst H =`);
fs.writeFileSync(file, html);
console.log('Updated offline replay from current engine: 120 simulated one-second samples.');

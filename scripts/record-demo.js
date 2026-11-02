'use strict';
// Authoring dependency only: set RECORD_TOOLS_DIR to a directory containing
// node_modules/playwright. The application itself remains dependency-free.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const tools = process.env.RECORD_TOOLS_DIR;
if (!tools) throw new Error('Set RECORD_TOOLS_DIR to the Playwright tooling directory');
const { chromium } = require(path.join(tools, 'node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const work = path.join(root, '.delivery-work');
const frames = path.join(root, 'docs/demo/verification');
const screenshots = path.join(root, 'docs/screenshots');
for (const dir of [work, frames, screenshots]) fs.mkdirSync(dir, { recursive: true });
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const theme = `<style>*{box-sizing:border-box}body{margin:0;padding:68px 100px;background:#080f1a;color:#d8e4f2;font:23px/1.5 'Segoe UI',sans-serif}h1{font-size:44px;margin:12px 0}h2{font-size:26px;color:#2dd4bf}.eyebrow{color:#2dd4bf;letter-spacing:4px;font-size:18px}.note{color:#93a6bd;font-size:21px}table{width:100%;border-collapse:collapse;background:#0d1828}th,td{text-align:left;border-bottom:1px solid #253449;padding:16px 20px}th{color:#2dd4bf}td:last-child{color:#93a6bd}.flow{display:flex;gap:15px;align-items:center;margin:30px 0}.node{padding:20px 28px;border:1px solid #315266;border-radius:14px;background:#0d1828}pre{font:16px/1.65 Consolas,monospace;background:#0d1828;padding:25px;border:1px solid #26394f;border-radius:12px;white-space:pre-wrap;margin:15px 0}.cols{display:grid;grid-template-columns:1fr 1fr;gap:30px}.badge{display:inline-block;border:1px solid #35615d;padding:8px 17px;border-radius:30px;color:#2dd4bf;font-size:18px}</style>`;
fs.writeFileSync(path.join(work, 'architecture.html'), `<!doctype html><meta charset="utf-8">${theme}
<div class="eyebrow">AEGISFLOW / AWS EVIDENCE</div><h1>A local decision loop. An explicit cloud path.</h1>
<span class="badge">Local simulation works now</span> <span class="badge">AWS adapter: offline-tested prototype</span>
<div class="flow"><div class="node">Clients</div>→<div class="node">CloudFront</div>→<div class="node">WAFv2</div>→<div class="node">Private S3 origin</div></div>
<table><tr><th>Console action</th><th>AWS implementation</th><th>Evidence</th></tr>
<tr><td>Rate-limit / path</td><td>RateBasedStatement + scope-down</td><td>60-second window; offline-tested</td></tr>
<tr><td>Challenge / path</td><td>UriPath match + Captcha</td><td>Supported manual addition</td></tr>
<tr><td>Block / IPv4 or country</td><td>UpdateIPSet / GeoMatchStatement</td><td>Existing addresses and rules retained</td></tr>
<tr><td>Mitigation counter</td><td>CloudWatch PutMetricData → alarm</td><td>Reference SAM template</td></tr>
<tr><td>Cache / Shield / cloud autopilot</td><td>Future integration</td><td>No runtime implementation claimed</td></tr></table>
<h2>aws/ARCHITECTURE.md · aws/template.yaml · lib/aws-adapter.js</h2>
<p class="note">No live AWS deployment or cloud performance is claimed. The Node console needs a separate backend host.</p>`);
const code = fs.readFileSync(path.join(root, 'lib/aws-adapter.js'), 'utf8').split('\n');
function excerpt(from, to) {
  const start = code.findIndex(l => l.includes(from));
  const end = code.findIndex((l, i) => i > start && l.includes(to));
  return code.slice(start, end < 0 ? start + 20 : end).map((l, i) => `${String(start + i + 1).padStart(3)}  ${l}`).join('\n');
}
fs.writeFileSync(path.join(work, 'adapter.html'), `<!doctype html><meta charset="utf-8">${theme}
<div class="eyebrow">AEGISFLOW / SOURCE EVIDENCE</div><h1>Read. Preserve. Apply. Verify.</h1>
<p class="note">Exact excerpts from lib/aws-adapter.js · SDK v3 · contract-tested with fake clients</p><div class="cols">
<section><h2>Native WAF rate-based payload</h2><pre>${esc(excerpt("if (spec.type === 'rate-limit')", "} else if (spec.type === 'block'"))}</pre></section>
<section><h2>Optimistic locking + rule preservation</h2><pre>${esc(excerpt('const id = { Id: env.WAF_WEBACL_ID', 'let metricWarning;'))}</pre></section></div>
<p class="note">AWS calls are optional manual additions. The demo and all displayed performance figures remain local simulation.</p>`);

const port = Number(process.env.RECORD_PORT || 8188);
const base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { recordedAt: new Date().toISOString(), traffic: 'synthetic', cloudDeployment: false, shots: [], errors: [] };
async function waitState(predicate, label, limit = 12000) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    const s = await fetch(`${base}/api/state`).then(r => r.json());
    if (predicate(s)) return s;
    await sleep(200);
  }
  throw new Error(`State assertion timed out: ${label}`);
}
async function main() {
  const log = fs.openSync(path.join(work, 'record-server.log'), 'w');
  const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), USE_AWS: '0' }, stdio: ['ignore', log, log], windowsHide: true });
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${base}/api/health`).then(r => r.json())).ok) break; } catch {}
      if (i === 49) throw new Error('Recorder server did not start');
      await sleep(200);
    }
    // A fresh server has no previous incident or stale graph/alert history.
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: path.join(work, 'video'), size: { width: 1920, height: 1080 } } });
    const start = Date.now();
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    async function at(sec) { await sleep(Math.max(0, sec * 1000 - (Date.now() - start))); }
    async function capture(name, state, time) {
      await page.screenshot({ path: path.join(frames, `${name}.png`) });
      report.shots.push({ name, time, kpis: state?.kpis, autoMitigate: state?.autoMitigate,
        mitigations: state?.mitigations, alerts: state?.alerts });
      console.log(`${name}: ${JSON.stringify(state ? { rps: state.kpis.rawRps, origin: state.kpis.originRps, score: state.kpis.score, mitigations: state.mitigations.length } : {})}`);
    }
    await page.goto(base);
    await page.locator('.scen').first().waitFor();
    assert.equal(await page.locator('.scen').count(), 5);
    const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    assert.ok(layout.width <= layout.viewport, 'Horizontal overflow at 1080p');
    report.layout = layout;
    await at(10);
    const calm = await waitState(s => s.kpis.classification.label === 'normal' && s.kpis.score < 20, 'clean baseline');
    assert.equal(calm.alerts.filter(a => a.title.startsWith('Detected:')).length, 0);
    await capture('01-baseline', calm, 10);
    await page.screenshot({ path: path.join(screenshots, '01-baseline.png') });
    await at(24);
    await page.locator('.scen').filter({ hasText: 'HTTP Flood' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    const attack = await waitState(s => s.kpis.classification.label === 'http-flood' && s.kpis.rawRps >= 1200, 'HTTP attack');
    await at(36);
    const attackHold = await fetch(`${base}/api/state`).then(r => r.json());
    await capture('02-attack', attackHold, 36);
    await page.screenshot({ path: path.join(screenshots, '02-attack-detected.png') });
    await at(44); await page.locator('button.stop-all').first().click();
    await at(46); await page.locator('label.switch').click();
    await at(47); await page.locator('.scen').filter({ hasText: 'HTTP Flood' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await waitState(s => s.mitigations.some(m => m.auto && m.type === 'rate-limit'), 'automatic rate limit');
    await at(63);
    const mitigated = await waitState(s => s.kpis.mitigatedRps > 500 && s.kpis.originRps < s.kpis.rawRps * 0.6, 'origin recovery');
    assert.ok(mitigated.kpis.topSources.filter(s => s.kind === 'attacker').every(s => s.rps <= 30));
    await capture('03-auto-mitigated', mitigated, 63);
    await page.screenshot({ path: path.join(screenshots, '03-autopilot-mitigated.png') });
    await at(70); await page.locator('button.stop-all').first().click();
    const clear = page.getByRole('button', { name: 'CLEAR ALL MITIGATIONS' });
    if (await clear.count()) await clear.click();
    await at(73); await page.locator('.scen').filter({ hasText: 'Flash Crowd' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await waitState(s => s.kpis.classification.label === 'benign-spike' && s.kpis.entropyIp > 8, 'benign flash crowd');
    await at(85);
    const benign = await waitState(s => s.autoMitigate && s.mitigations.length === 0 && s.kpis.mitigatedRps === 0 && s.kpis.rawRps >= 1500, 'benign zero blocking');
    await capture('04-benign-restraint', benign, 85);
    await page.screenshot({ path: path.join(screenshots, '04-benign-restraint.png') });
    await at(95); await page.goto(pathToFileURL(path.join(work, 'architecture.html')).href);
    await at(102); await capture('05-aws-mapping', null, 102);
    await at(109); await page.goto(pathToFileURL(path.join(work, 'adapter.html')).href);
    await at(114); await capture('06-aws-code', null, 114);
    await at(119); await page.goto(base); await page.locator('.scen').first().waitFor();
    await at(124); await capture('07-closing', await fetch(`${base}/api/state`).then(r => r.json()), 124);
    await at(130);
    assert.deepEqual(report.errors, []);
    const videoPath = await page.video().path();
    await context.close();
    report.videoPath = path.relative(root, videoPath).split(path.sep).join('/');
    report.status = 'passed';
    fs.writeFileSync(path.join(frames, 'recording-report.json'), JSON.stringify(report, null, 2));
    console.log(`VIDEO_SAVED=${videoPath}`);
  } finally {
    await browser?.close(); server.kill(); fs.closeSync(log);
  }
}
main().catch(e => { report.status = 'failed'; report.errors.push(e.message); fs.writeFileSync(path.join(frames, 'recording-report.json'), JSON.stringify(report, null, 2)); console.error(e); process.exitCode = 1; });

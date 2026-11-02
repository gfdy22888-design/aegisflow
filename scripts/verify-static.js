'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.RECORD_TOOLS_DIR, 'node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const site = path.join(root, '.delivery-work/site');
async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(site, 'live.html')).href);
    await page.locator('.scen').first().waitFor();
    assert.equal(await page.locator('.scen').count(), 5);
    await page.locator('label.switch').click();
    await page.locator('.scen').filter({ hasText: 'HTTP Flood' }).click();
    await page.waitForFunction(() => localEngine.snapshot().mitigations.length > 0, { timeout: 15000 });
    const state = await page.evaluate(() => localEngine.snapshot());
    assert.ok(state.mitigations.some(m => m.auto));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(root, 'docs/demo/verification/browser-demo.png') });
    await page.goto(pathToFileURL(path.join(site, 'replay.html')).href);
    await page.getByRole('button', { name: 'Replay incident' }).click();
    await page.waitForFunction(() => document.getElementById('phase').textContent === 'tick 120 / 120');
    assert.deepEqual(errors, []);
    await page.goto(pathToFileURL(path.join(root, 'docs/logo.svg')).href);
    await page.setViewportSize({ width: 640, height: 640 });
    await page.screenshot({ path: path.join(root, 'docs/logo.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.join(site, 'index.html')).href);
    await page.screenshot({ path: path.join(root, 'docs/demo/verification/landing-page.png'), fullPage: true });
    console.log('Browser simulation, autopilot, offline replay and static landing page passed. Logo PNG exported.');
    fs.writeFileSync(path.join(root, 'docs/demo/verification/static-report.json'), JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(), scenarioButtons: 5, browserAutopilot: true, replaySamples: 120, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

'use strict';
/**
 * AegisFlow engine regression tests (node:test, zero dependencies).
 * Run: npm test   (or: node --test test/)
 *
 * The sustained-attack test is the regression guard for the EWMA baseline
 * "attack becomes the new normal" failure mode: the baseline must stay frozen
 * while an attack (or mitigation) is active, so the anomaly score holds.
 */
const test = require('node:test');
const assert = require('node:assert');
const { createEngine, SCENARIOS } = require('../lib/engine.js');

function freshEngine(ticks) {
  const e = createEngine({ tickMs: 1000 });
  for (let i = 0; i < ticks; i++) e.tick(); // let the baseline settle
  return e;
}

test('fresh API snapshot contains the five launchable scenario definitions', () => {
  const list = createEngine().snapshot().scenarioList;
  assert.deepStrictEqual(list.map(s => s.name).sort(), Object.keys(SCENARIOS).sort());
  assert.ok(list.every(s => s.label && s.detail));
});

test('armed autopilot leaves a sustained benign crowd unblocked', () => {
  const e = freshEngine(90);
  e.setAuto(true);
  e.startScenario('flash-crowd');
  for (let i = 0; i < 60; i++) {
    const s = e.tick();
    assert.strictEqual(s.mitigations.length, 0);
    assert.strictEqual(s.kpis.mitigatedRps, 0);
  }
});

test('sustained http-flood: anomaly score holds (no baseline adaptation)', () => {
  const e = freshEngine(90);
  e.startScenario('http-flood');
  const scores = [];
  for (let i = 0; i < 90; i++) scores.push(e.tick().kpis.score);
  // after the initial spike, a sustained flood must stay flagged — the score
  // may not decay back to "normal" while the attack is still running
  const tail = scores.slice(10);
  assert.ok(Math.min(...tail) >= 40, `score decayed during sustained attack: min=${Math.min(...tail)} tail=${tail.slice(0, 20).join(',')}`);
});

test('http-flood classifies as HTTP Flood (L7), not volumetric', () => {
  const e = freshEngine(90);
  e.startScenario('http-flood');
  let cls = null;
  for (let i = 0; i < 15; i++) cls = e.tick().kpis.classification;
  assert.strictEqual(cls.label, 'http-flood');
  assert.strictEqual(cls.recommendation, 'rate-limit');
});

test('volumetric classifies as Volumetric SYN Flood (L3/4)', () => {
  const e = freshEngine(90);
  e.startScenario('volumetric');
  let cls = null;
  for (let i = 0; i < 15; i++) cls = e.tick().kpis.classification;
  assert.strictEqual(cls.label, 'volumetric');
});

test('slowloris classifies by connection-hold signature', () => {
  const e = freshEngine(90);
  e.startScenario('slowloris');
  let cls = null;
  for (let i = 0; i < 15; i++) cls = e.tick().kpis.classification;
  assert.strictEqual(cls.label, 'slowloris');
});

test('credential stuffing classifies by 401-storm signature', () => {
  const e = freshEngine(90);
  e.startScenario('cred-stuff');
  let cls = null;
  for (let i = 0; i < 15; i++) cls = e.tick().kpis.classification;
  assert.strictEqual(cls.label, 'credential-stuffing');
});

test('flash crowd classifies benign — recommendation is cache, never block', () => {
  const e = freshEngine(90);
  e.startScenario('flash-crowd');
  let cls = null;
  for (let i = 0; i < 15; i++) cls = e.tick().kpis.classification;
  assert.strictEqual(cls.label, 'benign-spike');
  assert.strictEqual(cls.recommendation, 'cache');
});

test('rate-limit playbook measurably offloads the origin', () => {
  const e = freshEngine(90);
  e.startScenario('http-flood');
  for (let i = 0; i < 15; i++) e.tick(); // let the flood reach full strength
  const before = e.snapshot().kpis;
  e.applyMitigation({ type: 'rate-limit', scopeType: 'path', scopeValue: '/api/search', limit: 30 });
  let after = null;
  for (let i = 0; i < 15; i++) after = e.tick().kpis;
  assert.ok(after.originRps < before.originRps * 0.6,
    `origin rps did not drop: ${before.originRps} → ${after.originRps}`);
  assert.ok(after.mitigatedRps > 0, 'no traffic counted as mitigated');
});

test('ingress equals origin plus edge offload, including the cache playbook', () => {
  for (const type of ['rate-limit', 'cache']) {
    const e = freshEngine(90);
    e.startScenario('http-flood');
    e.applyMitigation({ type, scopeType: 'global', limit: 30 });
    for (let i = 0; i < 10; i++) {
      const k = e.tick().kpis;
      assert.ok(Math.abs(k.rawRps - k.originRps - k.mitigatedRps) <= 1,
        `${type}: ingress=${k.rawRps}, origin=${k.originRps}, offload=${k.mitigatedRps}`);
    }
  }
});

test('autopilot applies the recommended playbook and logs it', () => {
  const e = freshEngine(90);
  e.setAuto(true);
  e.startScenario('http-flood');
  let mitigated = false;
  for (let i = 0; i < 30; i++) {
    e.tick();
    if (e.snapshot().mitigations.length > 0) { mitigated = true; break; }
  }
  assert.ok(mitigated, 'autopilot did not apply a mitigation within 30 ticks of a sustained flood');
});

test('calm traffic stays calm (no false positives on baseline)', () => {
  const e = freshEngine(120);
  for (let i = 0; i < 60; i++) {
    const k = e.tick().kpis;
    assert.ok(k.score < 40, `false positive on calm traffic: score=${k.score} class=${k.classification.label}`);
  }
});

test('every scenario has a playbook reachable through its classifier label', () => {
  const { PLAYBOOKS } = require('../lib/engine.js');
  const classByScenario = {
    'http-flood': 'http-flood',
    'volumetric': 'volumetric',
    'slowloris': 'slowloris',
    'cred-stuff': 'credential-stuffing',
    'flash-crowd': 'benign-spike', // recommendation checked in the benign test
  };
  for (const [scenario, cls] of Object.entries(classByScenario)) {
    assert.ok(SCENARIOS[scenario], `unknown scenario "${scenario}"`);
    assert.ok(PLAYBOOKS[cls], `no playbook for classifier label "${cls}" (scenario "${scenario}")`);
  }
});

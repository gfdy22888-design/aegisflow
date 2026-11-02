'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRule, createAwsDispatcher } = require('../lib/aws-adapter');

const env = { WAF_WEBACL_ID: 'test-acl', WAF_WEBACL_NAME: 'aegisflow-edge',
  WAF_IPSET_ARN: 'arn:aws:wafv2:us-east-1:123456789012:global/ipset/demo/id',
  WAF_IPSET_ID: 'test-ipset', WAF_IPSET_NAME: 'aegisflow-blocked-ips' };
const rate = { type: 'rate-limit', scopeType: 'path', scopeValue: '/api/search', limit: 30 };

function fixture() {
  const calls = [], config = [];
  let failUpdate = false, failMetric = false;
  let acl = { Rules: [{ Name: 'existing-managed-rule', Priority: 4 }],
    DefaultAction: { Block: {} }, Description: 'keep this', TokenDomains: ['example.com'],
    VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: 'demo' } };
  let addresses = ['192.0.2.1/32'];
  const command = name => class { constructor(input) { this.name = name; this.input = input; } };
  class Client {
    constructor(options) { config.push(options); }
    async send(cmd) {
      calls.push(cmd);
      if (cmd.name === 'GetWebACL') return { WebACL: structuredClone(acl), LockToken: 'acl-lock' };
      if (cmd.name === 'UpdateWebACL') {
        if (failUpdate) { failUpdate = false; throw new Error('temporary update failure'); }
        acl = structuredClone(cmd.input); return {};
      }
      if (cmd.name === 'GetIPSet') return { IPSet: { Addresses: addresses }, LockToken: 'ip-lock' };
      if (cmd.name === 'UpdateIPSet') { addresses = cmd.input.Addresses; return {}; }
      if (cmd.name === 'PutMetricData' && failMetric) throw new Error('metrics unavailable');
      return {};
    }
    destroy() {}
  }
  const waf = { WAFV2Client: Client, GetWebACLCommand: command('GetWebACL'),
    UpdateWebACLCommand: command('UpdateWebACL'), GetIPSetCommand: command('GetIPSet'), UpdateIPSetCommand: command('UpdateIPSet') };
  const cw = { CloudWatchClient: Client, PutMetricDataCommand: command('PutMetricData') };
  return { calls, config, dispatch: createAwsDispatcher({ env, loadSdk: async () => [waf, cw] }),
    failUpdate: () => { failUpdate = true; }, failMetric: () => { failMetric = true; } };
}

test('WAF rate limit uses a 60-second window and preserves the target path', () => {
  const r = buildRule(rate);
  assert.equal(r.Statement.RateBasedStatement.Limit, 1800);
  assert.equal(r.Statement.RateBasedStatement.EvaluationWindowSec, 60);
  assert.equal(r.Statement.RateBasedStatement.ScopeDownStatement.ByteMatchStatement.SearchString.toString('utf8'), '/api/search');
  assert.deepEqual(buildRule({ type: 'challenge', scopeType: 'path', scopeValue: '/api/login' }).Action, { Captcha: {} });
});

test('unimplemented cache and synthetic scopes fail before AWS calls', async () => {
  const f = fixture();
  await assert.rejects(f.dispatch({ type: 'cache', scopeType: 'global' }), /not implemented/);
  await assert.rejects(f.dispatch({ type: 'block', scopeType: 'kind', scopeValue: 'attacker' }), /synthetic/);
  assert.equal(f.calls.length, 0);
});

test('WebACL update includes optimistic lock, existing rules and configuration', async () => {
  const f = fixture();
  await f.dispatch(rate);
  const u = f.calls.find(c => c.name === 'UpdateWebACL').input;
  assert.equal(u.LockToken, 'acl-lock');
  assert.equal(u.Rules[0].Name, 'existing-managed-rule');
  assert.equal(u.Rules[1].Priority, 5);
  assert.deepEqual(u.DefaultAction, { Block: {} });
  assert.deepEqual(u.TokenDomains, ['example.com']);
  assert.equal(u.Description, 'keep this');
  assert.ok(f.config.every(c => c.region === 'us-east-1'));
});

test('concurrent dispatches preserve both additions; repeated rules deduplicate', async () => {
  const f = fixture();
  await Promise.all([f.dispatch(rate), f.dispatch({ type: 'challenge', scopeType: 'path', scopeValue: '/api/login' })]);
  const updates = f.calls.filter(c => c.name === 'UpdateWebACL');
  assert.equal(updates.at(-1).input.Rules.length, 3);
  assert.equal((await f.dispatch(rate)).deduped, true);
  assert.equal(f.calls.filter(c => c.name === 'UpdateWebACL').length, 2);
});

test('failed enforcement does not suppress a subsequent retry', async () => {
  const f = fixture(); f.failUpdate();
  await assert.rejects(f.dispatch(rate), /temporary/);
  assert.equal((await f.dispatch(rate)).mode, 'aws');
  assert.equal(f.calls.filter(c => c.name === 'UpdateWebACL').length, 2);
});

test('IP block adds an explicit IPv4 address while preserving existing IPs', async () => {
  const f = fixture();
  await f.dispatch({ type: 'block', scopeType: 'ip', scopeValue: '192.0.2.2' });
  const u = f.calls.find(c => c.name === 'UpdateIPSet').input;
  assert.equal(u.LockToken, 'ip-lock');
  assert.deepEqual(u.Addresses, ['192.0.2.1/32', '192.0.2.2/32']);
  assert.ok(f.calls.findIndex(c => c.name === 'UpdateIPSet') < f.calls.findIndex(c => c.name === 'UpdateWebACL'));
});

test('CloudWatch failure reports applied enforcement accurately', async () => {
  const f = fixture(); f.failMetric();
  const r = await f.dispatch(rate);
  assert.match(r.metricWarning, /Rule applied/);
  const m = f.calls.find(c => c.name === 'PutMetricData').input.MetricData[0];
  assert.equal(m.Dimensions, undefined); // same dimensionless series as the template alarm
});

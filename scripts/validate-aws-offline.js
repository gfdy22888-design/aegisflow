// Optional authoring check: npm install --prefix .delivery-work/validation --no-save yaml @aws-sdk/client-wafv2 @aws-sdk/client-cloudwatch
const path = require('node:path');
const modules = process.env.AWS_VALIDATION_MODULES || path.resolve(__dirname, '../.delivery-work/validation/node_modules');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const yaml = require(path.join(modules, 'yaml'));
const waf = require(path.join(modules, '@aws-sdk/client-wafv2'));
const cw = require(path.join(modules, '@aws-sdk/client-cloudwatch'));
const { createAwsDispatcher } = require('../lib/aws-adapter');
const template = yaml.parseDocument(fs.readFileSync('aws/template.yaml', 'utf8'), { customTags: ['Ref', 'Sub', 'GetAtt'].map(tag => ({ tag: '!' + tag, resolve: s => s })) });
assert.equal(template.errors.length, 0);
const obj = template.toJS();
assert.ok(obj.Resources.OriginBucketPolicy);
assert.equal(obj.Resources.EdgeWAF.Properties.Rules[0].Statement.RateBasedStatement.EvaluationWindowSec, 60);
const requests = [];
const requestHandler = { async handle(request) {
  const target = request.headers['x-amz-target'] || request.path;
  const body = JSON.parse(request.body ? Buffer.from(request.body).toString('utf8') : '{}');
  requests.push({ target, body });
  let response = {};
  if (target.endsWith('GetWebACL')) response = { LockToken: 'demo-lock', WebACL: {
    Name: 'aegisflow-edge', Id: 'demo-acl', DefaultAction: { Allow: {} }, Rules: [],
    VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: 'demo' } } };
  if (target.endsWith('GetIPSet')) response = { LockToken: 'demo-ip-lock', IPSet: { Addresses: [] } };
  return { response: { statusCode: 200, headers: { 'content-type': 'application/x-amz-json-1.1' }, body: Buffer.from(JSON.stringify(response)) } };
}, destroy() {} };
const config = { credentials: { accessKeyId: 'offline-test', secretAccessKey: 'offline-test' }, requestHandler };
class WafClient extends waf.WAFV2Client { constructor(c) { super({ ...c, ...config }); } }
class CwClient extends cw.CloudWatchClient { constructor(c) { super({ ...c, ...config }); } }
const env = { WAF_WEBACL_ID: 'demo-acl', WAF_WEBACL_NAME: 'aegisflow-edge', WAF_IPSET_ID: 'demo-ip', WAF_IPSET_NAME: 'demo-ipset', WAF_IPSET_ARN: 'arn:aws:wafv2:us-east-1:123456789012:global/ipset/demo/demo' };
(async () => {
  const dispatch = createAwsDispatcher({ env, loadSdk: async () => [{ ...waf, WAFV2Client: WafClient }, { ...cw, CloudWatchClient: CwClient }] });
  for (const spec of [
    { type: 'rate-limit', scopeType: 'path', scopeValue: '/api/search', limit: 30 },
    { type: 'challenge', scopeType: 'path', scopeValue: '/api/login' },
    { type: 'block', scopeType: 'ip', scopeValue: '192.0.2.2' },
    { type: 'block', scopeType: 'geo', scopeValue: 'US' }
  ]) await dispatch(spec);
  const updates = requests.filter(r => r.target.endsWith('UpdateWebACL'));
  assert.equal(updates.length, 4);
  const bytes = updates[1].body.Rules[0].Statement.ByteMatchStatement.SearchString;
  assert.equal(Buffer.from(bytes, 'base64').toString(), '/api/login');
  fs.writeFileSync('docs/demo/verification/sdk-template-report.json', JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(), yamlParsed: true,
    sdk: { wafv2: require(path.join(modules, '@aws-sdk/client-wafv2/package.json')).version, cloudwatch: require(path.join(modules, '@aws-sdk/client-cloudwatch/package.json')).version },
    manualPlaybooksSerialized: updates.length, actualNetworkRequests: 0, credentialSource: 'fake offline test values',
    note: 'Actual SDK serialization and fake HTTP responses; no AWS account or CloudFormation deployment validation.' }, null, 2));
  console.log('Reference YAML parses; four playbooks serialize with real SDK clients and offline HTTP handlers. No AWS calls.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });

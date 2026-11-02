/* AegisFlow: optional AWS integration prototype; the default demo is local.
 * npm i --no-save @aws-sdk/client-wafv2 @aws-sdk/client-cloudwatch
 * CloudFront-scoped WAF resources require us-east-1. See aws/ARCHITECTURE.md.
 * Only explicit manual additions are dispatched. Cloud removal, autopilot,
 * CloudFront cache changes and Shield subscription management are future work.
 * Use a dedicated demo WebACL, never an existing production WebACL.
 */
'use strict';
const { isIP } = require('node:net');
const USE_AWS = process.env.USE_AWS === '1';

function ruleNameFor(spec) {
  const scope = spec.scopeType && spec.scopeType !== 'global'
    ? `${spec.scopeType}-${String(spec.scopeValue).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 24)}`
    : 'global';
  return `AegisFlow-${spec.type}-${scope}`.slice(0, 64);
}

function pathStatement(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) throw new Error('A path beginning with / is required');
  return { ByteMatchStatement: {
    FieldToMatch: { UriPath: {} }, PositionalConstraint: 'EXACTLY',
    SearchString: Buffer.from(value, 'utf8'), TextTransformations: [{ Priority: 0, Type: 'NONE' }]
  } };
}

// WAF approximates a rate over a 60-second window, unlike the simulator's exact rps cap.
function buildRule(spec, env = process.env) {
  const scope = spec.scopeType || 'global';
  let Statement, Action = { Block: {} };
  if (spec.type === 'rate-limit') {
    if (!['global', 'path'].includes(scope)) throw new Error('AWS rate-limit supports global or path scope in this prototype');
    const limit = Number(spec.limit || 25);
    if (!Number.isFinite(limit) || limit <= 0 || limit * 60 > 2000000000) throw new Error('Invalid rate limit');
    const rate = { Limit: Math.max(10, Math.ceil(limit * 60)), EvaluationWindowSec: 60, AggregateKeyType: 'IP' };
    if (scope === 'path') rate.ScopeDownStatement = pathStatement(spec.scopeValue);
    Statement = { RateBasedStatement: rate };
  } else if (spec.type === 'challenge') {
    if (scope !== 'path') throw new Error('AWS challenge supports path scope in this prototype');
    Statement = pathStatement(spec.scopeValue);
    Action = { Captcha: {} };
  } else if (spec.type === 'block' || spec.type === 'geo-block') {
    if (scope === 'geo') {
      if (!/^[A-Z]{2}$/.test(spec.scopeValue || '')) throw new Error('A two-letter uppercase country code is required');
      Statement = { GeoMatchStatement: { CountryCodes: [spec.scopeValue] } };
    } else if (scope === 'ip') {
      if (!isIP(spec.scopeValue)) throw new Error('A valid IP address is required');
      if (isIP(spec.scopeValue) !== 4) throw new Error('The included IP set supports IPv4 only');
      if (!env.WAF_IPSET_ARN || !env.WAF_IPSET_ID || !env.WAF_IPSET_NAME) throw new Error('WAF_IPSET_ARN, WAF_IPSET_ID and WAF_IPSET_NAME are required');
      Statement = { IPSetReferenceStatement: { ARN: env.WAF_IPSET_ARN } };
    } else throw new Error('AWS block supports explicit IP or geo scope; synthetic kind/ASN cannot be enforced');
  } else throw new Error(`AWS playbook ${spec.type} is not implemented; cache changes remain a design mapping`);
  const Name = ruleNameFor(spec);
  return { Name, Priority: 0, Statement, Action,
    VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: Name } };
}

function localDispatcher(spec) {
  const ruleName = ruleNameFor(spec);
  console.log(`[aegisflow:local] ${spec.type} ${spec.scopeType}:${spec.scopeValue || '*'} (synthetic traffic only)`);
  return Promise.resolve({ mode: 'local', ruleName });
}

// Injectable SDK for offline contract tests. Serialize read/modify/write so
// concurrent requests in this process do not replace each other's rules.
function createAwsDispatcher({ env = process.env, loadSdk = () => Promise.all([
  import('@aws-sdk/client-wafv2'), import('@aws-sdk/client-cloudwatch')
]) } = {}) {
  const applied = new Map();
  let queue = Promise.resolve();
  async function dispatch(spec) {
    const rule = buildRule(spec, env);
    if (!env.WAF_WEBACL_ID || !env.WAF_WEBACL_NAME) throw new Error('WAF_WEBACL_ID and WAF_WEBACL_NAME are required');
    const Scope = env.WAF_SCOPE || 'CLOUDFRONT';
    const region = Scope === 'CLOUDFRONT' ? 'us-east-1' : (env.AWS_REGION || 'us-east-1');
    const ttl = Number(env.MITIGATION_LOCK_TTL_MS || 300000);
    const key = JSON.stringify([rule.Name, rule.Statement, rule.Action]);
    if (applied.has(key) && Date.now() - applied.get(key) < ttl) return { mode: 'aws', ruleName: rule.Name, deduped: true };
    const [waf, cloudwatch] = await loadSdk();
    const client = new waf.WAFV2Client({ region });
    const cw = new cloudwatch.CloudWatchClient({ region });
    try {
      if (spec.scopeType === 'ip') {
        const id = { Id: env.WAF_IPSET_ID, Name: env.WAF_IPSET_NAME, Scope };
        const current = await client.send(new waf.GetIPSetCommand(id));
        await client.send(new waf.UpdateIPSetCommand({ ...id, LockToken: current.LockToken,
          Description: current.IPSet.Description,
          Addresses: [...new Set([...current.IPSet.Addresses, `${spec.scopeValue}/32`])] }));
      }
      const id = { Id: env.WAF_WEBACL_ID, Name: env.WAF_WEBACL_NAME, Scope };
      const current = await client.send(new waf.GetWebACLCommand(id));
      const existing = current.WebACL;
      const rules = (existing.Rules || []).filter(r => r.Name !== rule.Name);
      const previous = (existing.Rules || []).find(r => r.Name === rule.Name);
      rule.Priority = previous ? previous.Priority : Math.max(-1, ...rules.map(r => r.Priority)) + 1;
      const input = { ...id, LockToken: current.LockToken, Rules: [...rules, rule] };
      for (const field of ['DefaultAction', 'VisibilityConfig', 'Description', 'CustomResponseBodies',
        'CaptchaConfig', 'ChallengeConfig', 'TokenDomains', 'AssociationConfig',
        'OnSourceDDoSProtectionConfig', 'DataProtectionConfig', 'ApplicationConfig']) {
        if (existing[field] !== undefined) input[field] = existing[field];
      }
      await client.send(new waf.UpdateWebACLCommand(input));
      applied.set(key, Date.now()); // failed enforcement remains retryable
      let metricWarning;
      try {
        await cw.send(new cloudwatch.PutMetricDataCommand({ Namespace: 'AegisFlow/Mitigations',
          MetricData: [{ MetricName: 'Applied', Value: 1, Unit: 'Count', Timestamp: new Date() }] }));
      } catch (e) { metricWarning = `Rule applied; CloudWatch metric failed: ${e.message}`; }
      return { mode: 'aws', ruleName: rule.Name, ...(metricWarning ? { metricWarning } : {}) };
    } finally { client.destroy?.(); cw.destroy?.(); }
  }
  return spec => {
    const work = queue.then(() => dispatch(spec));
    queue = work.catch(() => {});
    return work;
  };
}
const awsDispatcher = createAwsDispatcher();
function getMitigationDispatcher(useAws) { return useAws ? awsDispatcher : localDispatcher; }
module.exports = { getMitigationDispatcher, localDispatcher, awsDispatcher, createAwsDispatcher, buildRule, ruleNameFor, USE_AWS };

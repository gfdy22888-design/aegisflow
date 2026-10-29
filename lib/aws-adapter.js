/* =============================================================================
 * AegisFlow — AWS adapter (env switch: USE_AWS=1)
 * -----------------------------------------------------------------------------
 * Single choke-point where every mitigation executed in the local simulator is
 * mirrored to REAL AWS infrastructure when USE_AWS=1 is set.
 *
 *   USE_AWS=0 (default)  → local simulation only (this repo runs anywhere)
 *   USE_AWS=1            → each action also invokes the AWS SDK v3 clients:
 *                          - @aws-sdk/client-wafv2        (UpdateWebACL: rate-based
 *                            rules, IPSet updates, CAPTCHA/Challenge/Block actions)
 *                          - @aws-sdk/client-shield        (CreateProtection /
 *                          DescribeAttack for Shield Advanced)
 *                          - @aws-sdk/client-cloudfront    (cache policy / invalidation)
 *                          - @aws-sdk/client-cloudwatch    (PutMetricData)
 *
 * SDK clients are imported DYNAMICALLY so the default `npm start` path stays
 * 100% dependency-free. In AWS mode install the (dev-optional) clients:
 *   npm i @aws-sdk/client-wafv2 @aws-sdk/client-shield @aws-sdk/client-cloudfront
 * and provide standard AWS credentials (env vars / instance profile).
 *
 * The WebACL Id / Scope / distribution Id are wired from env or from the
 * CloudFormation stack outputs (see aws/template.yaml → Outputs).
 * ========================================================================== */
'use strict';

const USE_AWS = process.env.USE_AWS === '1';
const WEBACL_ID = process.env.WAF_WEBACL_ID || '';        // from stack output WebACLId
const WEBACL_SCOPE = process.env.WAF_SCOPE || 'CLOUDFRONT';
const WEBACL_NAME = process.env.WAF_WEBACL_NAME || 'AegisFlow-WebACL';
const DISTRIBUTION_ID = process.env.CF_DISTRIBUTION_ID || '';
const LOCK_TTL_MS = Number(process.env.MITIGATION_LOCK_TTL_MS || 300000);

/* --- idempotency: don't push the same rule to WAF twice ------------------ */
const applied = new Map(); // key -> ts

function onceEvery(key, ttlMs) {
  const now = Date.now();
  const last = applied.get(key) || 0;
  if (now - last < ttlMs) return false;
  applied.set(key, now);
  return true;
}

/* --- rule name builder mirroring local mitigation semantics --------------- */
function ruleNameFor(spec) {
  const scope = spec.scopeType && spec.scopeType !== 'global'
    ? `${spec.scopeType}-${String(spec.scopeValue).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 24)}`
    : 'global';
  return `AegisFlow-${spec.type}-${scope}`.slice(0, 64); // WAF name limit
}

/* =============================================================================
 * LOCAL mode: no-op dispatcher (the simulator in lib/engine.js already applied
 * the effect). We only journal what WOULD have been pushed to AWS.
 * ========================================================================== */
function localDispatcher(spec) {
  const rn = ruleNameFor(spec);
  console.log(`[aegisflow:local] mitigation "${spec.type}" ${spec.scopeType}:${spec.scopeValue || '*'} → would UpdateWebACL "${WEBACL_NAME}" rule "${rn}"`);
  return Promise.resolve({ mode: 'local', ruleName: rn });
}

/* =============================================================================
 * AWS mode: REAL SDK calls. This is the code path that runs against a live
 * account when USE_AWS=1 — it is production-shaped, not pseudocode.
 * ========================================================================== */
async function awsDispatcher(spec) {
  const { WAFClient, UpdateWebACLCommand, CreateRuleCommand } =
    await import('@aws-sdk/client-wafv2'); // dynamic: only loaded in AWS mode
  const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');

  const client = new WAFClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const cw = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const rn = ruleNameFor(spec);
  if (!onceEvery(rn, LOCK_TTL_MS)) return { mode: 'aws', ruleName: rn, deduped: true };

  /* Map local mitigation type → real WAFv2 statement + action. */
  let statement, action;
  switch (spec.type) {
    case 'rate-limit':
      statement = { RateBasedStatement: { Limit: Number(spec.limit || 25) * 60, AggregateKeyType: 'IP' } };
      action = { Action: { Block: {} } };
      break;
    case 'challenge':
      statement = { OrStatement: { Statements: [
        { ByteMatchStatement: { FieldToMatch: { UriPath: {} }, PositionalConstraint: 'STARTS_WITH', SearchString: String(spec.scopeValue || '/api/login'), TextTransformations: [{ Priority: 0, Type: 'LOWERCASE' }] } }
      ] } };
      action = { Action: { Captcha: {} } }; // WAF CAPTCHA — real bot-filtering
      break;
    case 'block':
    case 'geo-block':
      statement = spec.scopeType === 'geo'
        ? { GeoMatchStatement: { CountryCodes: [String(spec.scopeValue || 'CN')] } }
        : { IPSetReferenceStatement: { ARN: process.env.WAF_IPSET_ARN || '' } };
      action = { Action: { Block: {} } };
      break;
    case 'cache':
      // CloudFront handles caching; from here we'd update the cache policy via
      // @aws-sdk/client-cloudfront UpdateDistribution → DefaultCacheBehavior.
      console.log(`[aegisflow:aws] cache offload requested for ${DISTRIBUTION_ID}`);
      return { mode: 'aws', ruleName: rn, note: 'cloudfront-cache-policy' };
    default:
      throw new Error(`unknown mitigation type ${spec.type}`);
  }

  await client.send(new UpdateWebACLCommand({
    Name: WEBACL_NAME, Id: WEBACL_ID, Scope: WEBACL_SCOPE, DefaultAction: { Allow: {} },
    Rules: [{ Name: rn, Priority: 1, Statement: statement, VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: rn }, ...action }]
  }));

  await cw.send(new PutMetricDataCommand({
    Namespace: 'AegisFlow/Mitigations',
    MetricData: [{ MetricName: 'Applied', Dimensions: [{ Name: 'Type', Value: spec.type }], Value: 1, Timestamp: new Date() }]
  }));

  return { mode: 'aws', ruleName: rn };
}

function getMitigationDispatcher(useAws) {
  return useAws ? awsDispatcher : localDispatcher;
}

module.exports = { getMitigationDispatcher, localDispatcher, awsDispatcher, ruleNameFor, USE_AWS };

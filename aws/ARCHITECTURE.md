# AegisFlow — AWS Architecture & Local→AWS Mapping

Real event: AWS x A10 Hack 2026 — "Scale with AWS. Shield with A10. Secure Your Future."

## Edge stack (aws/template.yaml, SAM)

```
                attacker bots                         legit users
                     └───────┬────────────────────────────┘
                             ▼
        ┌──────────────── CloudFront (EdgeCDN) ────────────────┐
        │  Shield Advanced (L3/L4 volumetric absorb)           │
        │  WAFv2 WebACL "aegisflow-edge":                      │
        │   1. rate-limit  RateBasedStatement 1500/5min/IP     │
        │   2. challenge   ByteMatch /api/login → CAPTCHA      │
        │   3. block       IPSetReference (dispatcher-fed)     │
        │   4. managed     AWSManagedRulesCommonRuleSet        │
        └───────────────────────┬──────────────────────────────┘
                                ▼
                        S3 origin (private, OAI)
                                │
              CloudWatch metrics + alarm → SNS (AegisFlow/Mitigations)
```

## Console playbook → real AWS API mapping

The console (`lib/aws-adapter.js`) dispatches the exact specs you click to real WAFv2 SDK v3
calls when `USE_AWS=1` — production-shaped code, auditable without credentials:

| Console playbook (local run) | AWS API call (USE_AWS=1) | IaC evidence (aws/template.yaml) |
|---|---|---|
| `rate-limit` (path/IP, limit N) | `UpdateWebACL` → `RateBasedStatement{Limit: N*60, AggregateKeyType: IP}` | `aegisflow-rate-limit` rule |
| `challenge` (path) | `UpdateWebACL` → ByteMatch on UriPath + `Captcha` action | `aegisflow-challenge-login` rule |
| `block` (IP) | `UpdateIPSet` on `WAF_IPSET_ARN` + `IPSetReferenceStatement` | `aegisflow-block-list` rule + `AttackerIPSet` |
| `block` (geo) | `UpdateWebACL` → `GeoMatchStatement{CountryCodes}` | (add rule via same dispatcher) |
| `cache` | CloudFront cache policy update (`UpdateDistribution`) | CloudFront `DefaultCacheBehavior` + managed CachingOptimized |
| KPI stream | `PutMetricData` (Namespace `AegisFlow/Mitigations`) + alarms | `AnomalyAlarm` + SNS |

Every applied mitigation is also deduplicated (TTL lock) and logged — mirroring the console's
audit trail.

## `USE_AWS=1` switch design

`server.js` picks the dispatcher at boot: `localDispatcher` (logs the exact rule it *would*
push, with the same `ruleNameFor()` naming) or `awsDispatcher` (real SDK calls above). The
dashboard, engine and playbook semantics are identical — only the enforcement point changes
from the local simulator to the WAFv2 WebACL in `aws/template.yaml`.

## Why these services (judging: "Use of AWS Tech")

- **Shield Advanced + CloudFront** = the "Shield" in the brief: volumetric floods die at the
  edge; the `volumetric` scenario exists precisely to show that layer.
- **WAFv2 rate-based + CAPTCHA + IPSet** = the three L7 playbooks, mapped 1:1 from console to
  edge — no bespoke proxying, native AWS primitives.
- **CloudWatch custom metrics + alarm + SNS** = the console's KPI stream is the same telemetry
  you'd page on in production.

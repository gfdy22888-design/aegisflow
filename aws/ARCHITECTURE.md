# AegisFlow — local prototype and AWS integration

**Demo status:** all video traffic and performance measurements are synthetic.
The local detector, playbooks and autopilot run now. AWS SDK requests are covered
by offline contract tests; no AWS account deployment or enforcement is claimed.

## Reference edge stack

```
Clients → CloudFront → WAFv2 WebACL → private S3 static origin (OAI)
                         │
              CloudWatch Applied metric → alarm → SNS

Node console (separate host) → manual AWS adapter → WAFv2 / CloudWatch
```

`aws/template.yaml` describes CloudFront, WAFv2, an IPv4 IP set, private S3 with
its origin access policy, and an alarm. Deploy it in `us-east-1` for CloudFront
WAF scope. It is an un-deployed reference template. It does not host the Node
server or connect a live traffic collector. Shield Advanced and Lambda@Edge are
future integration options; neither is provisioned here.

## Console playbook → AWS implementation

| Local playbook | Adapter implementation | Status |
|---|---|---|
| Rate-limit, path/global | GetWebACL → UpdateWebACL; RateBasedStatement, explicit 60-second window, path scope-down when supplied | Implemented, offline-tested |
| Challenge, path | Exact UriPath ByteMatchStatement + Captcha action | Implemented, offline-tested |
| Block, explicit IPv4 | GetIPSet → UpdateIPSet, preserving addresses; IPSetReferenceStatement in WebACL | Implemented, offline-tested |
| Block, country code | GeoMatchStatement + Block | Implemented, offline-tested |
| Cache | CloudFront managed cache policy in reference template | Runtime cache changes not implemented |
| Mitigation counter | PutMetricData, AegisFlow/Mitigations / Applied | Implemented; dimensionless series matches alarm |
| Autopilot, remove, clear | Local engine only | Rejected in AWS mode; cloud lifecycle sync is future work |

Each WebACL update reads the current configuration and LockToken, retains existing
rules, assigns an unused priority and appends/replaces its named rule. Requests
are serialized within this process. Successful additions deduplicate for five
minutes; failed updates remain retryable. Cross-process optimistic-lock retries
are not implemented. Use a dedicated demo WebACL.

WAF rate enforcement uses a rolling time window. A local 30-rps cap maps to an
1800-request / 60-second threshold, **not** an exact 30-rps guarantee on AWS.
Synthetic source kinds and ASN labels have no AWS enforcement mapping here.

## Optional AWS mode setup

The normal demo needs no credentials, no installation and no network calls.
To evaluate the optional adapter separately, install:

```sh
npm install --no-save @aws-sdk/client-wafv2 @aws-sdk/client-cloudwatch
```

Supply standard AWS credentials with least-privilege WAF/CloudWatch permissions
and set `USE_AWS=1`, `WAF_WEBACL_ID`, `WAF_WEBACL_NAME`, `WAF_SCOPE=CLOUDFRONT`.
For IP blocks also set `WAF_IPSET_ARN`, `WAF_IPSET_ID`, `WAF_IPSET_NAME` from the
template outputs. The adapter selects `us-east-1` for CloudFront scope.

Only manual supported additions are sent to AWS. The API reports dispatch errors
and disables autopilot, remove and clear in AWS mode. Remove remote rules through
AWS and restart the local process when finished. Local observations remain
simulated, including latency and offload; the console has no live AWS telemetry.

## Primary API references

- [UpdateWebACL: read, modify, replace and LockToken](https://docs.aws.amazon.com/waf/latest/APIReference/API_UpdateWebACL.html)
- [RateBasedStatement: windows and scope-down statements](https://docs.aws.amazon.com/waf/latest/APIReference/API_RateBasedStatement.html)
- [UpdateIPSet](https://docs.aws.amazon.com/waf/latest/APIReference/API_UpdateIPSet.html)

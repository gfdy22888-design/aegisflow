# TEAM ALPHA — AegisFlow

**Pitch:** The DDoS decision loop: detect → classify → recommend → mitigate → verify.
**Stack:** Node stdlib, shared JavaScript engine, SSE, Canvas; optional AWS SDK v3.
**Run:** `node server.js` → http://localhost:8080; tests: `npm test`.
**Demo:** https://gfdy22888-design.github.io/aegisflow/
**Repo:** https://github.com/gfdy22888-design/aegisflow

**Works locally:** five scenarios, EWMA/entropy/signature classification, response
playbooks, autonomous mitigation, source controls, audit trail and browser demo.
**Simulated:** all traffic, p95 latency, origin load, offload and source metadata.
**AWS prototype:** supported manual WAFv2 additions, IPSet updates, CloudWatch
counter; offline request-contract tests, no live-account validation.
**Reference template:** CloudFront + WAFv2 + private S3 + CloudWatch alarm + SNS.
**Future work:** cloud autopilot/removal, runtime cache updates, Shield Advanced,
live telemetry, authentication and durable storage.

**Evidence:** `aws/ARCHITECTURE.md`, `aws/template.yaml`, `lib/aws-adapter.js`,
`test/`, `docs/demo/aegisflow-demo.mp4`, `docs/demo/verification/`, `docs/screenshots/`.
**Human handoff:** `docs/DEVPOST-READY.md`; final Devpost entry is user-submitted.

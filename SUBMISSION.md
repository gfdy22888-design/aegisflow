# AegisFlow — Devpost Submission (AWS x A10 Hack 2026)

## Title
AegisFlow — the DDoS decision loop: detect, classify, mitigate, verify

## Pitch (57 words)
When an L7 flood hits, dashboards show graphs — not decisions. AegisFlow closes the loop:
a multi-signal engine (EWMA residual, source/path entropy, error ratio, hold-time) classifies
HTTP floods, slowloris, credential stuffing and *benign spikes* in one-second ticks, recommends
the playbook, applies rate-limit/challenge/block/cache rules, and shows origin load collapse
in real time — deployable 1:1 to CloudFront + WAF + Shield.

## Inspiration
Incident responders don't lack telemetry, they lack a decision loop. We wanted a console that
answers "what is this, what do I click, did it work?" — and that tells you when NOT to act
(false positives cost real customers too).

## What it does
A traffic simulator (human baseline + 5 injectable scenarios) feeds a detection engine that
scores anomalies 0–100 and classifies them with entropy analysis. Every class maps to a
playbook; applying one immediately changes raw-rps vs origin-rps, dropped counters and p95.
Autopilot applies the recommended playbook at score ≥ 70 — and deliberately does NOT trigger
on the benign flash-crowd scenario.

## How we built it
Pure Node stdlib server with SSE realtime (zero dependencies), a UMD detection engine shared
between Node and browser, canvas ops-console UI. The mitigation dispatcher has two
implementations behind one interface: local simulator, and production-shaped AWS SDK v3 calls
(UpdateWebACL with RateBasedStatement/CAPTCHA/GeoMatch, UpdateIPSet, PutMetricData) selected
by USE_AWS=1. A deployable SAM stack (CloudFront + WAFv2 + IPSet + alarms) mirrors every
playbook as a real edge rule.

## Challenges we ran into
Keeping the EWMA baseline honest during sustained attacks (an attack becomes the new normal
if you adapt too fast) — solved with slow variance adaptation plus entropy signals that stay
discriminative under floods. Designing playbooks that map cleanly onto WAFv2 primitives
instead of inventing our own enforcement.

## Accomplishments we're proud of
The benign-spike scenario: a demo where the correct behavior is *restraint*. And a mitigation
whose effect is measurable on screen: 1,797 raw rps → 526 origin rps the second you click.

## What we learned
WAFv2's statement grammar maps almost perfectly onto incident-response playbooks; entropy is
the cheapest robust attack feature; and an ops tool earns trust by logging every action.

## What's next
Lambda@Edge per-request scoring, ASN/geo reputation feeds, SOAR webhooks, and a live account
mode where the simulator is replaced by CloudFront access logs in Kinesis.

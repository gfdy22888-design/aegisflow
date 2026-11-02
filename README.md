# AegisFlow — the DDoS decision loop

An adaptive traffic-anomaly detection and response prototype: **detect → classify
→ recommend → mitigate → verify**. A diverse flash crowd stays unblocked, even
with automatic response armed.

[Interactive demo and narrated video](https://gfdy22888-design.github.io/aegisflow/)
· [Launch simulation](https://gfdy22888-design.github.io/aegisflow/live.html)
· [Submission text](SUBMISSION.md)

All traffic, latency and offload figures are **synthetic**. The local app works
without credentials or external services. AWS integration is an offline-tested
prototype; no AWS deployment, cloud benchmark or production protection is claimed.

## Run locally

Requires Node.js 18 or newer. No npm dependencies or installation are needed.

```sh
node server.js
# Open http://localhost:8080
npm test
```

1. Start **HTTP Flood (L7)** in Attack Simulator and watch the source concentration
   and rate deviation trigger classification.
2. Stop the attack, arm **AUTO-MITIGATE**, and launch another HTTP flood. The
   recommended path rate limit applies automatically after three hot ticks.
3. Compare **Edge rps** (raw ingress), **Origin rps**, and **Mitigated/s**. Attacking
   sources are capped at 30 rps in the simulation, and the action is audited.
4. Stop all scenarios and clear mitigations. Start **Flash Crowd** while automatic
   response remains armed: source entropy rises, the engine recommends caching,
   and no automatic mitigation is applied.

The [hosted interactive demo](https://gfdy22888-design.github.io/aegisflow/live.html)
runs the same engine in your browser. `demo/index.html` is a self-contained replay
of a current-engine simulated incident and also opens directly from disk.

## Why it exists

Responders need to decide what a traffic surge means, which response fits it and
whether that response helped. AegisFlow puts the signals, classification,
recommended action and visible effect on one screen. It also demonstrates the
cost of treating every spike as an attack: legitimate customers can be blocked.

## Features

- Five scenarios: HTTP flood, volumetric signature, slowloris signature, credential
  stuffing, and benign flash crowd. These generate traffic records, not network attacks.
- Adaptive EWMA rate baseline, Shannon source/path entropy, error ratio and
  connection-hold signals, combined with a rule-based signature classifier.
- Rate-limit, challenge, block, geo-block and cache simulation with visible offload.
- Local autopilot: three consecutive ticks with score ≥70, or a classified attack
  with confidence ≥0.6 and score ≥45. Benign crowds stay unblocked in this demo.
- One-second SSE updates, source actions, alerts and an audit trail.
- English narrated 1080p video, subtitles, screenshots and a project thumbnail.

## Architecture

```text
Browser console ← SSE / JSON → Node stdlib server
                                  ├─ shared simulation + detection engine
                                  ├─ local mitigation + autopilot
                                  └─ optional manual AWS adapter
                                       ├─ WAFv2 Get/UpdateWebACL + IPSet
                                       └─ CloudWatch PutMetricData

GitHub Pages → same engine in-browser + replay + narrated MP4
Reference AWS stack → CloudFront + WAFv2 + private S3 + CloudWatch alarm/SNS
```

## AWS technology and evidence

| Service | Role and implementation status |
|---|---|
| WAFv2 | Optional manual path/global rate-limit, path CAPTCHA, explicit IPv4 and country blocking; SDK request behavior tested offline |
| CloudFront + S3 | Un-deployed SAM reference stack, private origin and OAI access policy; Node backend hosting remains separate |
| CloudWatch + SNS | Adapter mitigation counter and matching alarm in reference template |
| Shield Advanced / Lambda@Edge | Future integration options; not provisioned or called |

The adapter reads a WebACL and its LockToken, retains existing rules, serializes
updates within the process and deduplicates successful additions. WAF uses a
rolling 60-second rate window, which is not equivalent to the simulator's exact
per-second cap. See [AWS architecture and setup](aws/ARCHITECTURE.md).

`USE_AWS=1` requires separately installed AWS SDK clients, credentials and resource
IDs. It supports explicit manual additions only. Unsupported actions return an
error; autopilot, clear and remove are disabled in AWS mode. This prototype should
only be evaluated with dedicated demo resources. No cloud calls were made for the video.

## Validation and limitations

`npm test` covers detection, sustained attacks, benign autopilot restraint,
rate/offload accounting, scenario discovery, AWS request contracts and server
startup/malformed URLs. CI runs on Node 18, 20 and 22.

- Statistical adaptation and rule-based classification; no LLM or trained neural model.
- Randomized single-process simulation; simulated p95 is not a measured latency percentile.
- No real traffic collector, authentication, persistent audit store or production scaling.
- Synthetic geo/ASN/kind metadata is not live reputation data.
- Cloud lifecycle sync, cross-process update retries and live-account validation remain future work.

## Submission assets

- [Narrated demo](docs/demo/aegisflow-demo.mp4) · [English subtitles](docs/demo/aegisflow-demo.en.srt)
- [Screenshots](docs/screenshots/) · [Logo](docs/logo.png)
- [Submission text](SUBMISSION.md) · [Final handoff](docs/DEVPOST-READY.md)
- [Video verification](docs/demo/verification/recording-report.json)

AI tools assisted implementation and documentation. Demo narration is synthetic
(Microsoft Zira); displayed data comes from the running local engine.

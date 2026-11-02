# AegisFlow — Devpost copy-ready fields

## Project name
AegisFlow

## Elevator pitch
Turn a traffic surge into a response decision. AegisFlow combines adaptive rate baselines, entropy and signature analysis to classify attacks, recommend playbooks, apply local mitigation and show origin recovery. A benign flash crowd stays unblocked. Explore the interactive simulation, narrated demo and an offline-tested AWS integration prototype.

## Inspiration
Security dashboards tell responders that traffic changed. We wanted a console that
also answers: what is happening, which response fits, and did it help? Just as
important, legitimate popularity should not be mistaken for an attack.

## What it does
AegisFlow connects five injectable traffic scenarios to an adaptive detector,
signature classifier, recommended response, mitigation engine and audit trail.
Operators can compare raw ingress, origin load and traffic offloaded at the edge.
Automatic response confirms the classification before applying a playbook. A diverse
flash crowd receives a caching recommendation and stays unblocked while automatic
response remains armed.

All demo traffic and performance figures are synthetic. The browser demo runs the
same engine as the Node console, without accounts, credentials or external APIs.

## How we built it
We used JavaScript, Node.js standard libraries, Server-Sent Events, Canvas, an EWMA
rate baseline, Shannon entropy and a rule-based classifier. The local application
has no npm dependencies.

The repository also contains an optional AWS SDK v3 integration prototype for
supported manual WAFv2 rule additions and CloudWatch mitigation counters. It reads
and preserves existing WebACL rules, supplies optimistic-lock tokens, and tests
request behavior with fake SDK clients. An un-deployed SAM reference template maps
the design to CloudFront, WAFv2, private S3 and CloudWatch/SNS. We did not deploy or
benchmark a live AWS account. Cloud autopilot and runtime cache changes remain
future work.

## Challenges we ran into
A sustained attack can become the new EWMA baseline if adaptation continues during
an incident. We freeze baseline learning under active attacks or mitigation and
test that scores remain elevated. A single-vector flood can also stay below a
weighted score threshold, so local autopilot considers a confirmed attack class
alongside its score. We added regression tests for sustained benign crowds and
corrected ingress/origin/offload accounting so the visible response can be checked.

## Accomplishments we're proud of
The full local response loop is visible and interactive. Attack sources reach a
30-rps cap after automatic path rate limiting, while ingress and origin are shown
separately. The benign crowd demonstrates restraint: high source diversity, a cache
recommendation and zero blocking. The submission includes an English narrated
1080p demo, captions, screenshots, a hosted browser simulation and automated tests.

## What we learned
Rate alone is insufficient for deciding whether a surge is malicious. Source
diversity, target concentration and connection behavior provide useful context.
Mapping simulator controls to WAF also exposes important differences: a rolling
rate window is not an exact per-second cap, updates require concurrency tokens,
and synthetic source labels have no direct enforcement equivalent.

## What's next
Validate the adapter in a dedicated AWS account, synchronize cloud rule removal
and expiry, ingest real telemetry, add authentication and durable audit storage,
and evaluate the detector against labeled traffic. Add cloud autopilot only after
enforcement and rollback behavior have been validated.

## Built with
JavaScript, Node.js, HTML, CSS, Canvas, Server-Sent Events, AWS SDK for JavaScript v3,
AWS WAFv2, Amazon CloudFront, Amazon S3, Amazon CloudWatch, Amazon SNS, AWS SAM.
AWS services are integration targets represented by code and IaC; live deployment
is not claimed. Detection uses adaptive statistics and rules, not a generative model.

## Links
- Repository: https://github.com/gfdy22888-design/aegisflow
- Try it out / narrated video: https://gfdy22888-design.github.io/aegisflow/
- Interactive simulation: https://gfdy22888-design.github.io/aegisflow/live.html
- Direct MP4: https://gfdy22888-design.github.io/aegisflow/docs/demo/aegisflow-demo.mp4

## AI assistance disclosure
AI tools assisted code, documentation and review. English narration is generated
with Microsoft Zira. The screenshots and video show synthetic data from the
working local engine. No production traffic, measured cloud results, or live AWS
deployment are represented.

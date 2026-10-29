# TEAM ALPHA — AegisFlow (Shield Ops Console)

**Pitch:** AI-driven DDoS decision loop — EWMA + Shannon-entropy detection classifies HTTP flood / volumetric / slowloris / credential-stuffing / benign-spike in 1s ticks, recommends the playbook, applies rate-limit/challenge/block/cache and shows origin load collapse live (1797→526 rps measured).

**Stack:** Pure Node stdlib + SSE realtime (zero npm deps), UMD engine shared Node/browser, canvas ops console; AWS SDK v3 dispatcher (WAFv2 UpdateWebACL/RateBasedStatement/CAPTCHA/IPSet, CloudWatch metrics); SAM stack: CloudFront+WAFv2+Shield+alarms.

**Run:** `node server.js` → http://localhost:8080 — start `http-flood`, watch score pass 70, apply playbook or hit Autopilot. Offline demo: open `demo/index.html`.

**Works vs mocked:**
- REAL: simulator (5 scenarios incl. benign-spike anti-false-positive), full detection/classification math, playbook engine with measured origin-offload, autopilot, SSE dashboard, WAFv2 payload builders (lib/aws-adapter.js, auditable without creds).
- MOCKED: the network itself (synthetic traffic). USE_AWS=1 pushes the same playbook specs to real WAFv2.

**AWS mapping:** rate-limit→WAFv2 RateBasedStatement · challenge→Captcha action · block→IPSet/GeoMatch · cache→CloudFront cache policy · KPIs→CloudWatch custom metrics+alarm→SNS · volumetric layer→Shield Advanced.

**Evidence:** aws/template.yaml · aws/ARCHITECTURE.md (playbook→API table) · lib/aws-adapter.js (SDK v3, production-shaped) · demo/index.html (real recorded incident).

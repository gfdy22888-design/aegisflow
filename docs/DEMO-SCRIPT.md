# AegisFlow — Demo Video Script (2–3 min)

Every number below is from a verified live run. Record at 1440×900, `node server.js` → localhost:8080.

## 0:00 — Problem (one slide or talking over baseline)
"Security dashboards show you graphs. When a flood hits, you need decisions: what is this,
what do I click, did it work? AegisFlow is that decision loop."

## 0:25 — Baseline (screenshot 01)
Point at: score 0 · Normal traffic · entropy ~5.7 · p95 ~38 ms · "no alerts — baseline calm".

## 0:45 — Launch the attack
Attack Simulator → **HTTP Flood (L7)**. Watch:
- Edge/origin rps climb past **1.5k** (6 botnet IPs hammering /api/search)
- Anomaly score spikes into the red; alert: `Detected: HTTP Flood (L7) — score=56 conf=1.0`
  with the signal breakdown (rate=1, entDrop=1)

## 1:15 — The AI responds (screenshot 03)
Arm **AUTO-MITIGATE (AI RESPONSE)** before launching (or click the recommended playbook).
The engine confirms the class for 3 s and applies **Path · Rate-Limit** on its own:
- Top sources: every attacker **capped at 30 rps**, mitigated counters ▼ climbing
- **MITIGATED/S ≈ 1.1k** — the yellow "mitigated at edge" band swallows the flood
- Origin rps collapses to ~500; p95 recovers to ~41 ms
- Audit trail logs every action (`AUTO · Rate-Limit applied`)

## 1:55 — The trust moment (screenshot 04)
Attack Simulator → **Flash Crowd (benign spike)** with autopilot still ARMED:
- 2.6k rps "flood" that is actually 478 legit customers (entropy 8.8 — many sources)
- Gauge: `Benign flash crowd · 85% — Recommended: Serve from edge cache — do NOT block`
- **MITIGATED/S stays 0** — nobody gets blocked. "An ops tool earns trust by knowing when NOT to act."

## 2:25 — The AWS story (screen-share `aws/`)
- `lib/aws-adapter.js`: the same playbook specs → real WAFv2 SDK v3 calls
  (RateBasedStatement, CAPTCHA action, IPSet, PutMetricData) when `USE_AWS=1`
- `aws/template.yaml`: deployable CloudFront + WAFv2 + IPSet + alarms stack
- One sentence: "The console you just watched is the control plane of this edge stack."

## 2:45 — Close
"Detect, classify, recommend, mitigate, verify — in one-second ticks, zero dependencies,
`node server.js` and it runs. Tests: `npm test`."

## Recording notes
- Screenshots in `docs/screenshots/` can substitute any live segment if a take goes wrong.
- If a scenario is mid-flight when you need a clean take: Attack Simulator → Stop all,
  Mitigation Playbook → clear, wait ~5 s for the baseline to calm.

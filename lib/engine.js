/* =============================================================================
 * AegisFlow — Traffic Simulation + AI Anomaly Detection + Mitigation Engine
 * -----------------------------------------------------------------------------
 * Pure JavaScript (no dependencies). UMD: works in Node (module.exports) and
 * in the browser (window.AegisEngine). Shared by server.js and demo/index.html.
 *
 * Detection ensemble (the "AI" layer — statistical learning, no labels needed):
 *   1. EWMA baseline        — exponentially-weighted mean/variance of req rate;
 *                             z-score flags deviations from learned normal.
 *   2. Shannon entropy      — information-theoretic concentration of source
 *                             IPs / paths. Floods collapse entropy.
 *   3. Rate heuristics      — absolute rps floors, error-ratio (401/404) spike,
 *                             connection-hold anomaly (slowloris signature).
 *   4. Signature classifier — fuzzy rule match over the signal vector to label
 *                             the attack class + confidence, and emit a mapped
 *                             mitigation playbook recommendation.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.AegisEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ----------------------------- utilities ------------------------------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const round2 = (v) => Math.round(v * 100) / 100;

  function shannon(counts) {
    // counts: array of positive frequencies. Returns H in bits (log2).
    let total = 0;
    for (const c of counts) total += c;
    if (total <= 0) return 0;
    let h = 0;
    for (const c of counts) {
      if (c <= 0) continue;
      const p = c / total;
      h -= p * Math.log2(p);
    }
    return h;
  }

  const GEOS = ['US', 'DE', 'GB', 'NL', 'FR', 'BR', 'IN', 'JP', 'KR', 'SG', 'AU', 'CA'];
  const ATTACK_GEOS = ['CN', 'RU', 'VN', 'NL', 'US', 'BR', 'IN'];
  const ASNS = {
    legit: ['AS15169 Google', 'AS8075 Microsoft', 'AS6805 Telekom DE', 'AS3320 DT AG',
            'AS2856 BT UK', 'AS4134 Chinanet', 'AS55836 Reliance Jio', 'AS28573 Claro BR'],
    bot:   ['AS4134 Chinanet', 'AS4837 China Unicom', 'AS12389 Rostelecom', 'AS45899 VNPT',
            'AS9009 M247', 'AS14061 DigitalOcean', 'AS16509 Amazon', 'AS396982 Google Cloud']
  };

  function mkIp(kind) {
    if (kind === 'attacker') {
      // attackers cluster in a few suspicious /16s
      const hot = pick(['45.155', '185.220', '194.26', '5.188', '91.219', '23.129']);
      return `${hot}.${randInt(1, 254)}.${randInt(1, 254)}`;
    }
    return `${randInt(2, 222)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  }

  const HUMAN_PATHS = ['/api/products', '/', '/api/cart', '/api/search?q=shoes', '/api/reviews',
                       '/api/user/me', '/checkout', '/api/products/42', '/api/recommend'];
  const CRAWLER_PATHS = ['/sitemap.xml', '/robots.txt', '/products/page-12', '/products/page-13'];

  /* --------------------------- client factories --------------------------- */
  let CLIENT_SEQ = 1;
  function mkClient(kind, rps, geo) {
    const c = {
      id: CLIENT_SEQ++,
      kind,                                     // human | mobile | crawler | attacker | cred
      ip: mkIp(kind === 'attacker' || kind === 'cred' ? 'attacker' : 'legit'),
      asn: kind === 'human' || kind === 'mobile' ? pick(ASNS.legit) : pick(ASNS.bot),
      geo: geo || (kind === 'human' || kind === 'mobile' ? pick(GEOS) : pick(ATTACK_GEOS)),
      baseRps: rps,
      rps: rps,
      jitter: rand(0.7, 1.3),
      path: kind === 'crawler' ? pick(CRAWLER_PATHS) : pick(HUMAN_PATHS),
      hold: kind === 'human' ? rand(0.4, 2) : rand(0.1, 0.6) // connection hold seconds
    };
    return c;
  }

  /* ------------------------------ scenarios ------------------------------- */
  const SCENARIOS = {
    'http-flood': {
      label: 'HTTP Flood (L7)',
      detail: '6 botnets IPs hammering /api/search — WAF rate-based rule territory',
      spawn() {
        const out = [];
        for (let i = 0; i < 6; i++) {
          const c = mkClient('attacker', rand(170, 260));
          c.path = '/api/search?q=' + Math.random().toString(36).slice(2, 8);
          out.push(c);
        }
        return out;
      }
    },
    'volumetric': {
      label: 'Volumetric SYN Flood (L3/4)',
      detail: '3 spoofed sources, ~2,400 rps — Shield Advanced territory',
      spawn() {
        const out = [];
        for (let i = 0; i < 3; i++) out.push(mkClient('attacker', rand(700, 900)));
        return out;
      }
    },
    'slowloris': {
      label: 'Slowloris (slow read)',
      detail: '80 IPs, low rps but each holds connections open — origin exhaustion',
      spawn() {
        const out = [];
        for (let i = 0; i < 80; i++) {
          const c = mkClient('attacker', rand(0.8, 1.6));
          c.hold = rand(22, 40); // long-held sockets
          c.path = '/';
          out.push(c);
        }
        return out;
      }
    },
    'cred-stuff': {
      label: 'Credential Stuffing',
      detail: '200 distributed IPs on /login, 401 storm — WAF CAPTCHA territory',
      spawn() {
        const out = [];
        for (let i = 0; i < 200; i++) {
          const c = mkClient('cred', rand(0.5, 1.1));
          c.path = '/api/login';
          out.push(c);
        }
        return out;
      }
    },
    'flash-crowd': {
      label: 'Flash Crowd (benign spike)',
      detail: 'Legit viral traffic — the AI must NOT block this one',
      spawn() {
        const out = [];
        for (let i = 0; i < 420; i++) {
          const c = mkClient(chance(0.6) ? 'human' : 'mobile', rand(2, 7));
          out.push(c);
        }
        return out;
      }
    }
  };

  /* ------------------------- detection thresholds ------------------------- */
  const PLAYBOOKS = {
    'http-flood': {
      rec: 'rate-limit',
      aws: 'WAF Rate-Based Rule (AWS::WAFv2::Rule RateStatement)'
    },
    'volumetric': {
      rec: 'block',
      aws: 'Shield Advanced automatic application (AWS::Shield::Protection)'
    },
    'slowloris': {
      rec: 'block',
      aws: 'WAF rule + Lambda@Edge connection teardown'
    },
    'credential-stuffing': {
      rec: 'challenge',
      aws: 'WAF CAPTCHA / Challenge action (AWS::WAFv2::RuleAction)'
    },
    'benign-spike': {
      rec: 'cache',
      aws: 'CloudFront edge caching + origin shield (AWS::CloudFront)'
    }
  };

  const MIT_META = {
    'rate-limit': { label: 'Rate-Limit', aws: 'WAF Rate-Based Rule', icon: '⏱' },
    'challenge':  { label: 'Challenge (CAPTCHA)', aws: 'WAF CAPTCHA Action', icon: '🧩' },
    'block':      { label: 'Block', aws: 'Shield Advanced / WAF Deny', icon: '⛔' },
    'geo-block':  { label: 'Geo-Block', aws: 'WAF GeoMatch Statement', icon: '🌐' },
    'cache':      { label: 'Edge Cache', aws: 'CloudFront Cache Policy', icon: '⚡' }
  };

  /* ================================ ENGINE ================================ */
  function createEngine(opts) {
    opts = opts || {};
    const TICK_MS = opts.tickMs || 1000;

    const state = {
      tick: 0,
      startedAt: Date.now(),
      clients: [],
      scenarios: {},          // name -> { active, since, clients: [] }
      mitigations: [],        // active mitigation rules
      autoMitigate: false,
      alerts: [],
      logs: [],
      kpis: null,
      history: { t: [], legit: [], attack: [], mitigated: [], score: [], entropy: [] },
      _ewma: { mean: 250, var: 400, entMean: 3.9, errMean: 0.02, holdMean: 0.9 },
      _hotTicks: 0, _coolTicks: 0, _autoAppliedFor: null,
      _alertSeq: 1, _mitSeq: 1, _lastClass: null
    };

    /* --- seed baseline population ------------------------------------- */
    function seed() {
      state.clients = [];
      for (let i = 0; i < 42; i++) state.clients.push(mkClient('human', rand(2, 8)));
      for (let i = 0; i < 12; i++) state.clients.push(mkClient('mobile', rand(1.5, 6)));
      for (let i = 0; i < 4; i++) state.clients.push(mkClient('crawler', rand(4, 12)));
    }
    seed();

    function log(level, msg) {
      state.logs.unshift({ ts: Date.now(), level, msg });
      if (state.logs.length > 40) state.logs.pop();
    }
    function alert(severity, title, detail) {
      state.alerts.unshift({ id: state._alertSeq++, ts: Date.now(), severity, title, detail });
      if (state.alerts.length > 60) state.alerts.pop();
    }

    /* --- attack lifecycle ---------------------------------------------- */
    function startScenario(name) {
      if (!SCENARIOS[name] || state.scenarios[name]) return false;
      const clients = SCENARIOS[name].spawn();
      state.scenarios[name] = { active: true, since: Date.now(), clients };
      state.clients.push(...clients);
      alert('warn', `Scenario started: ${SCENARIOS[name].label}`, SCENARIOS[name].detail);
      log('warn', `Operator launched scenario "${name}" (+${clients.length} sources)`);
      state._hotTicks = 0; state._coolTicks = 0;
      return true;
    }
    function stopScenario(name) {
      const s = state.scenarios[name];
      if (!s) return false;
      const ids = new Set(s.clients.map(c => c.id));
      state.clients = state.clients.filter(c => !ids.has(c.id));
      delete state.scenarios[name];
      log('info', `Scenario "${name}" stopped`);
      return true;
    }
    function stopAllScenarios() {
      Object.keys(state.scenarios).forEach(stopScenario);
      alert('info', 'All attack scenarios stopped', 'Baseline traffic only.');
    }

    /* --- mitigations ---------------------------------------------------- */
    function applyMitigation(spec) {
      const meta = MIT_META[spec.type];
      if (!meta) return null;
      const m = {
        id: state._mitSeq++,
        type: spec.type,
        scopeType: spec.scopeType || 'global',     // ip | asn | geo | path | global
        scopeValue: spec.scopeValue || null,
        limit: spec.limit || 25,
        auto: !!spec.auto,
        appliedAt: Date.now(),
        dropped: 0
      };
      state.mitigations.push(m);
      const scopeTxt = m.scopeType === 'global' ? 'global scope' : `${m.scopeType}=${m.scopeValue}`;
      alert('info', `${m.auto ? 'AUTO · ' : ''}${meta.label} applied`, `${scopeTxt} → ${meta.aws}`);
      log(m.auto ? 'auto' : 'info', `${meta.label} applied to ${scopeTxt} [maps to: ${meta.aws}]`);
      return m.id;
    }
    function removeMitigation(id) {
      const before = state.mitigations.length;
      state.mitigations = state.mitigations.filter(m => m.id !== id);
      if (state.mitigations.length < before) log('info', `Mitigation #${id} removed by operator`);
      if (state._autoAppliedFor) state._autoAppliedFor = null;
    }
    function clearMitigations() {
      if (state.mitigations.length) log('info', 'All mitigations cleared');
      state.mitigations = [];
      state._autoAppliedFor = null;
    }
    function setAuto(v) {
      state.autoMitigate = !!v;
      log('auto', `Autonomous response ${v ? 'ARMED' : 'DISARMED'}`);
      alert(v ? 'info' : 'warn', `Auto-mitigation ${v ? 'ARMED' : 'DISARMED'}`,
            v ? 'Engine will execute playbook recommendations when anomaly score ≥ 70 for 3 consecutive seconds.'
               : 'Operator assumes manual mitigation control.');
    }

    /* --- traffic generation for one tick -------------------------------- */
    function diurnal(t) { return 1 + 0.18 * Math.sin((t / 600) * 2 * Math.PI); }

    function matchesScope(c, m) {
      if (m.scopeType === 'global') return true;
      if (m.scopeType === 'ip') return c.ip === m.scopeValue;
      if (m.scopeType === 'asn') return c.asn === m.scopeValue;
      if (m.scopeType === 'geo') return c.geo === m.scopeValue;
      if (m.scopeType === 'kind') return c.kind === m.scopeValue;
      if (m.scopeType === 'path') return c.path.startsWith(String(m.scopeValue).split('*')[0]);
      return false;
    }

    function computeTick() {
      const t = state.tick;
      const wave = diurnal(t);

      let legitRps = 0, attackRps = 0, mitigatedRps = 0, totalLat = 0, latN = 0;
      let holdSum = 0, holdW = 0;
      const ipCounts = {}, pathCounts = {}, geoCounts = {};
      let c401 = 0, c404 = 0, c403 = 0, c200 = 0;
      const perSource = new Map();

      for (const c of state.clients) {
        // organic churn: baseline clients drift
        let rps = c.baseRps * c.jitter * wave * rand(0.85, 1.15);
        if (c.kind === 'human' || c.kind === 'mobile') legitRps += rps;
        else attackRps += rps;

        const before = rps;

        // ---- run mitigation pipeline (edge enforcement) ----
        for (const m of state.mitigations) {
          if (!matchesScope(c, m)) continue;
          if (m.type === 'block' || m.type === 'geo-block') {
            m.dropped += rps; rps = 0; c403 += before; break;
          }
          if (m.type === 'rate-limit') {
            const excess = Math.max(0, rps - m.limit);
            if (excess > 0) { rps = m.limit; m.dropped += excess; c403 += excess; }
          }
          if (m.type === 'challenge') {
            const failP = (c.kind === 'attacker' || c.kind === 'cred') ? 0.97
                        : c.kind === 'crawler' ? 0.55 : 0.02;
            const droppedR = rps * failP;
            m.dropped += droppedR; rps -= droppedR; c403 += droppedR;
          }
          if (m.type === 'cache' && (c.kind === 'human' || c.kind === 'mobile')) {
            // CloudFront absorbs cacheable reads at the edge — origin offload
            const offload = rps * 0.7;
            m.dropped += offload; rps -= offload; // counts as "served at edge", not origin
          }
        }
        const dropped = before - rps;
        if (dropped > 0) mitigatedRps += dropped;
        if (rps <= 0.001) { perSource.set(c.id, { c, rps: 0, before }); continue; }

        // ---- accumulate metrics from surviving traffic ----
        ipCounts[c.ip] = (ipCounts[c.ip] || 0) + rps;
        pathCounts[c.path] = (pathCounts[c.path] || 0) + rps;
        geoCounts[c.geo] = (geoCounts[c.geo] || 0) + rps;

        if (c.kind === 'cred') { c401 += rps; }
        else if (c.kind === 'crawler') { const e = rps * 0.06; c404 += e; c200 += rps - e; }
        else { const e = rps * 0.015; c404 += e; c200 += rps - e; }

        const w = c.kind === 'attacker' ? 0.4 : 1; // humans dominate latency perception
        const lat = 38 + attackRps / 45 + (c.kind === 'human' || c.kind === 'mobile' ? state.mitigations.some(m => m.type === 'challenge' && matchesScope(c, m)) ? 120 : 0 : 0);
        totalLat += lat * rps * w; latN += rps * w;
        holdSum += c.hold * rps; holdW += rps;

        perSource.set(c.id, { c, rps, before });
      }

      const totalRps = legitRps + attackRps;
      const reaching = totalRps - mitigatedRps;
      const errRatio = reaching > 0 ? clamp01((c401 + c404) / reaching) : 0;
      const entIp = shannon(Object.values(ipCounts));
      const entPath = shannon(Object.values(pathCounts));
      const avgHold = holdW > 0 ? holdSum / holdW : 0;
      const p95 = latN > 0 ? clamp(totalLat / latN, 20, 4000) : 40;

      /* ================= DETECTION ENSEMBLE ================= */
      const E = state._ewma;
      const a = 0.08; // learning rate
      const z = (reaching - E.mean) / Math.sqrt(E.var + 25);

      const sig = {
        rate: clamp01(Math.max(z / 5, (reaching - 1800) / 2500)),
        conc: clamp01((E.entMean - entIp) / 1.1),           // entropy collapse
        pathConc: clamp01((2.6 - entPath) / 1.4),           // path concentration
        err: clamp01((errRatio - Math.max(0.06, E.errMean * 2)) / 0.30),
        conn: clamp01((avgHold - Math.max(1.6, E.holdMean * 2)) / 14)
      };

      const score = Math.round(clamp(100 * (
        0.40 * sig.rate +
        0.16 * sig.conc +
        0.09 * sig.pathConc +
        0.17 * sig.err +
        0.18 * sig.conn
      ), 0, 100));

      // learn baseline (robust: slow learning, skip while mitigating heavily)
      if (state.mitigations.length === 0) {
        E.mean += a * (reaching - E.mean);
        E.var += a * ((reaching - E.mean) ** 2 - E.var);
        E.entMean += a * (entIp - E.entMean);
        E.errMean += a * (errRatio - E.errMean);
        E.holdMean += a * (avgHold - E.holdMean);
      }

      /* ---------------- signature classifier ---------------- */
      let cls = { label: 'normal', confidence: 0.92, sig };
      if (sig.err > 0.45 && sig.pathConc > 0.5)
        cls = { label: 'credential-stuffing', confidence: round2(clamp01(0.55 + sig.err * 0.4)) };
      else if (sig.conn > 0.45)
        cls = { label: 'slowloris', confidence: round2(clamp01(0.5 + sig.conn * 0.45)) };
      else if (sig.conc > 0.42 && sig.rate > 0.35)
        cls = { label: 'volumetric', confidence: round2(clamp01(0.5 + (sig.conc + sig.rate) / 2 * 0.5)) };
      else if (sig.rate > 0.38 && sig.pathConc > 0.35)
        cls = { label: 'http-flood', confidence: round2(clamp01(0.5 + (sig.rate + sig.pathConc) / 2 * 0.5)) };
      else if (sig.rate > 0.5 && sig.conc < 0.22 && sig.err < 0.25 && sig.conn < 0.2)
        cls = { label: 'benign-spike', confidence: round2(clamp01(0.45 + sig.rate * 0.4)) };
      else if (score >= 40)
        cls = { label: 'anomalous', confidence: 0.5 };

      const severity = score >= 85 ? 'severe' : score >= 65 ? 'critical'
                     : score >= 40 ? 'warning' : 'normal';

      /* ---------------- alert transitions ---------------- */
      if (cls.label !== state._lastClass) {
        if (cls.label !== 'normal' && cls.label !== 'anomalous') {
          alert(score >= 65 ? 'critical' : 'warn',
            `Detected: ${SCENARIOS[cls.label] ? SCENARIOS[cls.label].label : cls.label}`,
            `score=${score} conf=${cls.confidence} · signals(rate=${round2(sig.rate)}, entDrop=${round2(sig.conc)}, err=${round2(sig.err)}, conn=${round2(sig.conn)})`);
        } else if (state._lastClass && state._lastClass !== 'normal' && state._lastClass !== 'anomalous') {
          alert('clear', 'Traffic returned to learned baseline',
            `anomaly class "${state._lastClass}" cleared · score=${score}`);
        }
        state._lastClass = cls.label;
      }
      if (state._lastSeverity !== severity && (severity === 'severe' || (severity === 'normal' && state._lastSeverity))) {
        if (severity === 'severe') alert('critical', 'SEVERE anomaly — origin at risk', `score=${score}`);
        state._lastSeverity = severity;
      } else { state._lastSeverity = severity; }

      /* ---------------- autonomous response ---------------- */
      const playbook = PLAYBOOKS[cls.label];
      if (state.autoMitigate && score >= 70) state._hotTicks++; else state._hotTicks = 0;
      if (state.autoMitigate && state._hotTicks >= 3 && playbook && state._autoAppliedFor !== cls.label) {
        if (cls.label === 'benign-spike') {
          applyMitigation({ type: 'cache', scopeType: 'global', auto: true });
          alert('auto', 'AUTO · benign spike protected, not blocked',
            'Classifier flagged flash crowd as legitimate — applied CloudFront edge caching instead of blocking.');
        } else if (cls.label === 'credential-stuffing') {
          applyMitigation({ type: 'challenge', scopeType: 'path', scopeValue: '/api/login', auto: true });
        } else if (cls.label === 'volumetric') {
          applyMitigation({ type: 'block', scopeType: 'kind', scopeValue: 'attacker', auto: true });
        } else if (cls.label === 'slowloris') {
          applyMitigation({ type: 'block', scopeType: 'kind', scopeValue: 'attacker', auto: true });
        } else if (cls.label === 'http-flood') {
          applyMitigation({ type: 'rate-limit', scopeType: 'path', scopeValue: '/api/search', limit: 30, auto: true });
        }
        state._autoAppliedFor = cls.label;
        state._hotTicks = 0;
      }
      // auto-heal: attack gone → lift auto rules
      if (score < 15) state._coolTicks++; else state._coolTicks = 0;
      if (state._autoAppliedFor && state._coolTicks >= 5) {
        const autos = state.mitigations.filter(m => m.auto);
        autos.forEach(m => log('auto', `Auto-heal: mitigation #${m.id} lifted (baseline restored)`));
        state.mitigations = state.mitigations.filter(m => !m.auto);
        state._autoAppliedFor = null;
        alert('clear', 'Auto-heal complete', 'All autonomous mitigations lifted — traffic back to baseline.');
      }

      /* ---------------- history + kpis ---------------- */
      state.history.t.push(t); state.history.legit.push(Math.round(legitRps));
      state.history.attack.push(Math.round(attackRps));
      state.history.mitigated.push(Math.round(mitigatedRps));
      state.history.score.push(score); state.history.entropy.push(round2(entIp));
      for (const k of ['t', 'legit', 'attack', 'mitigated', 'score', 'entropy'])
        if (state.history[k].length > 120) state.history[k].shift();

      // top sources by traffic (surviving + mitigated shown)
      const top = [...perSource.values()]
        .map(({ c, rps, before }) => ({
          ip: c.ip, asn: c.asn, geo: c.geo, kind: c.kind,
          rps: Math.round(rps * 10) / 10, mitigated: Math.round((before - rps) * 10) / 10,
          path: c.path, hold: round2(c.hold)
        }))
        .sort((x, y) => (y.rps + y.mitigated) - (x.rps + x.mitigated))
        .slice(0, 12);

      state.kpis = {
        tick: t, ts: Date.now(),
        rps: Math.round(reaching),
        rawRps: Math.round(totalRps),
        originRps: Math.round(reaching * (state.mitigations.some(m => m.type === 'cache') ? 0.35 : 1)),
        mitigatedRps: Math.round(mitigatedRps),
        legitRps: Math.round(legitRps),
        attackRps: Math.round(attackRps),
        uniqueIps: Object.keys(ipCounts).length,
        entropyIp: round2(entIp), entropyPath: round2(entPath),
        errRatio: round2(errRatio),
        avgHold: round2(avgHold),
        p95: Math.round(p95),
        statusCodes: { c200: Math.round(c200), c401: Math.round(c401), c404: Math.round(c404), c403: Math.round(c403) },
        score, severity, z: round2(z), signals: {
          rate: round2(sig.rate), conc: round2(sig.conc), pathConc: round2(sig.pathConc),
          err: round2(sig.err), conn: round2(sig.conn)
        },
        classification: {
          label: cls.label,
          labelHuman: cls.label === 'normal' ? 'Normal traffic'
            : cls.label === 'anomalous' ? 'Anomalous (unclassified)'
            : cls.label === 'benign-spike' ? 'Benign flash crowd'
            : (SCENARIOS[cls.label] ? SCENARIOS[cls.label].label : cls.label),
          confidence: cls.confidence,
          recommendation: playbook ? playbook.rec : 'monitor',
          awsMapping: playbook ? playbook.aws : 'CloudWatch anomaly detection'
        },
        topSources: top,
        uptimeSec: Math.round((Date.now() - state.startedAt) / 1000)
      };
      return state.kpis;
    }

    function snapshot() {
      return {
        tick: state.tick,
        autoMitigate: state.autoMitigate,
        scenarios: Object.keys(state.scenarios).map(n => ({
          name: n, label: SCENARIOS[n].label, since: state.scenarios[n].since
        })),
        mitigations: state.mitigations.map(m => ({
          ...m, meta: MIT_META[m.type],
          scopeTxt: m.scopeType === 'global' ? 'global' : `${m.scopeType}: ${m.scopeValue}`
        })),
        alerts: state.alerts.slice(0, 30),
        logs: state.logs.slice(0, 30),
        history: state.history,
        kpis: state.kpis
      };
    }

    function tick() {
      state.tick++;
      computeTick();
      return snapshot();
    }

    return {
      tick, snapshot, startScenario, stopScenario, stopAllScenarios,
      applyMitigation, removeMitigation, clearMitigations, setAuto,
      SCENARIOS: Object.keys(SCENARIOS).map(k => ({ name: k, label: SCENARIOS[k].label, detail: SCENARIOS[k].detail })),
      MIT_META
    };
  }

  return { createEngine, shannon, SCENARIOS, MIT_META, PLAYBOOKS };
});

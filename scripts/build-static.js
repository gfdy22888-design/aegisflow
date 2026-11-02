'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.argv[2] || '.delivery-work/site');
if (!out.startsWith(root + path.sep)) throw new Error('Output must stay inside the project');
fs.mkdirSync(out, { recursive: true });
for (const name of ['demo', 'lib', 'docs']) fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
fs.copyFileSync(path.join(root, 'README.md'), path.join(out, 'README.md'));
fs.copyFileSync(path.join(root, 'demo/index.html'), path.join(out, 'replay.html'));
let live = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
live = live.replace('<script>', '<script src="lib/engine.js"></script>\n<script>\nconst localEngine = AegisEngine.createEngine();\nfor(let i=0;i<60;i++) localEngine.tick();');
const apiStart = live.indexOf('async function api(path, body)');
const apiEnd = live.indexOf('function toggleAuto', apiStart);
live = live.slice(0, apiStart) + `async function api(path, body){
  if(path==='/api/scenario'){
    if(body.action==='stop-all') localEngine.stopAllScenarios();
    else if(body.action==='start') localEngine.startScenario(body.name);
    else if(body.action==='stop') localEngine.stopScenario(body.name);
  } else if(path==='/api/auto') localEngine.setAuto(body.enabled);
  else if(path==='/api/mitigation'){
    if(body.op==='clear') localEngine.clearMitigations();
    else if(body.op==='remove') localEngine.removeMitigation(body.id);
    else if(body.op==='add') localEngine.applyMitigation(body.spec);
  }
  snap=localEngine.snapshot(); renderAll();
}
` + live.slice(apiEnd);
const connectStart = live.indexOf('function connect()');
const connectEnd = live.indexOf('connect();', connectStart) + 'connect();'.length;
live = live.slice(0, connectStart) + `function connect(){
  const update=()=>{snap=localEngine.tick(); SCEN_LIST=snap.scenarioList;
    $('connDot').className='dot'; $('connTxt').textContent='LOCAL SIMULATION · tick '+snap.tick;
    $('autoToggle').checked=snap.autoMitigate; renderAll();};
  // Wait for the rest of the script (including SCEN_LIST) to initialize.
  setTimeout(update,0); setInterval(update,1000);
}
connect();` + live.slice(connectEnd);
live = live.replace(/fetch\('\/api\/state'\).*?\.catch\(\(\)=>\{\}\);/, 'SCEN_LIST = localEngine.snapshot().scenarioList;');
live = live.replace('SHIELD OPS CONSOLE · CLOUDFRONT + WAF + SHIELD ADVANCED + LAMBDA@EDGE', 'INTERACTIVE LOCAL SIMULATION · SYNTHETIC TRAFFIC · NO LIVE AWS CONNECTION');
fs.writeFileSync(path.join(out, 'live.html'), live);
const css = `*{box-sizing:border-box}body{margin:0;background:#080e18;color:#d8e4f2;font:17px/1.6 'Segoe UI',sans-serif}main{max-width:1120px;margin:auto;padding:60px 28px}.brand{display:flex;gap:20px;align-items:center}.brand img{width:90px;border-radius:18px}h1{font-size:48px;line-height:1.1;margin:0;color:#f1f6fd}.accent{color:#2dd4bf}.eyebrow{font-size:12px;letter-spacing:3px;color:#2dd4bf}.lead{font-size:22px;color:#9bb0c7;max-width:850px}a{color:#2dd4bf}nav{display:flex;flex-wrap:wrap;gap:14px;margin:30px 0}nav a{border:1px solid #345267;border-radius:10px;padding:12px 20px;text-decoration:none}.primary{background:#2dd4bf;color:#06131a}video{width:100%;background:#0d1725;border:1px solid #294254;border-radius:14px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin:30px 0}.card{padding:22px;background:#101a29;border:1px solid #243347;border-radius:12px}.card h2{font-size:18px;margin-top:0;color:#2dd4bf}.card p{font-size:15px;color:#9bb0c7}.note{font-size:14px;color:#8ca2b8}footer{border-top:1px solid #243347;margin-top:40px;padding-top:20px;font-size:14px;color:#8ca2b8}@media(max-width:700px){h1{font-size:36px}.grid{grid-template-columns:1fr}.brand img{width:70px}}`;
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AegisFlow — the DDoS decision loop</title><meta name="description" content="An interactive security-operations prototype: detect, classify, recommend, mitigate and verify with synthetic traffic."><link rel="icon" href="docs/logo.svg"><style>${css}</style><main>
<div class="brand"><img src="docs/logo.svg" alt="AegisFlow shield logo"><div><div class="eyebrow">SECURITY OPERATIONS PROTOTYPE</div><h1>Aegis<span class="accent">Flow</span></h1></div></div>
<p class="lead">When traffic surges, make the response decision visible. <span class="accent">Detect → classify → recommend → mitigate → verify.</span></p>
<nav><a class="primary" href="live.html">Launch interactive simulation</a><a href="replay.html">Replay an incident</a><a href="https://github.com/gfdy22888-design/aegisflow">Source &amp; setup</a></nav>
<video controls preload="metadata" poster="docs/screenshots/03-autopilot-mitigated.png"><source src="docs/demo/aegisflow-demo.mp4" type="video/mp4"><track kind="subtitles" src="docs/demo/aegisflow-demo.en.vtt" srclang="en" label="English" default>Your browser does not support embedded video. <a href="docs/demo/aegisflow-demo.mp4">Download the MP4</a>.</video>
<p class="note">English synthetic narration · English subtitles · <a href="docs/demo/aegisflow-demo.mp4">Download video</a> · <a href="docs/demo/aegisflow-demo.en.srt">Download subtitles</a></p>
<div class="grid"><article class="card"><h2>See the attack</h2><p>Five injectable scenarios meet an adaptive EWMA baseline, entropy analysis and a signature classifier.</p></article><article class="card"><h2>Measure the response</h2><p>Compare ingress, origin load and edge offload. Each mitigation appears in the audit trail.</p></article><article class="card"><h2>Know when to hold back</h2><p>A diverse flash crowd stays unblocked while automatic response remains armed.</p></article></div>
<footer>All traffic, latency and offload figures are simulated. The detector and local controls run in your browser. AWS SDK/IaC integration is a prototype with offline tests; no live AWS deployment is claimed. AegisFlow uses adaptive statistics and rules, without an LLM or external AI API.</footer></main></html>`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Built static demo in ${out}`);

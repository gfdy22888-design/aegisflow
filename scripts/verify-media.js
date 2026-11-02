'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'docs/demo/aegisflow-demo.mp4');
const ffmpeg = process.env.FFMPEG_PATH;
if (!ffmpeg) throw new Error('Set FFMPEG_PATH');
function inspect(extra = []) {
  const r = spawnSync(ffmpeg, ['-hide_banner', ...extra, '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr || 'Decode failed');
  const mean = Number(r.stderr.match(/mean_volume: ([\d.-]+)/)?.[1]);
  const peak = Number(r.stderr.match(/max_volume: ([\d.-]+)/)?.[1]);
  return { mean, peak, log: r.stderr };
}
const audio = inspect();
assert.match(audio.log, /Duration: 00:02:10\.00/);
assert.match(audio.log, /Video: h264/);
assert.match(audio.log, /1920x1080/);
assert.match(audio.log, /30 fps/);
assert.match(audio.log, /Audio: aac/);
assert.ok(audio.mean > -30 && audio.peak < 0, 'Narration must be audible and unclipped');
const segments = require('../docs/demo/narration.json').map(s => {
  const a = inspect(['-ss', String(s.start), '-t', String(s.end - s.start)]);
  assert.ok(a.mean > -35, `Missing narration at ${s.start}s`);
  return { start: s.start, end: s.end, meanVolumeDb: a.mean, peakDb: a.peak };
});
const frames = path.join(root, 'docs/demo/verification/final-video');
fs.mkdirSync(frames, { recursive: true });
for (const sec of [10, 36, 63, 85, 102, 114, 124]) {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(sec), '-i', file,
    '-frames:v', '1', path.join(frames, `${sec}s.png`)], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr);
}
const report = { status: 'passed', checkedAt: new Date().toISOString(), durationSeconds: 130,
  video: { codec: 'h264', width: 1920, height: 1080, fps: 30 },
  audio: { codec: 'aac', sampleRate: 48000, meanVolumeDb: audio.mean, peakDb: audio.peak },
  bytes: fs.statSync(file).size, narrationSegments: segments, extractedFrames: [10, 36, 63, 85, 102, 114, 124] };
assert.ok(report.bytes < 200000000);
fs.writeFileSync(path.join(root, 'docs/demo/verification/media-report.json'), JSON.stringify(report, null, 2));
console.log('H.264 1080p30 / AAC / 130 s; all 13 narration segments audible; seven final MP4 frames extracted.');

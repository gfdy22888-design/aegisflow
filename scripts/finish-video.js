'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ffmpeg = process.env.FFMPEG_PATH;
if (!ffmpeg) throw new Error('Set FFMPEG_PATH to ffmpeg with libx264');
const reportFile = path.join(root, 'docs/demo/verification/recording-report.json');
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
if (report.status !== 'passed') throw new Error('A verified recording is required');
const segments = require('../docs/demo/narration.json');
function wavDuration(file) {
  const b = fs.readFileSync(file);
  let rate, length;
  for (let p = 12; p + 8 <= b.length;) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(p + 16);
    if (id === 'data') length = size;
    p += 8 + size + size % 2;
  }
  return length / rate;
}
const narration = [];
const mixed = Buffer.alloc(130 * 48000 * 2);
segments.forEach((s, i) => {
  const file = path.join(root, `.delivery-work/audio/voice-${String(i).padStart(2, '0')}.wav`);
  const duration = wavDuration(file);
  const speed = Math.max(1, duration / (s.end - s.start - 0.15));
  if (speed > 1.3) throw new Error(`Narration ${i} is too long; shorten the text (${speed.toFixed(2)}x)`);
  const pcmFile = path.join(root, `.delivery-work/audio/processed-${i}.pcm`);
  const converted = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file,
    '-af', `atempo=${speed.toFixed(5)}`, '-ar', '48000', '-ac', '1', '-f', 's16le', pcmFile],
    { encoding: 'utf8', windowsHide: true });
  if (converted.status !== 0) throw new Error(converted.stderr || 'Voice conversion failed');
  const pcm = fs.readFileSync(pcmFile);
  pcm.copy(mixed, Math.round(s.start * 48000) * 2, 0,
    Math.min(pcm.length, Math.floor((s.end - s.start) * 48000) * 2));
  narration.push({ ...s, rawDuration: duration, playbackSpeed: speed });
});
// Place non-overlapping PCM clips on an explicit sample timeline. This avoids
// multi-input filter timestamp differences between ffmpeg builds.
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + mixed.length, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(48000, 24); header.writeUInt32LE(96000, 28);
header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(mixed.length, 40);
const timelineFile = path.join(root, '.delivery-work/audio/timeline.wav');
fs.writeFileSync(timelineFile, Buffer.concat([header, mixed]));
const voiceFile = path.join(root, '.delivery-work/audio/narration.wav');
let result = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'warning', '-i', timelineFile,
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'pcm_s16le', '-t', '130', voiceFile],
  { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr || 'Audio mix failed');
if (wavDuration(voiceFile) < 129) throw new Error('Mixed narration is unexpectedly short');
const mux = ['-y', '-hide_banner', '-loglevel', 'warning', '-i', path.resolve(root, report.videoPath), '-i', voiceFile,
  '-map', '0:v:0', '-map', '1:a:0',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-t', '130', '-movflags', '+faststart',
  '-metadata', 'title=AegisFlow — the DDoS decision loop',
  '-metadata', 'comment=Synthetic local traffic; offline-tested AWS prototype; synthetic English narration.',
  path.join(root, 'docs/demo/aegisflow-demo.mp4')];
result = spawnSync(ffmpeg, mux, { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr || 'ffmpeg failed');
function stamp(seconds, separator = ',') {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
}
// Short caption lines, timed proportionally to each narration segment.
const cues = [];
segments.forEach(s => {
  const words = s.text.split(' '), chunks = [];
  for (let i = 0; i < words.length; i += 12) chunks.push(words.slice(i, i + 12).join(' '));
  chunks.forEach((text, i) => cues.push({ start: s.start + (s.end - s.start) * i / chunks.length,
    end: s.start + (s.end - s.start) * (i + 1) / chunks.length, text }));
});
fs.writeFileSync(path.join(root, 'docs/demo/aegisflow-demo.en.srt'), cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(root, 'docs/demo/aegisflow-demo.en.vtt'), 'WEBVTT\n\n' + cues.map(c => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(root, 'docs/demo/verification/narration-report.json'), JSON.stringify({ voice: 'Microsoft Zira Desktop', synthetic: true, segments: narration }, null, 2));
console.log('Narrated H.264/AAC video and English subtitles generated.');

// Transcodes a file locally and prints the measured bitrate of every rung.
// Usage: node scripts/test-ladder.js <input.mp4>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildFfmpegArgs, LADDER, SEGMENT_SECONDS } from '../src/ladder.js';

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/test-ladder.js <input.mp4>');
  process.exit(1);
}
const outDir = path.resolve('ladder-out');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const probe = spawnSync('ffprobe', [
  '-v',
  'error',
  '-print_format',
  'json',
  '-show_format',
  '-show_streams',
  input,
]);
const info = JSON.parse(probe.stdout.toString());
const duration = Number(info.format.duration);
const hasAudio = info.streams.some((s) => s.codec_type === 'audio');

const r = spawnSync('ffmpeg', ['-loglevel', 'error', ...buildFfmpegArgs({ input, outDir, hasAudio })], {
  stdio: 'inherit',
});
if (r.status !== 0) process.exit(r.status);

for (const rung of LADDER) {
  const dir = path.join(outDir, rung.name);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.m4s') || f.endsWith('.mp4'));
  const bytes = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  const segs = files.filter((f) => f.endsWith('.m4s')).map((f) => fs.statSync(path.join(dir, f)).size);
  const peakKbps = (Math.max(...segs) * 8) / SEGMENT_SECONDS / 1000;
  console.log(
    `${rung.name.padEnd(5)} avg ${((bytes * 8) / duration / 1000).toFixed(1)} kbps  peak-segment ${peakKbps.toFixed(1)} kbps`,
  );
}

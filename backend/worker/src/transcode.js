// Cloud Run Job: transcodes one uploaded video into the HLS ladder, uploads it to the media
// bucket and publishes the outcome to the video-events topic. It has no database access; the
// catalog passes PRODUCT_ID and RAW_OBJECT and owns the product record.
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PubSub } from '@google-cloud/pubsub';
import { createStorage, env, log } from '@artisan/shared';
import { buildFfmpegArgs, buildThumbnailArgs } from './ladder.js';

const MAX_DURATION_SEC = 15 * 60;
const productId = env('PRODUCT_ID');
const rawObject = env('RAW_OBJECT');
const rawBucket = env('RAW_BUCKET', 'raw');
const mediaBucket = env('MEDIA_BUCKET', 'media');
const audioCodec = env('AUDIO_CODEC', 'libopus');
const topic = new PubSub({ projectId: env('GOOGLE_CLOUD_PROJECT', 'demo-artisan') }).topic(
  env('EVENTS_TOPIC', 'video-events'),
);
const storage = createStorage();

async function publish(type, fields = {}) {
  const event = { eventId: randomUUID(), type, productId, occurredAt: new Date().toISOString(), ...fields };
  await topic.publishMessage({ json: event, attributes: { type, productId } });
  log.info('published', { type, productId });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => {
      err = (err + d).slice(-20000);
    });
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-2000)}`)),
    );
  });
}

async function probe(input) {
  let info;
  try {
    info = JSON.parse(
      await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input]),
    );
  } catch (e) {
    log.warn('ffprobe failed', { productId, error: String(e.message || e) });
    throw new Error('The file could not be read as a video');
  }
  return {
    durationSec: Number(info.format?.duration || 0),
    hasAudio: info.streams.some((s) => s.codec_type === 'audio'),
    hasVideo: info.streams.some((s) => s.codec_type === 'video'),
  };
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])),
  );
  return files.flat();
}

async function uploadDir(localDir, prefix) {
  const queue = await walk(localDir);
  // A 15-minute video produces about 900 segment files; upload 16 at a time.
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (queue.length) {
        const file = queue.shift();
        await storage.upload(
          mediaBucket,
          `${prefix}/${path.relative(localDir, file).split(path.sep).join('/')}`,
          file,
        );
      }
    }),
  );
}

async function main() {
  await publish('video.processing');
  const outDir = path.join(os.tmpdir(), `transcode-${productId}`);
  try {
    // In production ffmpeg reads the raw file over HTTPS (signed URL), so a multi-GB upload
    // never has to fit on local disk.
    const input = await storage.readUrl(rawBucket, rawObject);
    const meta = await probe(input);
    if (!meta.hasVideo) throw new Error('The file has no video track');
    if (meta.durationSec > MAX_DURATION_SEC + 5) {
      throw new Error(`Video is ${Math.round(meta.durationSec / 60)} minutes long; the limit is 15`);
    }

    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await run(
      'ffmpeg',
      buildThumbnailArgs({
        input,
        outFile: `${outDir}/thumb.jpg`,
        atSeconds: Math.min(2, meta.durationSec / 2),
      }),
    );
    await run('ffmpeg', buildFfmpegArgs({ input, outDir, hasAudio: meta.hasAudio, audioCodec }));

    const prefix = `videos/${productId}`;
    await uploadDir(outDir, prefix);
    await publish('video.ready', {
      hlsPath: `${prefix}/master.m3u8`,
      thumbnailPath: `${prefix}/thumb.jpg`,
      durationSec: Math.round(meta.durationSec),
    });
  } catch (e) {
    log.error('transcode failed', { productId, error: String(e.message || e) });
    await publish('video.failed', { error: String(e.message || e).slice(0, 500) });
    process.exitCode = 1;
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
}

await main();

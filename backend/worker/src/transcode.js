// Cloud Run Job: transcodes one uploaded video (PRODUCT_ID) into the HLS ladder,
// uploads it to the media bucket and marks the product READY or FAILED.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { buildFfmpegArgs, buildThumbnailArgs } from './ladder.js';

const MAX_DURATION_SEC = 15 * 60;
const {
  PRODUCT_ID,
  RAW_BUCKET,
  MEDIA_BUCKET,
  MEDIA_BASE_URL = `https://storage.googleapis.com/${process.env.MEDIA_BUCKET}`,
  AUDIO_CODEC = 'libopus',
} = process.env;

const storage = new Storage();
const db = new Firestore();

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '',
      err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => {
      err += d;
      if (err.length > 20000) err = err.slice(-20000);
    });
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-2000)}`)),
    );
  });
}

async function probe(url) {
  const json = await run('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    url,
  ]);
  const info = JSON.parse(json);
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

function contentHeaders(file) {
  if (file.endsWith('.m3u8'))
    return { contentType: 'application/vnd.apple.mpegurl', cacheControl: 'public, max-age=60' };
  if (file.endsWith('.m4s'))
    return { contentType: 'video/iso.segment', cacheControl: 'public, max-age=31536000, immutable' };
  if (file.endsWith('.mp4'))
    return { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000, immutable' };
  if (file.endsWith('.jpg')) return { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' };
  return { contentType: 'application/octet-stream', cacheControl: 'public, max-age=3600' };
}

async function uploadDir(localDir, prefix) {
  const files = await walk(localDir);
  const bucket = storage.bucket(MEDIA_BUCKET);
  // A 15-minute video produces about 900 segment files; upload 16 at a time.
  const queue = [...files];
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (queue.length) {
        const f = queue.shift();
        const dest = `${prefix}/${path.relative(localDir, f).split(path.sep).join('/')}`;
        const { contentType, cacheControl } = contentHeaders(f);
        await bucket.upload(f, {
          destination: dest,
          metadata: { contentType, cacheControl },
          resumable: false,
        });
      }
    }),
  );
}

async function main() {
  if (!PRODUCT_ID) throw new Error('PRODUCT_ID env is required');
  const ref = db.collection('products').doc(PRODUCT_ID);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`product ${PRODUCT_ID} not found`);
  const product = snap.data();

  await ref.update({ status: 'PROCESSING', processingStartedAt: FieldValue.serverTimestamp() });

  try {
    // ffmpeg reads the raw file over HTTPS, so a multi-GB upload never has to fit on local disk.
    const [inputUrl] = await storage
      .bucket(RAW_BUCKET)
      .file(product.rawObject)
      .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 3 * 60 * 60 * 1000 });

    const meta = await probe(inputUrl);
    if (!meta.hasVideo) throw new Error('The file has no video track');
    if (meta.durationSec > MAX_DURATION_SEC + 5) {
      throw new Error(`Video is ${Math.round(meta.durationSec / 60)} minutes long; the limit is 15`);
    }

    const outDir = `/tmp/${PRODUCT_ID}`;
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    await run(
      'ffmpeg',
      buildThumbnailArgs({
        input: inputUrl,
        outFile: `${outDir}/thumb.jpg`,
        atSeconds: Math.min(2, meta.durationSec / 2),
      }),
    );
    await run(
      'ffmpeg',
      buildFfmpegArgs({ input: inputUrl, outDir, hasAudio: meta.hasAudio, audioCodec: AUDIO_CODEC }),
    );

    const prefix = `videos/${PRODUCT_ID}`;
    await uploadDir(outDir, prefix);

    await ref.update({
      status: 'READY',
      durationSec: Math.round(meta.durationSec),
      hlsUrl: `${MEDIA_BASE_URL}/${prefix}/master.m3u8`,
      thumbnailUrl: `${MEDIA_BASE_URL}/${prefix}/thumb.jpg`,
      readyAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
    });
    console.log(JSON.stringify({ msg: 'transcode complete', productId: PRODUCT_ID }));
  } catch (e) {
    console.error(e);
    await ref.update({ status: 'FAILED', error: String(e.message || e).slice(0, 1000) });
    process.exitCode = 1;
  }
}

main();

// Creates 6 demo products through the public API, the same way the app does.
// Usage: node scripts/seed.js <apiUrl> [videoDir]
// Videos in videoDir are used in name order; without it, ffmpeg makes captioned test clips.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PRODUCTS = [
  {
    artisan: 'Meera Pottery',
    title: 'Hand-thrown Terracotta Pot',
    price: 1499,
    tags: ['pottery', 'terracotta', 'home decor'],
    description: 'Thrown on the wheel from local red clay and fired in a wood kiln. Watch it take shape.',
  },
  {
    artisan: 'Meera Pottery',
    title: 'Glazed Stoneware Plate Set',
    price: 1899,
    tags: ['pottery', 'stoneware', 'kitchen'],
    description: 'Set of four food-safe stoneware plates, each glazed by hand.',
  },
  {
    artisan: 'Arjun Woodcraft',
    title: 'Hand-carved Sheesham Wall Panel',
    price: 3299,
    tags: ['woodwork', 'handcarved', 'home decor'],
    description: 'Floral relief carved by hand into a single sheesham board, finished with natural oil.',
  },
  {
    artisan: 'Arjun Woodcraft',
    title: 'Walnut Jewellery Box',
    price: 2499,
    tags: ['woodwork', 'gift', 'home decor'],
    description: 'Walnut box with hand-cut joints, shaped with chisel and mallet.',
  },
  {
    artisan: 'Lakshmi Textiles',
    title: 'Block-printed Cotton Scarf',
    price: 1199,
    tags: ['textile', 'block print', 'cotton'],
    description: 'Printed by hand with carved teak blocks on soft mulmul cotton.',
  },
  {
    artisan: 'Lakshmi Textiles',
    title: 'Handloom Cotton Table Runner',
    price: 799,
    tags: ['textile', 'handloom', 'home decor'],
    description: 'Woven on a traditional loom from hand-spun cotton.',
  },
];

const [api, videoDir] = process.argv.slice(2);
if (!api) {
  console.error('usage: node scripts/seed.js <apiUrl> [videoDir]');
  process.exit(1);
}

async function call(method, p, body, token) {
  const res = await fetch(api + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${json.error || ''}`);
  return json;
}

function placeholderVideo(i, title, dir) {
  const out = path.join(dir, `seed-${i}.mp4`);
  const hue = (i * 60) % 360;
  const text = title.replace(/[':\\]/g, '');
  const r = spawnSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=1280x720:rate=30:duration=40`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${220 + i * 40}:duration=40`,
      '-vf',
      `hue=h=${hue},drawtext=text='${text}':fontsize=44:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=12:x=(w-tw)/2:y=h-120`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-c:a',
      'aac',
      '-shortest',
      out,
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error('ffmpeg failed');
  return out;
}

function probeSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const s = Number(r.stdout?.toString().trim());
  return Number.isFinite(s) ? s : undefined;
}

const videos = videoDir
  ? fs
      .readdirSync(videoDir)
      .filter((f) => /\.(mp4|mov|m4v)$/i.test(f))
      .sort()
      .map((f) => path.join(videoDir, f))
  : [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'artisan-seed-'));
const tokens = {};

for (const [i, p] of PRODUCTS.entries()) {
  const file = videos[i % (videos.length || 1)] || placeholderVideo(i, p.title, tmp);
  tokens[p.artisan] ??= (await call('POST', '/api/auth/demo', { name: p.artisan, role: 'ARTISAN' })).token;
  const token = tokens[p.artisan];
  const size = fs.statSync(file).size;
  const contentType = file.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';

  const { product, uploadUrl } = await call(
    'POST',
    '/api/products',
    {
      title: p.title,
      description: p.description,
      price: p.price,
      tags: p.tags,
      fileName: path.basename(file),
      contentType,
      fileSize: size,
      durationSec: probeSeconds(file),
    },
    token,
  );

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: await fs.openAsBlob(file),
  });
  if (!put.ok) throw new Error(`upload ${p.title} -> HTTP ${put.status}`);
  await call('POST', `/api/products/${product.id}/complete`, null, token);
  console.log(`queued  ${product.id}  ${p.title}  (${(size / 1e6).toFixed(1)} MB)`);
}

console.log('Done. Products appear in search once transcoding finishes.');
fs.rmSync(tmp, { recursive: true, force: true });

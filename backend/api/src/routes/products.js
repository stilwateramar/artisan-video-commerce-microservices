import { Router } from 'express';
import { nanoid } from 'nanoid';
import { FieldValue } from '@google-cloud/firestore';
import { config } from '../config.js';
import { db, storage } from '../lib/gcp.js';
import { requireAuth } from '../lib/auth.js';
import { buildSearchTokens, matchesAll, normalizeTags, words } from '../lib/search.js';
import { startTranscode } from '../lib/jobs.js';
import { mediaUrl } from '../lib/media.js';

const router = Router();
const products = () => db.collection('products');

function toPublic(id, product, req) {
  return {
    id,
    title: product.title,
    description: product.description,
    priceMinor: product.priceMinor,
    currency: product.currency,
    tags: product.tags || [],
    artisanId: product.artisanId,
    artisanName: product.artisanName,
    status: product.status,
    error: product.error,
    durationSec: product.durationSec,
    hlsUrl: mediaUrl(product.hlsUrl, req),
    thumbnailUrl: mediaUrl(product.thumbnailUrl, req),
    createdAt: product.createdAt?.toDate?.().toISOString?.() ?? product.createdAt,
  };
}

const newestFirst = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

// Returns a GCS resumable upload URL. The client sends the video straight to GCS,
// so file size is unlimited and the bytes never pass through Cloud Run.
router.post('/', requireAuth('ARTISAN'), async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const price = Number(body.price);
  const contentType = String(body.contentType || 'video/mp4');
  if (!title || title.length > 120)
    return res.status(400).json({ error: 'Title is required (max 120 characters)' });
  if (description.length > 4000) return res.status(400).json({ error: 'Description is too long' });
  if (!Number.isFinite(price) || price <= 0)
    return res.status(400).json({ error: 'Price must be greater than 0' });
  if (Number(body.durationSec) > config.maxVideoSeconds + 1) {
    return res.status(400).json({ error: 'Video must be 15 minutes or shorter' });
  }
  if (!contentType.startsWith('video/')) return res.status(400).json({ error: 'File must be a video' });

  const id = nanoid(14);
  const fileName = String(body.fileName || 'video.mp4')
    .replace(/[^\w.-]/g, '_')
    .slice(-80);
  const rawObject = `raw/${id}/${fileName}`;
  const tags = normalizeTags(body.tags);
  const product = {
    title,
    description,
    priceMinor: Math.round(price * 100),
    currency: body.currency || 'INR',
    tags,
    searchTokens: buildSearchTokens({ title, description, tags }),
    artisanId: req.user.id,
    artisanName: req.user.name,
    status: 'UPLOADING',
    rawObject,
    fileSize: body.fileSize ? Number(body.fileSize) : null,
    createdAt: FieldValue.serverTimestamp(),
  };
  await products().doc(id).set(product);

  // GCS only returns CORS headers on the session URL if it was created with the page's origin.
  const [uploadUrl] = await storage
    .bucket(config.rawBucket)
    .file(rawObject)
    .createResumableUpload({ metadata: { contentType }, origin: req.get('origin') || undefined });

  res
    .status(201)
    .json({ product: toPublic(id, { ...product, createdAt: new Date().toISOString() }), uploadUrl });
});

router.post('/:id/complete', requireAuth('ARTISAN'), async (req, res) => {
  const ref = products().doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Product not found' });
  const product = snap.data();
  if (product.artisanId !== req.user.id) return res.status(403).json({ error: 'Not your product' });

  const [uploaded] = await storage.bucket(config.rawBucket).file(product.rawObject).exists();
  if (!uploaded) return res.status(409).json({ error: 'Upload not finished yet' });

  await ref.update({ status: 'QUEUED', uploadedAt: FieldValue.serverTimestamp() });
  await startTranscode(req.params.id);
  res.json({ status: 'QUEUED' });
});

router.get('/mine', requireAuth('ARTISAN'), async (req, res) => {
  const snap = await products().where('artisanId', '==', req.user.id).get();
  res.json({ products: snap.docs.map((d) => toPublic(d.id, d.data(), req)).sort(newestFirst) });
});

router.get('/', async (req, res) => {
  const terms = words(req.query.q || '');
  const tag = String(req.query.tag || '')
    .trim()
    .toLowerCase();

  let query = products();
  if (tag) query = query.where('tags', 'array-contains', tag);
  else if (terms.length) query = query.where('searchTokens', 'array-contains', terms[0]);
  else query = query.where('status', '==', 'READY');

  const snap = await query.limit(300).get();
  const list = snap.docs
    .filter((d) => d.get('status') === 'READY' && matchesAll(d.data(), terms))
    .map((d) => toPublic(d.id, d.data(), req))
    .sort(newestFirst);
  res.json({ products: list.slice(0, 100) });
});

router.get('/tags', async (_req, res) => {
  const snap = await products().where('status', '==', 'READY').select('tags').limit(500).get();
  const counts = new Map();
  for (const d of snap.docs) for (const t of d.get('tags') || []) counts.set(t, (counts.get(t) || 0) + 1);
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([t]) => t);
  res.json({ tags });
});

router.get('/:id', async (req, res) => {
  const snap = await products().doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: toPublic(snap.id, snap.data(), req) });
});

export default router;

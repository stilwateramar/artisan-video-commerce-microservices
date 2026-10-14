// Products, upload sessions, search and tags. Owns the `products` collection and starts the
// transcoder; status updates come back as Pub/Sub events (see events.js).
import express from 'express';
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { nanoid } from 'nanoid';
import {
  createApp,
  createAuth,
  createStorage,
  listen,
  loadJwtSecret,
  mediaUrl,
  publicOrigin,
} from '@artisan/shared';
import { config } from './config.js';
import { eventsRouter } from './events.js';
import { buildSearchTokens, matchesAll, normalizeTags, words } from './search.js';
import { startTranscode } from './transcode.js';
import { localUploadRoute } from './uploads.js';

const db = new Firestore({ ignoreUndefinedProperties: true });
const storage = createStorage();
const auth = createAuth(await loadJwtSecret());
const products = () => db.collection('products');
const app = createApp('catalog-service', { json: false });

// Uploaded video bytes must reach the local upload route unparsed; everything else is JSON.
if (storage.mode === 'local') localUploadRoute(app, { products, storage, rawBucket: config.rawBucket });
app.use(express.json({ limit: '1mb' }));

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
    hlsUrl: mediaUrl(product.hlsPath, req),
    thumbnailUrl: mediaUrl(product.thumbnailPath, req),
    createdAt: product.createdAt?.toDate?.().toISOString?.() ?? product.createdAt,
  };
}

const newestFirst = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

// Returns an upload URL. In production it is a GCS resumable session, so the video goes straight
// to Cloud Storage, file size is unlimited and the bytes never pass through Cloud Run.
app.post('/api/products', auth.requireAuth('ARTISAN'), async (req, res) => {
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

  const uploadUrl =
    (await storage.createUploadSession(config.rawBucket, rawObject, {
      contentType,
      origin: req.get('origin'),
    })) || `${publicOrigin(req)}/api/products/${id}/upload`;
  res
    .status(201)
    .json({ product: toPublic(id, { ...product, createdAt: new Date().toISOString() }, req), uploadUrl });
});

app.post('/api/products/:id/complete', auth.requireAuth('ARTISAN'), async (req, res) => {
  const ref = products().doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Product not found' });
  const product = snap.data();
  if (product.artisanId !== req.user.id) return res.status(403).json({ error: 'Not your product' });
  if (!(await storage.exists(config.rawBucket, product.rawObject))) {
    return res.status(409).json({ error: 'Upload not finished yet' });
  }

  await ref.update({ status: 'QUEUED', uploadedAt: FieldValue.serverTimestamp() });
  await startTranscode(req.params.id, product.rawObject);
  res.json({ status: 'QUEUED' });
});

app.get('/api/products/mine', auth.requireAuth('ARTISAN'), async (req, res) => {
  const snap = await products().where('artisanId', '==', req.user.id).get();
  res.json({ products: snap.docs.map((d) => toPublic(d.id, d.data(), req)).sort(newestFirst) });
});

app.get('/api/products', async (req, res) => {
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

app.get('/api/products/tags', async (_req, res) => {
  const snap = await products().where('status', '==', 'READY').select('tags').limit(500).get();
  const counts = new Map();
  for (const d of snap.docs) for (const t of d.get('tags') || []) counts.set(t, (counts.get(t) || 0) + 1);
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([t]) => t);
  res.json({ tags });
});

app.get('/api/products/:id', async (req, res) => {
  const snap = await products().doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: toPublic(snap.id, snap.data(), req) });
});

// Internal: used by order-service. Not routed by the gateway; in production only callers with
// the Cloud Run invoker role on this service can reach it.
app.get('/internal/products/:id', async (req, res) => {
  const snap = await products().doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Product not found' });
  const p = snap.data();
  res.json({
    id: snap.id,
    title: p.title,
    priceMinor: p.priceMinor,
    currency: p.currency,
    status: p.status,
    artisanId: p.artisanId,
    thumbnailPath: p.thumbnailPath || null,
  });
});

eventsRouter(db, app);

listen(app, config.port, 'catalog-service');

import { Router } from 'express';
import { config } from '../config.js';
import { storage } from '../lib/gcp.js';

// Streams playlists, segments and posters from the private media bucket. Our GCP org
// enforces domain-restricted sharing, so the bucket cannot be made public. The worker's
// cache headers are passed through, so a CDN in front of this route would work as-is.
const router = Router();

router.get(/^\/videos\/[\w-]+\/[\w./-]+$/, async (req, res, next) => {
  const name = req.path.slice(1);
  if (name.includes('..')) return res.status(400).end();
  const file = storage.bucket(config.mediaBucket).file(name);

  let meta;
  try {
    [meta] = await file.getMetadata();
  } catch (e) {
    if (e.code === 404) return res.status(404).end();
    return next(e);
  }

  const size = Number(meta.size);
  res.set({
    'Content-Type': meta.contentType || 'application/octet-stream',
    'Cache-Control': meta.cacheControl || 'public, max-age=60',
    'Accept-Ranges': 'bytes',
    ETag: meta.etag,
  });
  if (req.fresh) return res.status(304).end();

  let start = 0;
  let end = size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') || '');
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.set('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.set('Content-Length', String(end - start + 1));
  if (req.method === 'HEAD') return res.end();

  file
    .createReadStream({ start, end, validation: false })
    .on('error', (e) => (res.headersSent ? res.destroy(e) : next(e)))
    .pipe(res);
});

export default router;

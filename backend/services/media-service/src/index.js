// Streams HLS playlists, segments and posters from the private media bucket. Our GCP organisation
// enforces domain-restricted sharing, so the bucket cannot be public. Cache headers set at upload
// time are passed through, so a CDN in front of this service would work as-is.
import { createApp, createStorage, env, listen } from '@artisan/shared';

const storage = createStorage();
const mediaBucket = env('MEDIA_BUCKET', 'media');
const app = createApp('media-service', { json: false });

app.get(/^\/media\/(videos\/[\w-]+\/[\w./-]+)$/, async (req, res) => {
  const name = req.params[0];
  if (name.includes('..')) return res.status(400).end();

  const meta = await storage.stat(mediaBucket, name);
  if (!meta) return res.status(404).end();
  res.set({
    'Content-Type': meta.contentType || 'application/octet-stream',
    'Cache-Control': meta.cacheControl || 'public, max-age=60',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    ETag: meta.etag,
  });
  if (req.fresh) return res.status(304).end();

  let start = 0;
  let end = meta.size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') || '');
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, meta.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), meta.size - 1) : meta.size - 1;
    if (start > end || start >= meta.size) {
      res.set('Content-Range', `bytes */${meta.size}`);
      return res.status(416).end();
    }
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${meta.size}`);
  }
  res.set('Content-Length', String(end - start + 1));
  if (req.method === 'HEAD') return res.end();

  storage
    .read(mediaBucket, name, { start, end })
    .on('error', (e) => (res.headersSent ? res.destroy(e) : res.status(500).end()))
    .pipe(res);
});

listen(app, Number(env('PORT', '8084')), 'media-service');

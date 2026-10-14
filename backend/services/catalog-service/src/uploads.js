// Local development only (STORAGE_MODE=local): accepts uploads the same way a GCS resumable
// session does, so the app's chunked web upload and single-PUT native upload work unchanged.
// A chunk is "Content-Range: bytes a-b/total"; "bytes */total" asks how much has arrived.
// 308 + Range means "send more", 200 means complete.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

function reply(res, received, total) {
  if (received >= total) return res.status(200).json({ size: received });
  if (received > 0) res.set('Range', `bytes=0-${received - 1}`);
  return res.status(308).end();
}

export function localUploadRoute(router, { products, storage, rawBucket }) {
  router.put('/api/products/:id/upload', async (req, res) => {
    const snap = await products().doc(req.params.id).get();
    if (!snap.exists || snap.get('status') !== 'UPLOADING')
      return res.status(404).json({ error: 'No upload in progress' });

    const file = storage.pathFor(rawBucket, snap.get('rawObject'));
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const received = fs.existsSync(file) ? (await fsp.stat(file)).size : 0;
    const range = /^bytes (\d+)-(\d+)\/(\d+)$|^bytes \*\/(\d+)$/.exec(req.get('content-range') || '');

    if (!range) {
      await pipeline(req, fs.createWriteStream(file));
      return res.status(200).json({ size: (await fsp.stat(file)).size });
    }
    if (range[4]) return reply(res, received, Number(range[4]));

    const [start, end, total] = [Number(range[1]), Number(range[2]), Number(range[3])];
    if (start !== received) {
      req.resume();
      return reply(res, received, total);
    }
    await pipeline(req, fs.createWriteStream(file, { flags: 'a' }));
    return reply(res, end + 1, total);
  });
}

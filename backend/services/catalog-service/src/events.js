// Pub/Sub push endpoint for video-events published by the transcoder.
// Pub/Sub delivers at least once and may reorder, so each event is applied in a transaction that
// records its ID (duplicates become no-ops) and only allows forward status transitions.
import { FieldValue } from '@google-cloud/firestore';
import { log } from '@artisan/shared';

const NEXT = {
  'video.processing': { from: ['QUEUED'], to: 'PROCESSING' },
  'video.ready': { from: ['QUEUED', 'PROCESSING', 'FAILED'], to: 'READY' },
  'video.failed': { from: ['QUEUED', 'PROCESSING'], to: 'FAILED' },
};

export function decodePush(body) {
  const data = body?.message?.data;
  if (!data) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function applyVideoEvent(db, event) {
  const rule = NEXT[event?.type];
  if (!rule || !event.eventId || !event.productId) return 'ignored';

  const productRef = db.collection('products').doc(event.productId);
  const eventRef = productRef.collection('events').doc(event.eventId);
  return db.runTransaction(async (tx) => {
    const [product, seen] = await Promise.all([tx.get(productRef), tx.get(eventRef)]);
    if (seen.exists) return 'duplicate';
    if (!product.exists) return 'unknown-product';
    tx.create(eventRef, { type: event.type, receivedAt: FieldValue.serverTimestamp() });
    if (!rule.from.includes(product.get('status'))) return 'stale';

    const update = { status: rule.to, statusUpdatedAt: FieldValue.serverTimestamp() };
    if (event.type === 'video.ready') {
      Object.assign(update, {
        hlsPath: event.hlsPath,
        thumbnailPath: event.thumbnailPath,
        durationSec: event.durationSec,
        error: FieldValue.delete(),
      });
    }
    if (event.type === 'video.failed')
      update.error = String(event.error || 'Transcoding failed').slice(0, 500);
    tx.update(productRef, update);
    return 'applied';
  });
}

export function eventsRouter(db, router) {
  router.post('/events/video', async (req, res) => {
    const event = decodePush(req.body);
    const result = await applyVideoEvent(db, event);
    log.info('video event', {
      result,
      type: event?.type,
      productId: event?.productId,
      eventId: event?.eventId,
    });
    // Acknowledge everything except real failures (thrown above): retrying a malformed or
    // unknown event would never succeed and would only keep redelivering it.
    res.status(204).end();
  });
  return router;
}

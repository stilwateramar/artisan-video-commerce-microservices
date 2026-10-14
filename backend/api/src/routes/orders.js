import { Router } from 'express';
import { FieldValue } from '@google-cloud/firestore';
import { db } from '../lib/gcp.js';
import { requireAuth } from '../lib/auth.js';
import { mediaUrl } from '../lib/media.js';

// Payment is simulated and shipping is out of scope: the flow ends at a PLACED order.
const router = Router();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

router.post('/', requireAuth('BUYER'), async (req, res) => {
  const productId = String(req.body?.productId || '');
  const quantity = Math.max(1, Math.min(10, Number(req.body?.quantity || 1)));
  const productRef = db.collection('products').doc(productId);
  const orderRef = db.collection('orders').doc();

  try {
    const order = await db.runTransaction(async (tx) => {
      const snap = await tx.get(productRef);
      if (!snap.exists) throw new HttpError(404, 'Product not found');
      const product = snap.data();
      if (product.status !== 'READY') throw new HttpError(409, 'Product is not available yet');
      const newOrder = {
        buyerId: req.user.id,
        buyerName: req.user.name,
        artisanId: product.artisanId,
        productId,
        productTitle: product.title,
        thumbnailUrl: product.thumbnailUrl || null,
        unitPriceMinor: product.priceMinor,
        quantity,
        totalMinor: product.priceMinor * quantity,
        currency: product.currency,
        status: 'PLACED',
        createdAt: FieldValue.serverTimestamp(),
      };
      tx.set(orderRef, newOrder);
      return newOrder;
    });
    res.status(201).json({
      order: {
        id: orderRef.id,
        ...order,
        thumbnailUrl: mediaUrl(order.thumbnailUrl, req),
        createdAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    res.status(e.status).json({ error: e.message });
  }
});

router.get('/mine', requireAuth('BUYER'), async (req, res) => {
  const snap = await db.collection('orders').where('buyerId', '==', req.user.id).get();
  const orders = snap.docs.map((d) => {
    const order = d.data();
    return {
      id: d.id,
      ...order,
      thumbnailUrl: mediaUrl(order.thumbnailUrl, req),
      createdAt: order.createdAt?.toDate?.().toISOString?.(),
    };
  });
  orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ orders });
});

export default router;

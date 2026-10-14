// Places and lists orders. Owns the `orders` collection and reads product price and status only
// through catalog-service, never from the products collection directly. Payment is simulated and
// shipping is out of scope, so the flow ends at a PLACED order.
import { FieldValue, Firestore } from '@google-cloud/firestore';
import {
  HttpError,
  createApp,
  createAuth,
  env,
  listen,
  loadJwtSecret,
  log,
  mediaUrl,
  serviceFetch,
} from '@artisan/shared';

// A named database keeps this version's data apart from anything else in the project.
const db = new Firestore({
  ignoreUndefinedProperties: true,
  databaseId: env('FIRESTORE_DATABASE', '(default)'),
});
const auth = createAuth(await loadJwtSecret());
const catalogUrl = env('CATALOG_URL', 'http://localhost:8082');
const orders = db.collection('orders');
const app = createApp('order-service');

async function getProduct(productId) {
  let res;
  try {
    res = await serviceFetch(catalogUrl, `/internal/products/${encodeURIComponent(productId)}`);
  } catch (e) {
    log.error('catalog unreachable', { error: String(e) });
    throw new HttpError(503, 'Ordering is unavailable, please try again');
  }
  if (res.status === 404) throw new HttpError(404, 'Product not found');
  if (!res.ok) throw new HttpError(503, 'Ordering is unavailable, please try again');
  return res.json();
}

function toPublic(id, order, req) {
  const { thumbnailPath, ...rest } = order;
  return {
    id,
    ...rest,
    thumbnailUrl: mediaUrl(thumbnailPath, req),
    createdAt: order.createdAt?.toDate?.().toISOString?.() ?? order.createdAt,
  };
}

app.post('/api/orders', auth.requireAuth('BUYER'), async (req, res) => {
  const productId = String(req.body?.productId || '');
  const quantity = Math.max(1, Math.min(10, Number(req.body?.quantity || 1)));
  if (!productId) return res.status(400).json({ error: 'Product is required' });

  const product = await getProduct(productId);
  if (product.status !== 'READY') return res.status(409).json({ error: 'Product is not available yet' });

  // Price is taken from the catalog at order time and stored on the order, so later price
  // changes never alter an order that was already placed.
  const order = {
    buyerId: req.user.id,
    buyerName: req.user.name,
    artisanId: product.artisanId,
    productId,
    productTitle: product.title,
    thumbnailPath: product.thumbnailPath,
    unitPriceMinor: product.priceMinor,
    quantity,
    totalMinor: product.priceMinor * quantity,
    currency: product.currency,
    status: 'PLACED',
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await orders.add(order);
  res.status(201).json({ order: toPublic(ref.id, { ...order, createdAt: new Date().toISOString() }, req) });
});

app.get('/api/orders/mine', auth.requireAuth('BUYER'), async (req, res) => {
  const snap = await orders.where('buyerId', '==', req.user.id).get();
  const list = snap.docs.map((d) => toPublic(d.id, d.data(), req));
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ orders: list });
});

listen(app, Number(env('PORT', '8083')), 'order-service');

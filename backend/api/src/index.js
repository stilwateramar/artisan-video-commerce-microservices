import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import mediaRoutes from './routes/media.js';

const app = express();
app.disable('x-powered-by');
// Cloud Run terminates TLS, so trust X-Forwarded-Proto for req.protocol.
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/media', mediaRoutes);
app.use('/media', (_req, res) => res.status(404).end());

// The Expo web build is served from the same origin, so the web app needs no API URL.
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api\/|media\/).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(config.port, () => console.log(`artisan-api listening on :${config.port}`));

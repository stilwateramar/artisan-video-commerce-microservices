// Public entry point. Routes the same paths the monolith served, so the apps need no changes,
// and serves the Expo web build from the same origin.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from './cors.js';
import { createApp, env, listen } from '@artisan/shared';
import { proxyTo } from './proxy.js';

const app = createApp('gateway', { json: false });
app.use(cors);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', proxyTo(env('AUTH_URL', 'http://localhost:8081')));
app.use('/api/products', proxyTo(env('CATALOG_URL', 'http://localhost:8082')));
app.use('/api/orders', proxyTo(env('ORDER_URL', 'http://localhost:8083')));
app.use('/media', proxyTo(env('MEDIA_URL', 'http://localhost:8084')));
// Service-to-service routes are never exposed publicly.
app.use(['/api', '/internal', '/events'], (_req, res) => res.status(404).json({ error: 'Not found' }));

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api\/|media\/).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

listen(app, Number(env('PORT', '8080')), 'gateway');

import express from 'express';
import { log } from './log.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Base app for every service: JSON body, health check, forwarded headers from the gateway.
export function createApp(name, { json = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  if (json) app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: name }));
  return app;
}

// Adds 404 and error handlers last, then starts listening.
export function listen(app, port, name) {
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    log.error('request failed', { path: req.path, error: err.stack || String(err) });
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app.listen(port, () => log.info(`${name} listening`, { port }));
}

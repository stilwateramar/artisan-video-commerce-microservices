// Minimal streaming reverse proxy. Bodies are piped in both directions, so large uploads and
// ranged media responses never get buffered in the gateway.
import http from 'node:http';
import https from 'node:https';
import { log, serviceAuthHeaders } from '@artisan/shared';

const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'te',
  'trailer',
];

export function proxyTo(target) {
  const base = new URL(target);
  const client = base.protocol === 'https:' ? https : http;

  return async (req, res) => {
    const headers = { ...req.headers };
    for (const h of HOP_BY_HOP) delete headers[h];
    delete headers['x-serverless-authorization'];
    Object.assign(headers, {
      host: base.host,
      'x-forwarded-host': req.get('host'),
      'x-forwarded-proto': req.protocol,
      'x-forwarded-for': req.ip,
      ...(await serviceAuthHeaders(target)),
    });

    const upstream = client.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port,
        method: req.method,
        path: req.originalUrl,
        headers,
      },
      (upRes) => {
        res.status(upRes.statusCode);
        for (const [k, v] of Object.entries(upRes.headers)) if (!HOP_BY_HOP.includes(k)) res.setHeader(k, v);
        upRes.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      log.error('upstream error', { target, path: req.originalUrl, error: String(e) });
      if (!res.headersSent) res.status(502).json({ error: 'Service unavailable, please try again' });
      else res.destroy();
    });
    req.pipe(upstream);
  };
}

// Local development only: stands in for the Cloud Run Job. The catalog POSTs { productId,
// rawObject } and this runs transcode.js as a child process with the same environment.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { env, log } from '@artisan/shared';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'transcode.js');
const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true, service: 'transcoder-dev' }));

app.post('/run', (req, res) => {
  const { productId, rawObject } = req.body || {};
  if (!productId || !rawObject)
    return res.status(400).json({ error: 'productId and rawObject are required' });
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, PRODUCT_ID: productId, RAW_OBJECT: rawObject },
    stdio: 'inherit',
  });
  child.on('exit', (code) => log.info('transcode finished', { productId, code }));
  res.status(202).json({ started: true });
});

const port = Number(env('PORT', '8085'));
app.listen(port, () => log.info('transcoder dev server listening', { port }));

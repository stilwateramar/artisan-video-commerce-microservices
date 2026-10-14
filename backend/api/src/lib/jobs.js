import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobsClient } from '@google-cloud/run';
import { config } from '../config.js';

const jobs = new JobsClient();

export async function startTranscode(productId) {
  if (config.localWorker) {
    const worker = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../worker/src/transcode.js',
    );
    spawn(process.execPath, [worker], {
      env: { ...process.env, PRODUCT_ID: productId },
      stdio: 'inherit',
      detached: true,
    }).unref();
    return;
  }
  // Not awaited: the job can run for many minutes and reports its own status in Firestore.
  await jobs.runJob({
    name: `projects/${config.projectId}/locations/${config.region}/jobs/${config.transcodeJob}`,
    overrides: { containerOverrides: [{ env: [{ name: 'PRODUCT_ID', value: productId }] }] },
  });
}

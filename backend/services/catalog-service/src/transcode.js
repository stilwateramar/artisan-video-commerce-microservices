import { JobsClient } from '@google-cloud/run';
import { config } from './config.js';

let jobs;

// The worker receives everything it needs as env, so it never reads the catalog's database.
export async function startTranscode(productId, rawObject) {
  if (config.transcoderMode === 'http') {
    const res = await fetch(`${config.transcoderUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, rawObject }),
    });
    if (!res.ok) throw new Error(`transcoder returned ${res.status}`);
    return;
  }
  jobs ??= new JobsClient();
  // Not awaited: the job can run for many minutes and reports back through Pub/Sub.
  await jobs.runJob({
    name: `projects/${config.projectId}/locations/${config.region}/jobs/${config.transcodeJob}`,
    overrides: {
      containerOverrides: [
        {
          env: [
            { name: 'PRODUCT_ID', value: productId },
            { name: 'RAW_OBJECT', value: rawObject },
          ],
        },
      ],
    },
  });
}

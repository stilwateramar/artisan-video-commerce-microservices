import { env } from '@artisan/shared';

export const config = {
  port: Number(env('PORT', '8082')),
  projectId: env('GOOGLE_CLOUD_PROJECT', 'demo-artisan'),
  region: env('REGION', 'asia-south1'),
  rawBucket: env('RAW_BUCKET', 'raw'),
  // job: Cloud Run Job (production). http: POST to the worker's dev server (local).
  transcoderMode: env('TRANSCODER_MODE', 'job'),
  transcodeJob: env('TRANSCODE_JOB', 'artisan-transcoder'),
  transcoderUrl: env('TRANSCODER_URL', 'http://localhost:8085'),
  maxVideoSeconds: 15 * 60,
};

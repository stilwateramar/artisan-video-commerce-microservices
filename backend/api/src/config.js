const env = process.env;

export const config = {
  port: Number(env.PORT || 8080),
  projectId: env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT,
  region: env.REGION || 'asia-south1',
  rawBucket: env.RAW_BUCKET,
  mediaBucket: env.MEDIA_BUCKET,
  transcodeJob: env.TRANSCODE_JOB || 'artisan-transcoder',
  jwtSecret: env.JWT_SECRET || 'dev-secret',
  localWorker: env.LOCAL_WORKER === '1',
  maxVideoSeconds: 15 * 60,
};

// K_SERVICE is set on Cloud Run; never fall back to the dev secret there.
if (env.K_SERVICE && !env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
for (const key of ['rawBucket', 'mediaBucket']) {
  if (!config[key]) console.warn(`${key} is not set`);
}

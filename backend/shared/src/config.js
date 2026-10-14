// K_SERVICE (services) and CLOUD_RUN_JOB (jobs) are set by Cloud Run.
export const onCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB);

export function env(name, fallback) {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`${name} is not set`);
}

// The worker stores absolute media URLs, but a Cloud Run service has more than one
// hostname. Rewrite them to the host the client used so everything stays on one origin.
export function mediaUrl(url, req) {
  const i = typeof url === 'string' ? url.indexOf('/media/') : -1;
  if (i < 0 || !req) return url;
  return `${req.protocol}://${req.get('host')}${url.slice(i)}`;
}

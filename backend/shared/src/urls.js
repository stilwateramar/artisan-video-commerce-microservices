// Media is stored by path (videos/<id>/master.m3u8). Absolute URLs are built per request from
// the host the client used, which the gateway forwards in X-Forwarded-Host.
export function publicOrigin(req) {
  return `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
}

export function mediaUrl(path, req) {
  return path ? `${publicOrigin(req)}/media/${path}` : undefined;
}

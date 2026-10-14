// The web app is same-origin, but the native app and other tools call the API cross-origin.
export default function cors(req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method !== 'OPTIONS') return next();
  res.set({
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': req.get('access-control-request-headers') || 'Content-Type,Authorization',
    'Access-Control-Max-Age': '3600',
  });
  res.status(204).end();
}

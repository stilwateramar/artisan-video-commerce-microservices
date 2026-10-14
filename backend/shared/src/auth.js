import jwt from 'jsonwebtoken';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { onCloudRun } from './config.js';

// Locally JWT_SECRET comes from the environment. On Cloud Run the services get
// JWT_SECRET_NAME (projects/<p>/secrets/<name>/versions/latest) and read it at startup,
// so the secret never appears in the service configuration.
export async function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const name = process.env.JWT_SECRET_NAME;
  if (name) {
    const [version] = await new SecretManagerServiceClient().accessSecretVersion({ name });
    return version.payload.data.toString('utf8');
  }
  if (onCloudRun) throw new Error('JWT_SECRET_NAME is not set');
  return 'dev-secret';
}

export function createAuth(secret) {
  return {
    sign: (user) => jwt.sign(user, secret, { expiresIn: '30d' }),
    requireAuth: (role) => (req, res, next) => {
      const header = req.get('authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Please sign in' });
      try {
        req.user = jwt.verify(token, secret);
      } catch {
        return res.status(401).json({ error: 'Session expired, please sign in again' });
      }
      if (role && req.user.role !== role)
        return res.status(403).json({ error: 'Not allowed for this account' });
      next();
    },
  };
}

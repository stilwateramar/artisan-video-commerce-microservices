// Demo sign-in: a display name and role get a signed JWT, no password.
// A production build would use Firebase Auth or Identity Platform.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(user) {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '30d' });
}

export function requireAuth(role) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please sign in' });
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Session expired, please sign in again' });
    }
    if (role && req.user.role !== role)
      return res.status(403).json({ error: 'Not allowed for this account' });
    next();
  };
}

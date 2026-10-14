// Demo sign-in: a display name and role get a signed JWT, no password. Owns the `users` collection.
import { Firestore } from '@google-cloud/firestore';
import { nanoid } from 'nanoid';
import { createApp, createAuth, env, listen, loadJwtSecret } from '@artisan/shared';

const db = new Firestore({ ignoreUndefinedProperties: true });
const auth = createAuth(await loadJwtSecret());
const users = db.collection('users');
const app = createApp('auth-service');

app.post('/api/auth/demo', async (req, res) => {
  const name = String(req.body?.name || '')
    .trim()
    .slice(0, 60);
  const role = req.body?.role;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!['ARTISAN', 'BUYER'].includes(role))
    return res.status(400).json({ error: 'Role must be ARTISAN or BUYER' });

  // Same name and role map to the same user, so people can sign back in.
  const key = `${role}:${name.toLowerCase()}`;
  const existing = await users.where('key', '==', key).limit(1).get();
  let user;
  if (existing.empty) {
    user = { id: nanoid(12), name, role, key, createdAt: new Date().toISOString() };
    await users.doc(user.id).set(user);
  } else {
    user = { id: existing.docs[0].id, ...existing.docs[0].data() };
  }
  const payload = { id: user.id, name: user.name, role: user.role };
  res.json({ token: auth.sign(payload), user: payload });
});

listen(app, Number(env('PORT', '8081')), 'auth-service');

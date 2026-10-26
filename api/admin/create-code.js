import { getRedis } from '../_lib/redis.js';
import { newCode, sha256, sendJson, requireMethod, adminAuthorized } from '../_lib/security.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!adminAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
  try {
    const redis = getRedis();
    const code = newCode();
    const ttlSeconds = 900;
    await redis.set(`mtv:code:${sha256(code)}`, { createdAt: new Date().toISOString() }, { ex: ttlSeconds });
    return sendJson(res, 200, { code, expiresInSeconds: ttlSeconds, instructions: 'Enter this code once in Mahfuz TV. It expires after 15 minutes.' });
  } catch (e) {
    console.error('create-code error', e);
    return sendJson(res, 500, { error: 'Could not create code. Check Redis configuration.' });
  }
}

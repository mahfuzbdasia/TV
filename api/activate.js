import { getRedis } from './_lib/redis.js';
import { newToken, sha256, sendJson, requireMethod, rateLimit } from './_lib/security.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const redis = getRedis();
    if (!(await rateLimit(req, redis, 'mtv:rl:activate', 10, 900))) {
      return sendJson(res, 429, { error: 'Too many activation attempts. Try again later.' });
    }
    const code = String(req.body?.code || '').replace(/\s+/g, '').toUpperCase();
    const deviceName = String(req.body?.deviceName || 'Mahfuz TV device').slice(0, 80);
    if (!/^[A-F0-9]{10}$/.test(code)) return sendJson(res, 400, { error: 'Enter a valid activation code.' });

    const codeKey = `mtv:code:${sha256(code)}`;
    // GETDEL makes activation codes single-use, including concurrent requests.
    const codeRecord = await redis.getdel(codeKey);
    if (!codeRecord) return sendJson(res, 401, { error: 'Invalid, expired, or already-used activation code.' });

    const token = newToken();
    const deviceId = cryptoRandomId();
    const record = { deviceId, deviceName, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
    await redis.set(`mtv:device:${sha256(token)}`, record);
    await redis.set(`mtv:device-meta:${deviceId}`, { ...record, tokenHash: sha256(token) });
    return sendJson(res, 200, { token, device: { deviceId, deviceName }, message: 'Device activated.' });
  } catch (e) {
    console.error('activate error', e);
    return sendJson(res, 500, { error: 'Activation service is not configured or is temporarily unavailable.' });
  }
}
function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

import { getRedis } from '../_lib/redis.js';
import { sendJson, requireMethod, adminAuthorized } from '../_lib/security.js';

export default async function handler(req, res) {
  if (!['GET','DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!adminAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
  try {
    const redis = getRedis();
    if (req.method === 'GET') {
      const keys = await redis.keys('mtv:device-meta:*');
      const devices = [];
      for (const key of keys) {
        const item = await redis.get(key);
        if (item) devices.push({ deviceId: item.deviceId, deviceName: item.deviceName, createdAt: item.createdAt, lastSeenAt: item.lastSeenAt });
      }
      return sendJson(res, 200, { devices });
    }
    const deviceId = String(req.query?.deviceId || '');
    if (!deviceId || !/^[a-z0-9-]{5,80}$/i.test(deviceId)) return sendJson(res, 400, { error: 'Valid deviceId query parameter required.' });
    const metaKey = `mtv:device-meta:${deviceId}`;
    const meta = await redis.get(metaKey);
    if (!meta) return sendJson(res, 404, { error: 'Device not found.' });
    await redis.del(`mtv:device:${meta.tokenHash}`);
    await redis.del(metaKey);
    return sendJson(res, 200, { revoked: true, deviceId });
  } catch (e) {
    console.error('devices error', e);
    return sendJson(res, 500, { error: 'Could not manage devices.' });
  }
}

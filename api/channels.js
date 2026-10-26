import { getRedis } from './_lib/redis.js';
import { authenticateDevice, sendJson, requireMethod } from './_lib/security.js';
import { loadChannelsFromDrive } from './_lib/drive.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  try {
    const auth = await authenticateDevice(req);
    if (!auth) return sendJson(res, 401, { error: 'Device not activated. Activate this device first.' });
    const { redis, record, key } = auth;
    const now = new Date().toISOString();
    const cached = await redis.get('mtv:channels:cache:v1');
    let channels = cached?.channels;
    let updatedAt = cached?.updatedAt;
    if (!channels) {
      channels = await loadChannelsFromDrive();
      updatedAt = now;
      await redis.set('mtv:channels:cache:v1', { channels, updatedAt }, { ex: 60 });
    }
    await redis.set(key, { ...record, lastSeenAt: now });
    return sendJson(res, 200, { channels, updatedAt, count: channels.length, refreshAfterSeconds: 300 });
  } catch (e) {
    console.error('channels error', e);
    return sendJson(res, 503, { error: 'Could not load private channel list. Check server configuration and Google Drive sharing.' });
  }
}

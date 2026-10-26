import crypto from 'node:crypto';
import { getRedis } from './redis.js';

export const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const newCode = () => crypto.randomBytes(5).toString('hex').toUpperCase();

export function sendJson(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(JSON.stringify(data));
}

export function requireMethod(req, res, method) {
  if (req.method !== method) {
    res.setHeader('Allow', method);
    sendJson(res, 405, { error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function adminAuthorized(req) {
  const expected = process.env.ADMIN_SECRET;
  const auth = req.headers.authorization || '';
  return Boolean(expected && auth === `Bearer ${expected}`);
}

export async function authenticateDevice(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (token.length < 32 || token.length > 200) return null;
  const redis = getRedis();
  const key = `mtv:device:${sha256(token)}`;
  const record = await redis.get(key);
  if (!record) return null;
  return { redis, key, record, tokenHash: sha256(token) };
}

export async function rateLimit(req, redis, keyPrefix, max, seconds) {
  const forwarded = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const ipHash = sha256(forwarded || 'unknown');
  const key = `${keyPrefix}:${ipHash}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, seconds);
  return n <= max;
}

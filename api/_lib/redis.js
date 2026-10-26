import { Redis } from '@upstash/redis';
import { requireEnv } from './env.js';

let instance;
export function getRedis() {
  requireEnv('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
  if (!instance) instance = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
  });
  return instance;
}

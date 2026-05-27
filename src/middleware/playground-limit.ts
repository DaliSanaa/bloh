import type { FastifyRequest } from 'fastify';
import { PlaygroundRateLimitedError } from '../utils/errors.js';

const PLAYGROUND_DAILY_LIMIT = 3;
const PLAYGROUND_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** In-memory playground extraction buckets keyed by client IP. */
const playgroundBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Removes expired playground rate limit buckets.
 * @returns void
 */
function cleanupExpiredPlaygroundBuckets(): void {
  const now = Date.now();

  for (const [key, bucket] of playgroundBuckets.entries()) {
    if (bucket.resetAt <= now) {
      playgroundBuckets.delete(key);
    }
  }
}

setInterval(cleanupExpiredPlaygroundBuckets, CLEANUP_INTERVAL_MS).unref();

// Relies on Fastify's trustProxy to resolve the real client IP.
export function getClientIp(request: FastifyRequest): string {
  return request.ip;
}

/**
 * Enforces the daily playground extraction limit for a client IP.
 * @param clientIp - Client IP address
 * @returns void
 */
export function enforcePlaygroundExtractLimit(clientIp: string): void {
  const now = Date.now();
  const bucket = playgroundBuckets.get(clientIp);

  if (bucket !== undefined && bucket.resetAt > now && bucket.count >= PLAYGROUND_DAILY_LIMIT) {
    throw new PlaygroundRateLimitedError();
  }
}

/**
 * Records a successful playground extraction against the client IP limit.
 * @param clientIp - Client IP address
 * @returns void
 */
export function recordPlaygroundExtract(clientIp: string): void {
  const now = Date.now();
  const bucket = playgroundBuckets.get(clientIp);

  if (bucket === undefined || bucket.resetAt <= now) {
    playgroundBuckets.set(clientIp, {
      count: 1,
      resetAt: now + PLAYGROUND_WINDOW_MS,
    });
    return;
  }

  bucket.count += 1;
}

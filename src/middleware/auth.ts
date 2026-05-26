import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../types/index.js';
import { validateApiKey } from '../services/api-keys.js';
import { checkLimit } from '../services/usage.js';
import {
  creditLimitReachedError,
  rateLimitedError,
  unauthorizedError,
} from '../utils/errors.js';

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

/** Tracks request counts per API key within a sliding window. */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** In-memory rate limit store keyed by API key ID. */
const rateLimitMap = new Map<string, RateLimitEntry>();

/** Periodic cleanup timer for expired rate limit entries. */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Removes expired entries from the rate limit map to prevent unbounded growth.
 */
function cleanupRateLimitMap(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Starts periodic cleanup of the rate limit map if not already running.
 */
function ensureCleanupRunning(): void {
  if (cleanupTimer === null) {
    cleanupTimer = setInterval(cleanupRateLimitMap, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  }
}

/**
 * Checks and increments the rate limit counter for an API key ID.
 * @param keyId - API key ID
 * @returns True if the request is within the rate limit
 */
function checkRateLimit(keyId: string): boolean {
  ensureCleanupRunning();
  const now = Date.now();
  const existing = rateLimitMap.get(keyId);

  if (!existing || existing.resetAt <= now) {
    rateLimitMap.set(keyId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    return false;
  }

  existing.count += 1;
  return true;
}

/** Paths that do not require API key authentication. */
const PUBLIC_PATH_PREFIXES = ['/css/', '/js/', '/assets/'];

/**
 * Determines whether a request should bypass API key authentication.
 * @param url - Request URL path
 * @param method - HTTP method
 * @returns True if the route is public
 */
function isPublicRoute(url: string, method: string): boolean {
  const pathOnly = url.split('?')[0] ?? url;

  if (pathOnly === '/health') {
    return true;
  }

  if (
    method === 'GET' &&
    (pathOnly === '/' ||
      pathOnly === '/index.html' ||
      pathOnly === '/login.html' ||
      pathOnly === '/signup.html' ||
      pathOnly === '/dashboard.html' ||
      pathOnly === '/docs.html' ||
      pathOnly === '/login' ||
      pathOnly === '/signup' ||
      pathOnly === '/dashboard' ||
      pathOnly === '/docs' ||
      PUBLIC_PATH_PREFIXES.some((p) => pathOnly.startsWith(p)))
  ) {
    return true;
  }

  if (pathOnly.startsWith('/auth/')) {
    return true;
  }

  if (pathOnly.startsWith('/account/')) {
    return true;
  }

  if (pathOnly === '/billing/webhook' && method === 'POST') {
    return true;
  }

  if (method === 'POST' && (pathOnly === '/playground/extract' || pathOnly === '/playground/estimate')) {
    return true;
  }

  return false;
}

/**
 * Validates the x-api-key header and enforces credit and rate limits.
 * @param config - Application configuration
 * @returns Fastify onRequest hook handler
 */
export function createAuthHook(config: AppConfig) {
  return async function authHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (isPublicRoute(request.url, request.method)) {
      return;
    }

    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey !== 'string') {
      const error = unauthorizedError();
      request.log.warn({ path: request.url }, 'unauthorized request');
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    const validated = validateApiKey(apiKey);
    if (!validated) {
      const error = unauthorizedError();
      request.log.warn({ path: request.url }, 'unauthorized request');
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    request.apiKeyPrefix = validated.keyPrefix;
    request.userId = validated.userId;
    request.plan = validated.plan;
    request.keyId = validated.keyId;

    const limit = checkLimit(validated.userId, validated.plan);
    if (!limit.allowed) {
      const error = creditLimitReachedError(
        limit.used,
        limit.limit,
        validated.plan,
        config.blohBaseUrl,
      );
      request.log.warn(
        { user_id: validated.userId, used: limit.used, limit: limit.limit },
        'credit limit reached',
      );
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    if (!checkRateLimit(validated.keyId)) {
      const error = rateLimitedError();
      request.log.warn(
        { api_key_prefix: request.apiKeyPrefix, path: request.url },
        'rate limit exceeded',
      );
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
  };
}

/**
 * Resets rate limit state. Intended for testing only.
 */
export function resetRateLimitState(): void {
  rateLimitMap.clear();
  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    apiKeyPrefix?: string;
    userId?: string;
    plan?: string;
    keyId?: string;
  }
}

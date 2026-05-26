import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../types/index.js';
import {
  handleEstimate,
  handleExtraction,
  logPlaygroundRequest,
  sendExtractionError,
} from '../services/extraction-handler.js';
import { BlohError, playgroundRateLimitedError } from '../utils/errors.js';
import { logRequest } from '../utils/logger.js';

const PLAYGROUND_LIMIT = 3;
const PLAYGROUND_WINDOW_MS = 86_400_000;
const CLEANUP_INTERVAL_MS = 60_000;

/** Tracks playground usage per client IP within a daily window. */
interface PlaygroundRateEntry {
  count: number;
  resetAt: number;
}

/** In-memory playground rate limit store keyed by client IP. */
const playgroundRateMap = new Map<string, PlaygroundRateEntry>();

/** Periodic cleanup timer for expired playground rate entries. */
let playgroundCleanupTimer: ReturnType<typeof setInterval> | null = null;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(moduleDir, '../../public');

/**
 * Removes expired entries from the playground rate limit map.
 */
function cleanupPlaygroundRateMap(): void {
  const now = Date.now();
  for (const [key, entry] of playgroundRateMap) {
    if (entry.resetAt <= now) {
      playgroundRateMap.delete(key);
    }
  }
}

/**
 * Starts periodic cleanup of the playground rate limit map if not already running.
 */
function ensurePlaygroundCleanupRunning(): void {
  if (playgroundCleanupTimer === null) {
    playgroundCleanupTimer = setInterval(cleanupPlaygroundRateMap, CLEANUP_INTERVAL_MS);
    playgroundCleanupTimer.unref();
  }
}

/**
 * Resolves the client IP address from a Fastify request.
 * @param request - Incoming Fastify request
 * @returns Client IP string
 */
function getClientIp(request: FastifyRequest): string {
  return request.ip;
}

/**
 * Checks and increments the playground rate limit for a client IP.
 * @param clientIp - Client IP address
 * @returns True if the request is within the daily limit
 */
function checkPlaygroundRateLimit(clientIp: string): boolean {
  ensurePlaygroundCleanupRunning();
  const now = Date.now();
  const existing = playgroundRateMap.get(clientIp);

  if (!existing || existing.resetAt <= now) {
    playgroundRateMap.set(clientIp, {
      count: 1,
      resetAt: now + PLAYGROUND_WINDOW_MS,
    });
    return true;
  }

  if (existing.count >= PLAYGROUND_LIMIT) {
    return false;
  }

  existing.count += 1;
  return true;
}

/**
 * Resets playground rate limit state. Intended for testing only.
 */
export function resetPlaygroundRateLimitState(): void {
  playgroundRateMap.clear();
  if (playgroundCleanupTimer !== null) {
    clearInterval(playgroundCleanupTimer);
    playgroundCleanupTimer = null;
  }
}

/**
 * Handles playground rate limit check and error response.
 * @param request - Fastify request
 * @param reply - Fastify reply
 * @param clientIp - Client IP address
 * @param start - Request start timestamp
 * @returns True if request should proceed
 */
async function enforcePlaygroundRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  clientIp: string,
  start: number,
): Promise<boolean> {
  if (checkPlaygroundRateLimit(clientIp)) {
    return true;
  }

  const error = playgroundRateLimitedError();
  request.log.warn({ client_ip: clientIp }, 'playground rate limit exceeded');
  logRequest(request.log, {
    method: request.method,
    path: request.url,
    status_code: error.statusCode,
    processing_time_ms: Date.now() - start,
    api_key_prefix: 'playground',
  });
  await sendExtractionError(reply, error);
  return false;
}

/**
 * Registers static file serving and playground routes.
 * @param app - Fastify instance
 * @param config - Application configuration
 */
export async function registerUiRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: '/',
    decorateReply: true,
  });

  app.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('index.html');
  });

  app.get('/dashboard', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('dashboard.html');
  });

  app.get('/login', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('login.html');
  });

  app.get('/signup', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('signup.html');
  });

  app.get('/docs', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('docs.html');
  });

  app.post(
    '/playground/estimate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const start = Date.now();
      const clientIp = getClientIp(request);
      logPlaygroundRequest(request.log, clientIp, request.url, 'estimate');

      const allowed = await enforcePlaygroundRateLimit(request, reply, clientIp, start);
      if (!allowed) {
        return;
      }

      try {
        const result = await handleEstimate(request, reply, config, {
          apiKeyPrefix: 'playground',
          path: request.url,
        });
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof BlohError && reply.sent) {
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/playground/extract',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const start = Date.now();
      const clientIp = getClientIp(request);
      logPlaygroundRequest(request.log, clientIp, request.url, 'extract');

      const allowed = await enforcePlaygroundRateLimit(request, reply, clientIp, start);
      if (!allowed) {
        return;
      }

      try {
        const result = await handleExtraction(request, reply, config, {
          apiKeyPrefix: 'playground',
          path: request.url,
        });
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof BlohError && reply.sent) {
          return;
        }
        throw error;
      }
    },
  );
}

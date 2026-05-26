import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, validateSession } from '../services/sessions.js';
import { BlohError } from '../utils/errors.js';

/**
 * Creates a BlohError for unauthenticated session requests.
 * @returns BlohError with UNAUTHORIZED code
 */
function sessionUnauthorizedError(): BlohError {
  return new BlohError('UNAUTHORIZED', 'Authentication required', 401);
}

/**
 * Reads the session token from the request cookie.
 * @param request - Fastify request
 * @returns Session token or null
 */
export function getSessionToken(request: FastifyRequest): string | null {
  const token = request.cookies[SESSION_COOKIE];
  return typeof token === 'string' ? token : null;
}

/**
 * Requires a valid session and attaches the user to the request.
 * @param request - Fastify request
 * @param reply - Fastify reply
 * @returns True if authenticated
 */
export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const token = getSessionToken(request);
  if (!token) {
    const error = sessionUnauthorizedError();
    await reply.status(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message },
    });
    return false;
  }

  const user = validateSession(token);
  if (!user) {
    const error = sessionUnauthorizedError();
    await reply.status(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message },
    });
    return false;
  }

  request.sessionUser = user;
  return true;
}

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser?: {
      id: string;
      email: string;
      plan: string;
      createdAt: string;
    };
  }
}

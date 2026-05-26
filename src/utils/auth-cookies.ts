import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../types/index.js';
import { SESSION_COOKIE } from '../services/sessions.js';

/**
 * Sets the session cookie on the response.
 * @param reply - Fastify reply
 * @param config - Application config
 * @param token - Session token
 */
export function setSessionCookie(
  reply: FastifyReply,
  config: AppConfig,
  token: string,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 86_400,
  });
}

/**
 * Clears the session cookie.
 * @param reply - Fastify reply
 */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

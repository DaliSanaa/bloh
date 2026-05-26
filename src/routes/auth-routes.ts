import { clerkClient, getAuth } from '@clerk/fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../types/index.js';
import {
  consumePendingWelcomeKey,
  syncClerkUser,
} from '../services/clerk-users.js';
import {
  createSession,
  deleteSession,
  validateSession,
} from '../services/sessions.js';
import { clearSessionCookie, setSessionCookie } from '../utils/auth-cookies.js';
import { getSessionToken } from '../middleware/session.js';

/**
 * Resolves the primary email from a Clerk user record.
 * @param clerkUserId - Clerk user ID
 * @returns Primary email or null
 */
async function getClerkPrimaryEmail(clerkUserId: string): Promise<string | null> {
  const user = await clerkClient.users.getUser(clerkUserId);
  const email = user.primaryEmailAddress?.emailAddress;
  return typeof email === 'string' && email.length > 0 ? email : null;
}

/**
 * Registers authentication routes backed by Clerk.
 * @param app - Fastify instance
 * @param config - Application configuration
 */
export async function registerAuthRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get('/auth/config', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      publishableKey: config.clerkPublishableKey,
      signInUrl: '/login',
      signUpUrl: '/signup',
      afterAuthUrl: '/auth/clerk/callback',
    });
  });

  app.get('/auth/clerk/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { isAuthenticated, userId } = getAuth(request);

      if (!isAuthenticated || !userId) {
        request.log.warn('clerk callback without authenticated session');
        return reply.redirect(`${config.blohBaseUrl}/login?error=auth_failed`);
      }

      const email = await getClerkPrimaryEmail(userId);
      if (!email) {
        request.log.warn({ clerk_user_id: userId }, 'clerk user missing email');
        return reply.redirect(`${config.blohBaseUrl}/login?error=auth_email`);
      }

      const result = syncClerkUser(userId, email);
      const token = createSession(result.userId);
      setSessionCookie(reply, config, token);

      request.log.info(
        { user_id: result.userId, clerk_user_id: userId, is_new: result.isNewUser },
        'clerk user synced',
      );

      if (result.isNewUser) {
        return reply.redirect(`${config.blohBaseUrl}/dashboard?welcome=1`);
      }

      return reply.redirect(`${config.blohBaseUrl}/dashboard`);
    } catch (error) {
      request.log.error({ err: error }, 'clerk callback failed');
      return reply.redirect(`${config.blohBaseUrl}/login?error=auth_failed`);
    }
  });

  app.get('/auth/clerk/welcome-key', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getSessionToken(request);
    if (!token) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const user = validateSession(token);
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const apiKey = consumePendingWelcomeKey(user.id);
    if (!apiKey) {
      return reply.status(404).send({
        success: false,
        error: { code: 'INVALID_SCHEMA', message: 'No welcome key available' },
      });
    }

    return reply.send({
      success: true,
      apiKey,
      message: 'Save your API key now. It will not be shown again.',
    });
  });

  app.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getSessionToken(request);
    if (token) {
      deleteSession(token);
    }
    clearSessionCookie(reply);
    return reply.send({ success: true });
  });

  app.get('/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getSessionToken(request);
    if (!token) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const user = validateSession(token);
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    return reply.send({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        createdAt: user.createdAt,
      },
    });
  });
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../types/index.js';
import { generateApiKey, listApiKeys, revokeApiKey } from '../services/api-keys.js';
import {
  createBillingPortalSession,
  createCheckoutSession,
} from '../services/billing.js';
import { checkLimit, getUsageHistory } from '../services/usage.js';
import { requireSession } from '../middleware/session.js';
import { BlohError } from '../utils/errors.js';

/** Upgrade request body. */
interface UpgradeBody {
  plan?: string;
}

/** Create key request body. */
interface CreateKeyBody {
  name?: string;
}

/**
 * Registers account management routes.
 * @param app - Fastify instance
 * @param config - Application configuration
 */
export async function registerAccountRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get('/account/usage', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireSession(request, reply))) {
      return;
    }

    const user = request.sessionUser!;
    const limitInfo = checkLimit(user.id, user.plan);
    const history = getUsageHistory(user.id, 6);

    return reply.send({
      plan: user.plan,
      used: limitInfo.used,
      limit: limitInfo.limit,
      remaining: limitInfo.remaining,
      history,
    });
  });

  app.get('/account/keys', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireSession(request, reply))) {
      return;
    }

    const keys = listApiKeys(request.sessionUser!.id);
    return reply.send({ keys });
  });

  app.post('/account/keys', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireSession(request, reply))) {
      return;
    }

    try {
      const body = request.body as CreateKeyBody;
      const name = typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : 'Default';
      const { key, keyPrefix } = generateApiKey(request.sessionUser!.id, name);

      return reply.status(201).send({
        key,
        keyPrefix,
        message: 'Save your API key now. It will not be shown again.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create key';
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SCHEMA', message },
      });
    }
  });

  app.delete('/account/keys/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireSession(request, reply))) {
      return;
    }

    const params = request.params as { id?: string };
    if (!params.id) {
      throw new BlohError('INVALID_SCHEMA', 'Key ID required', 400);
    }

    const revoked = revokeApiKey(params.id, request.sessionUser!.id);
    if (!revoked) {
      return reply.status(404).send({
        success: false,
        error: { code: 'INVALID_SCHEMA', message: 'Key not found' },
      });
    }

    return reply.send({ success: true });
  });

  app.post('/account/upgrade', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireSession(request, reply))) {
      return;
    }

    const body = request.body as UpgradeBody;
    if (body.plan !== 'pro' && body.plan !== 'max') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SCHEMA', message: 'Plan must be pro or max' },
      });
    }

    const checkoutUrl = await createCheckoutSession(
      { config },
      request.sessionUser!.id,
      body.plan,
      `${config.blohBaseUrl}/dashboard?upgraded=1`,
      `${config.blohBaseUrl}/dashboard`,
    );

    return reply.send({ checkoutUrl });
  });

  app.post('/account/billing-portal', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireSession(request, reply))) {
      return;
    }

    const portalUrl = await createBillingPortalSession(
      { config },
      request.sessionUser!.id,
      `${config.blohBaseUrl}/dashboard`,
    );

    return reply.send({ portalUrl });
  });
}

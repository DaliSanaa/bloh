import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../types/index.js';
import { handleWebhook } from '../services/billing.js';
import { BlohError } from '../utils/errors.js';

/**
 * Registers Stripe billing webhook route with raw body parsing.
 * @param app - Fastify instance
 * @param config - Application configuration
 */
export async function registerBillingRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  await app.register(async (webhookApp) => {
    webhookApp.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => {
        done(null, body);
      },
    );

    webhookApp.post('/billing/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        const error = new BlohError('INVALID_SCHEMA', 'Missing Stripe signature', 400);
        return reply.status(error.statusCode).send({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }

      const payload = request.body as Buffer;
      if (!Buffer.isBuffer(payload)) {
        const error = new BlohError('INVALID_SCHEMA', 'Invalid webhook payload', 400);
        return reply.status(error.statusCode).send({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }

      try {
        await handleWebhook({ config }, payload, signature, request.log);
        return reply.status(200).send({ received: true });
      } catch (error) {
        request.log.error({ err: error }, 'webhook verification failed');
        const blohError = new BlohError(
          'INVALID_SCHEMA',
          'Webhook signature verification failed',
          400,
        );
        return reply.status(blohError.statusCode).send({
          success: false,
          error: { code: blohError.code, message: blohError.message },
        });
      }
    });
  });
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../types/index.js';
import { handleEstimate } from '../services/extraction-handler.js';
import { BlohError } from '../utils/errors.js';

/**
 * Registers the POST /estimate route handler.
 * @param app - Fastify instance
 * @param config - Application configuration
 */
export async function registerEstimateRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.post('/estimate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await handleEstimate(request, reply, config, {
        apiKeyPrefix: request.apiKeyPrefix ?? 'unknown',
        path: request.url,
      });
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof BlohError && reply.sent) {
        return;
      }
      throw error;
    }
  });
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../types/index.js';
import { handleExtraction } from '../services/extraction-handler.js';
import { BlohError } from '../utils/errors.js';

/**
 * Registers the POST /extract route handler.
 * @param app - Fastify instance
 * @param config - Application configuration
 */
export async function registerExtractRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.post('/extract', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await handleExtraction(request, reply, config, {
        apiKeyPrefix: request.apiKeyPrefix ?? 'unknown',
        path: request.url,
        keyId: request.keyId,
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

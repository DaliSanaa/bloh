import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { clerkPlugin } from '@clerk/fastify';
import Fastify from 'fastify';
import { loadConfig } from './config/env.js';
import { initDatabase } from './services/database.js';
import { createAuthHook } from './middleware/auth.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerEstimateRoutes } from './routes/estimate.js';
import { registerExtractRoutes } from './routes/extract.js';
import { registerUiRoutes } from './routes/ui.js';
import { healthResponseSchema } from './schemas/extract.js';

/**
 * Builds and configures the Fastify application instance.
 * @returns Configured Fastify server
 */
export async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const config = loadConfig();
  initDatabase(config.databasePath);

  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    trustProxy: config.trustProxy,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https://api.clerk.dev', 'https://*.clerk.accounts.dev'],
      },
    },
  });

  if (config.corsOrigin.length > 0) {
    await app.register(cors, {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    });
  }

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(formbody);
  await app.register(clerkPlugin, {
    publishableKey: config.clerkPublishableKey,
    secretKey: config.clerkSecretKey,
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: 1,
    },
  });

  await registerBillingRoutes(app, config);

  app.addHook('onRequest', createAuthHook(config));

  app.get('/health', {
    schema: {
      response: {
        200: healthResponseSchema,
      },
    },
  }, async (_request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  await registerUiRoutes(app, config);
  await registerAuthRoutes(app, config);
  await registerAccountRoutes(app, config);
  await registerEstimateRoutes(app, config);
  await registerExtractRoutes(app, config);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'unhandled error');
    void reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  return app;
}

/**
 * Starts the Bloh API server.
 */
async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildServer();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info({ port: config.port }, 'Bloh server started');
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to start server: ${message}\n`);
  process.exit(1);
});

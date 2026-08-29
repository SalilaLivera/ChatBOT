import express from 'express';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './logging/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { healthRouter } from './routes/health.routes.js';

export function buildApp(): express.Express {
  const app = express();

  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);

  app.use(errorHandler);

  return app;
}

export function start(): void {
  const app = buildApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'server listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutdown signal received, closing server');
    server.close((err) => {
      if (err) {
        logger.error({ err: err.message }, 'error during shutdown');
        process.exit(1);
      }
      logger.info('server closed cleanly');
      process.exit(0);
    });

    // Force-exit if connections do not drain in time.
    setTimeout(() => {
      logger.error('shutdown grace period exceeded, forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

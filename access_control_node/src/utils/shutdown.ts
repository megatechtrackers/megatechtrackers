/**
 * Graceful shutdown handling
 */
import { Server } from 'http';
import { Logger } from 'winston';

export function gracefulShutdown(
  server: Server,
  logger: Logger,
  cleanup?: () => Promise<void>
) {
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, starting graceful shutdown`);
    
    // Run cleanup if provided
    if (cleanup) {
      try {
        await cleanup();
      } catch (error) {
        logger.error('Cleanup error', { error });
      }
    }
    
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', { error });
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.error('Unhandled rejection', { reason, promise });
    shutdown('unhandledRejection');
  });
}

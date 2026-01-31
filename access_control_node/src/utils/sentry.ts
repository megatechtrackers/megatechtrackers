/**
 * Sentry error tracking and monitoring
 */
import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

let isInitialized = false;

/**
 * Initialize Sentry
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || 'development';
  
  if (!dsn) {
    logger.info('Sentry DSN not provided, skipping initialization');
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
      profilesSampleRate: environment === 'production' ? 0.1 : 1.0,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.expressIntegration(),
      ],
      beforeSend(event: Sentry.ErrorEvent, _hint?: Sentry.EventHint) {
        // Filter out sensitive data
        if (event.request) {
          // Remove sensitive headers
          if (event.request.headers) {
            delete event.request.headers['Authorization'];
            delete event.request.headers['X-Frappe-Session-Id'];
            delete event.request.headers['Cookie'];
          }
        }
        return event;
      },
    });

    isInitialized = true;
    logger.info('Sentry initialized', { environment });
  } catch (error) {
    logger.error('Failed to initialize Sentry', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Capture exception
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!isInitialized) {
    logger.error('Sentry not initialized', { error: error.message, context });
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!isInitialized) {
    logger.info('Sentry not initialized', { message });
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Set user context
 */
export function setUserContext(user: { id?: string; username?: string; email?: string }): void {
  if (!isInitialized) {
    return;
  }

  Sentry.setUser({
    id: user.id,
    username: user.username,
    email: user.email,
  });
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  if (!isInitialized) {
    return;
  }

  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Start transaction
 */
export function startTransaction(name: string, op: string): Sentry.Span | undefined {
  if (!isInitialized) {
    return undefined;
  }

  return Sentry.startInactiveSpan({
    name,
    op,
    forceTransaction: true,
  });
}

/**
 * Flush Sentry events (useful before shutdown)
 */
export async function flushSentry(timeout: number = 2000): Promise<void> {
  if (!isInitialized) {
    return;
  }

  try {
    await Sentry.flush(timeout);
    logger.info('Sentry events flushed');
  } catch (error) {
    logger.error('Failed to flush Sentry events', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}


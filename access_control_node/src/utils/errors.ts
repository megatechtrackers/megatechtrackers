/**
 * Custom error classes for better error handling
 */
import { ApiError, ValidationError as ValidationErrorType } from '../types/index.js';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toApiError(): ApiError {
    return {
      error: this.message,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public validationErrors: ValidationErrorType[]
  ) {
    super(message, 400, 'VALIDATION_ERROR');
  }

  toApiError(): ApiError {
    return {
      ...super.toApiError(),
      errors: this.validationErrors,
    };
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class GrafanaError extends AppError {
  constructor(message: string, statusCode: number = 502) {
    super(`Grafana error: ${message}`, statusCode, 'GRAFANA_ERROR');
  }
}

export class FrappeError extends AppError {
  constructor(message: string, statusCode: number = 502) {
    super(`Frappe error: ${message}`, statusCode, 'FRAPPE_ERROR');
  }
}

import { RetryOptions } from '../types';

export function calculateBackoff(
  attempt: number, 
  baseDelay: number = 1000, 
  maxDelay: number = 60000,
  strategy: 'exponential' | 'linear' | 'fixed' = 'exponential'
): number {
  let delay: number;
  
  switch (strategy) {
    case 'linear':
      delay = Math.min(baseDelay * attempt, maxDelay);
      break;
    case 'fixed':
      delay = baseDelay;
      break;
    case 'exponential':
    default:
      delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      break;
  }
  
  // Add jitter (75-125% of calculated delay) to prevent thundering herd
  const jitter = delay * (0.75 + Math.random() * 0.5);
  return Math.floor(jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 60000,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!shouldRetry(error)) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = calculateBackoff(attempt, baseDelay, maxDelay);
        onRetry(attempt, delay, error);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

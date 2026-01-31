/**
 * Simple concurrency limiter - CommonJS compatible replacement for p-limit
 * Limits the number of concurrent promise executions
 */

interface LimitFunction {
  <T>(fn: () => Promise<T>): Promise<T>;
  readonly activeCount: number;
  readonly pendingCount: number;
  clearQueue: () => void;
}

export function pLimit(concurrency: number): LimitFunction {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('Expected `concurrency` to be a number >= 1');
  }

  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const nextFn = queue.shift();
      if (nextFn) {
        nextFn();
      }
    }
  };

  const run = async <T>(fn: () => Promise<T>, resolve: (value: T) => void, reject: (error: any) => void) => {
    activeCount++;
    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    }
    next();
  };

  const enqueue = <T>(fn: () => Promise<T>, resolve: (value: T) => void, reject: (error: any) => void) => {
    queue.push(() => run(fn, resolve, reject));
    
    // Use queueMicrotask for better scheduling (similar to p-limit behavior)
    queueMicrotask(() => {
      if (activeCount < concurrency && queue.length > 0) {
        const nextFn = queue.shift();
        if (nextFn) {
          nextFn();
        }
      }
    });
  };

  const generator = <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      enqueue(fn, resolve, reject);
    });
  };

  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount,
    },
    pendingCount: {
      get: () => queue.length,
    },
    clearQueue: {
      value: () => {
        queue.length = 0;
      },
    },
  });

  return generator as LimitFunction;
}

export default pLimit;

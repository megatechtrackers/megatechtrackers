/**
 * Response compression middleware
 */
import compression from 'compression';
import { Request, Response } from 'express';

export function compressionMiddleware() {
  return compression({
    filter: (req: Request, res: Response) => {
      // Don't compress responses if this request-header is missing
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Use compression filter function
      return compression.filter(req, res);
    },
    level: 6, // Compression level (0-9)
    threshold: 1024, // Only compress responses larger than 1KB
  });
}

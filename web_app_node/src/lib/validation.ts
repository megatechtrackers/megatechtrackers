/**
 * Input validation utilities using Zod
 */
import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const embedUrlRequestSchema = z.object({
  reportId: z.number().int().positive(),
  reportUid: z.string().optional(),
  filters: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  frappeUser: z.string().email(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type EmbedUrlRequestInput = z.infer<typeof embedUrlRequestSchema>;

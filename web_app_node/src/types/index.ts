/**
 * Shared TypeScript types for Next.js application
 */

export interface User {
  username: string;
  email?: string;
  roles?: string[];
}

export interface Form {
  name: string;
  label: string;
  url?: string;
  inherited?: boolean;
  source?: string;
}

export interface Report {
  id: number;
  uid?: string;
  name: string;
  context?: {
    vehicles?: string[];
    companies?: string[];
    departments?: string[];
  };
  inherited?: boolean;
  source?: string;
}

export interface UserContext {
  vehicles: string[];
  companies: string[];
  departments: string[];
}

export interface UserPermissions {
  forms: Form[];
  reports: Report[];
  context: UserContext;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface EmbedUrlRequest {
  reportId: number;
  reportUid?: string;
  filters?: Record<string, string | string[]>;
  frappeUser: string;
}

export interface EmbedUrlResponse {
  success: boolean;
  embedUrl: string;
  expiresAt: string;
}

export interface User {
  username: string;
  email?: string;
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

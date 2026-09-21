import { Request } from 'express';

export type UserRoleType =
  | 'Administrator'
  | 'Supervising Officer'
  | 'Issuing Officer'
  | 'Viewer / Auditor'
  | 'Viewer'
  | string;

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  role: UserRoleType;
  department: string;
  employeeId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  code?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

import { CallStatus, CallDirection, TemplateCategory } from '../schemas';

export interface ICallResponse {
  id: string;
  userId: string;
  phoneNumber: string;
  direction: CallDirection;
  status: CallStatus;
  templateId?: string;
  templateName?: string;
  variables?: Record<string, any>;
  externalCallId?: string;
  startedAt?: string;
  endedAt?: string;
  duration?: number;
  recordingUrl?: string;
  transcriptText?: string;
  callData?: Record<string, any>;
  cost?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICallTemplateResponse {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  systemPrompt: string;
  requiredVariables?: string[];
  isPublic: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IPaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IPaginationQuery {
  page?: number;
  limit?: number;
  status?: CallStatus;
  search?: string;
}

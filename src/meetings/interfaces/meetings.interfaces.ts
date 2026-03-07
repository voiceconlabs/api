export interface IMeetingResponse {
  id: string;
  userId: string;
  teamId?: string;
  title: string;
  description?: string;
  meetingUrl?: string;
  platform: string;
  status: string;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  duration: number;
  participants: IParticipantResponse[];
  recordingUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IParticipantResponse {
  name: string;
  email?: string;
  speakerId?: string;
  role: string;
}

export interface ITranscriptResponse {
  id: string;
  meetingId: string;
  language: string;
  segments: ITranscriptSegmentResponse[];
  fullText?: string;
  createdAt: string;
}

export interface ITranscriptSegmentResponse {
  speaker: string;
  speakerId?: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface ISummaryResponse {
  id: string;
  meetingId: string;
  template: string;
  purpose?: string;
  overview?: string;
  keyTakeaways: string[];
  decisions: string[];
  nextSteps: string[];
  topics: ISummaryTopicResponse[];
  sentiment?: string;
  talkTimeStats: ITalkTimeStatsResponse[];
  createdAt: string;
}

export interface ISummaryTopicResponse {
  title: string;
  summary: string;
  startTime?: number;
  endTime?: number;
}

export interface ITalkTimeStatsResponse {
  speaker: string;
  percentage: number;
  totalSeconds: number;
}

export interface IActionItemResponse {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  assignee?: string;
  dueDate?: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface IPaginationQuery {
  page?: number;
  limit?: number;
  status?: string;
  platform?: string;
  search?: string;
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

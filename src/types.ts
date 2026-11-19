export interface Apartment {
  id: string;
  name: string;
  officeName: string;
  companyId: string;
  createdAt: string;
}

export interface Worker {
  id: string;
  apartmentId: string;
  name: string;
  role: string;
  createdAt: string;
}

export type WorkStatus = 'urgent' | 'pending' | 'in_progress' | 'completed';

export interface WorkLog {
  id: string;
  apartmentId: string;
  workerId: string;
  workerName: string;
  workerRole: string;
  workDate: string;
  location: string;
  content: string;
  status: WorkStatus;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notice {
  id: string;
  apartmentId: string;
  title: string;
  content: string;
  isPinned: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Handover {
  id: string;
  apartmentId: string;
  workerId: string;
  workerName: string;
  workerRole: string;
  targetShift: string;
  content: string;
  status: 'pending' | 'completed';
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BannerCategory = 'wedding' | 'funeral' | 'celebration' | 'notice';

export interface EventBanner {
  id: string;
  apartmentId: string;
  category: BannerCategory;
  title: string;
  subtitle: string;
  eventDate: string;
  eventLocation: string;
  contactInfo: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AdSlotMode = 'inquiry' | 'custom' | 'adsense' | 'adfit' | 'hidden';

export interface ExternalAdConfig {
  apartmentId: string;
  mode: AdSlotMode;
  sponsorName: string;
  headline: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  ctaLabel: string;
  contactInfo: string;
  adsenseClientId: string;
  adsenseSlotId: string;
  adfitUnitId: string;
  updatedAt: string;
}

export interface AdSlotStateResponse {
  adSlot: ExternalAdConfig;
  globalAdSlot: ExternalAdConfig;
  hasApartmentOverride: boolean;
}

export interface SessionInfo {
  authenticated: boolean;
  isAdmin: boolean;
  isMaster?: boolean;
  companyId: string;
  apartmentId: string;
  apartmentName: string;
  officeName: string;
}

export type ChatRoomId = 'general' | 'urgent';

export interface ChatMessage {
  id: string;
  apartmentId: string;
  roomId: ChatRoomId;
  workerId: string;
  workerName: string;
  workerRole: string;
  message: string;
  imageUrl: string | null;
  replyToId: string | null;
  replyToSender: string | null;
  replyToText: string | null;
  createdAt: string;
}

export interface ChatOnlineUser {
  workerId: string;
  workerName: string;
  workerRole: string;
}

export interface ChatRealtimePacket {
  type?:
    | 'chat:message'
    | 'chat:deleted'
    | 'chat:presence'
    | 'chat:typing'
    | 'worklog:urgent'
    | 'worklog:updated'
    | 'worklog:deleted'
    | string;
  message?: ChatMessage;
  chatMessage?: ChatMessage;
  log?: WorkLog;
  id?: string;
  roomId?: ChatRoomId;
  onlineUsers?: ChatOnlineUser[];
  workerId?: string;
  workerName?: string;
}


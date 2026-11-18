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

export type WorkStatus = 'pending' | 'in_progress' | 'completed';

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

export interface SessionInfo {
  authenticated: boolean;
  isAdmin: boolean;
  companyId: string;
  apartmentId: string;
  apartmentName: string;
  officeName: string;
}

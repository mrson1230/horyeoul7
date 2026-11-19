import type { WorkLog } from '../types';

const SEEN_URGENT_KEY = 'horyeoul7_seen_urgent_log_ids';

export type BrowserNotificationState = NotificationPermission | 'unsupported';

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): BrowserNotificationState {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationState> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function getSeenUrgentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_URGENT_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(String));
    }
  } catch {
    // Ignore storage parse error
  }
  return new Set();
}

export function markUrgentIdSeen(logId: string): void {
  try {
    const current = Array.from(getSeenUrgentIds());
    if (!current.includes(logId)) {
      current.push(logId);
      const trimmed = current.slice(-100);
      localStorage.setItem(SEEN_URGENT_KEY, JSON.stringify(trimmed));
    }
  } catch {
    // Ignore storage error
  }
}

export function sendUrgentWorkBrowserNotification(
  log: WorkLog,
  apartmentName: string,
  onClick?: () => void
): boolean {
  if (!isBrowserNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const title = `🚨 [${apartmentName}] 긴급 작업 등록`;
    const body = `${log.location} (${log.workerName})\n${log.content}`;
    const notification = new Notification(title, {
      body,
      icon: '/src/assets/images/horyeoul_apartment_logo_1795090158112.jpg',
      tag: `urgent-worklog-${log.id}`,
      requireInteraction: true,
    });

    notification.onclick = () => {
      try {
        window.focus();
        onClick?.();
        notification.close();
      } catch {
        // Ignore focus errors in restricted frames
      }
    };
    return true;
  } catch {
    return false;
  }
}

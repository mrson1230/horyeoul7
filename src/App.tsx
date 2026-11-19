import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  LogOut,
  Megaphone,
  MessageCircle,
  PenSquare,
  RefreshCw,
  Siren,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { BottomAdSlot } from './components/BottomAdSlot';
import { EditLogModal } from './components/EditLogModal';
import { EventBannerCard } from './components/EventBannerCard';
import { LoginView } from './components/LoginView';
import { NoticeHandoverView } from './components/NoticeHandoverView';
import { StaffChatView } from './components/StaffChatView';
import { WorkCalendarView } from './components/WorkCalendarView';
import { WorkLogComposer } from './components/WorkLogComposer';
import { WorkLogFeed } from './components/WorkLogFeed';
import {
  apiFetch,
  getStoredMemoryWorkers,
  getStoredToken,
  getStoredWorkerId,
  setStoredMemoryWorkers,
  setStoredToken,
  setStoredWorkerId,
} from './utils/api';
import type { StorageMode } from './utils/api';
import {
  getBrowserNotificationPermission,
  getSeenUrgentIds,
  markUrgentIdSeen,
  requestBrowserNotificationPermission,
  sendUrgentWorkBrowserNotification,
} from './utils/notifications';
import type { BrowserNotificationState } from './utils/notifications';
import type {
  AdSlotStateResponse,
  ChatMessage,
  ChatOnlineUser,
  ChatRealtimePacket,
  ChatRoomId,
  EventBanner,
  ExternalAdConfig,
  Handover,
  Notice,
  SessionInfo,
  Worker,
  WorkLog,
  WorkStatus,
} from './types';

const DEFAULT_AD_SLOT: ExternalAdConfig = {
  apartmentId: 'apt-horyeoul7',
  mode: 'inquiry',
  sponsorName: '지역 상가 · 파트너 광고 영역',
  headline: '이 자리에 외부 광고 및 제휴 배너를 게재할 수 있습니다',
  description:
    '단지 인근 상가·협력업체 배너, Google AdSense, 카카오 애드핏 연동을 지원합니다.',
  imageUrl: '',
  linkUrl: '',
  ctaLabel: '자세히 보기',
  contactInfo: '관리자 메뉴 > 하단 외부 광고 설정에서 변경 가능',
  adsenseClientId: '',
  adsenseSlotId: '',
  adfitUnitId: '',
  updatedAt: '',
};

const HERO_APARTMENT_IMAGE =
  '/src/assets/images/apartment_complex_hero_1794999359810.jpg';
const APARTMENT_LOGO_IMAGE =
  '/src/assets/images/horyeoul_apartment_logo_1795090158112.jpg';

const CHAT_LAST_READ_KEY = 'horyeoul7_last_read_chat_at';

function getStoredChatLastRead(): string {
  try {
    return localStorage.getItem(CHAT_LAST_READ_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredChatLastRead(iso: string): void {
  try {
    localStorage.setItem(CHAT_LAST_READ_KEY, iso);
  } catch {
    // Ignore storage errors
  }
}

type ActiveTab =
  | 'workspace'
  | 'feed'
  | 'calendar'
  | 'chat'
  | 'notice_handover'
  | 'admin';

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [storageMode, setStorageMode] = useState<StorageMode | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(
    getStoredWorkerId()
  );

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [banners, setBanners] = useState<EventBanner[]>([]);
  const [adSlot, setAdSlot] = useState<ExternalAdConfig>(DEFAULT_AD_SLOT);
  const [globalAdSlot, setGlobalAdSlot] =
    useState<ExternalAdConfig>(DEFAULT_AD_SLOT);
  const [hasApartmentOverride, setHasApartmentOverride] = useState(false);

  const [filterWorkerId, setFilterWorkerId] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | WorkStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [logoImgFailed, setLogoImgFailed] = useState(false);
  const [calendarRefreshTick, setCalendarRefreshTick] = useState(0);
  const [composerPrefillDate, setComposerPrefillDate] = useState<{
    date: string;
    seq: number;
  } | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [urgentLogs, setUrgentLogs] = useState<WorkLog[]>([]);
  const [liveUrgentAlert, setLiveUrgentAlert] = useState<WorkLog | null>(null);
  const [requestedChatRoom, setRequestedChatRoom] = useState<{
    roomId: ChatRoomId;
    seq: number;
  } | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationState>(() => getBrowserNotificationPermission());

  const [wsSupported, setWsSupported] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<ChatOnlineUser[]>([]);
  const [typingByRoom, setTypingByRoom] = useState<
    Record<ChatRoomId, string | null>
  >({
    general: null,
    urgent: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const chatListenersRef = useRef<
    Set<(packet: ChatRealtimePacket) => void>
  >(new Set());
  const typingTimersRef = useRef<
    Record<ChatRoomId, ReturnType<typeof setTimeout> | null>
  >({
    general: null,
    urgent: null,
  });
  const activeTabRef = useRef<ActiveTab>(activeTab);
  activeTabRef.current = activeTab;
  const selectedWorkerIdRef = useRef<string>(selectedWorkerId);
  selectedWorkerIdRef.current = selectedWorkerId;
  const workersRef = useRef<Worker[]>(workers);
  workersRef.current = workers;
  const apartmentNameRef = useRef<string>(
    session?.apartmentName || '공동 작업일지'
  );
  apartmentNameRef.current = session?.apartmentName || '공동 작업일지';
  const urgentBaselineLoadedRef = useRef<boolean>(false);

  const handleMarkChatRead = useCallback(() => {
    setStoredChatLastRead(new Date().toISOString());
    setUnreadChatCount(0);
  }, []);

  const switchTab = useCallback(
    (nextTab: ActiveTab) => {
      setActiveTab(nextTab);
      if (nextTab === 'chat') {
        handleMarkChatRead();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [handleMarkChatRead]
  );

  const openUrgentChatRoom = useCallback(() => {
    setRequestedChatRoom((prev) => ({
      roomId: 'urgent',
      seq: (prev?.seq || 0) + 1,
    }));
    setLiveUrgentAlert(null);
    switchTab('chat');
  }, [switchTab]);

  const handleRequestNotificationPermission = useCallback(async () => {
    const next = await requestBrowserNotificationPermission();
    setNotificationPermission(next);
  }, []);

  const subscribeChatEvents = useCallback(
    (listener: (packet: ChatRealtimePacket) => void) => {
      chatListenersRef.current.add(listener);
      return () => {
        chatListenersRef.current.delete(listener);
      };
    },
    []
  );

  const handleEmitTyping = useCallback((roomId: ChatRoomId) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat:typing', roomId }));
    }
  }, []);

  const notifyIncomingUrgentLog = useCallback(
    (log: WorkLog, showBanner = true) => {
      markUrgentIdSeen(log.id);
      if (showBanner) {
        setLiveUrgentAlert(log);
      }
      sendUrgentWorkBrowserNotification(
        log,
        apartmentNameRef.current,
        () => {
          setRequestedChatRoom((prev) => ({
            roomId: 'urgent',
            seq: (prev?.seq || 0) + 1,
          }));
          setLiveUrgentAlert(null);
          setActiveTab('chat');
          handleMarkChatRead();
        }
      );
    },
    [handleMarkChatRead]
  );

  const checkSession = useCallback(async () => {
    setCheckingSession(true);
    try {
      const data = await apiFetch<SessionInfo>('/api/auth/session');
      setSession(data);
    } catch {
      setSession({
        authenticated: false,
        isAdmin: false,
        companyId: 'horyeoul7',
        apartmentId: 'apt-horyeoul7',
        apartmentName: '호려울마을 7단지',
        officeName: '호려울마을 7단지 관리사무소',
      });
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const handleWorkersReplaced = useCallback(
    (nextWorkers: Worker[]) => {
      setWorkers(nextWorkers);
      if (storageMode === 'memory' && session?.apartmentId) {
        setStoredMemoryWorkers(session.apartmentId, nextWorkers);
      }
      setSelectedWorkerId((prev) => {
        if (prev && nextWorkers.some((w) => w.id === prev)) {
          return prev;
        }
        setStoredWorkerId('');
        return '';
      });
    },
    [storageMode, session?.apartmentId]
  );

  const fetchWorkers = useCallback(async () => {
    if (!session?.authenticated) return;
    try {
      const res = await apiFetch<{
        workers: Worker[];
        storage?: StorageMode;
      }>('/api/workers');
      const mode = res.storage || null;
      if (mode) {
        setStorageMode(mode);
      }

      let resolvedWorkers = res.workers;
      if (mode === 'memory' && session.apartmentId) {
        const saved = getStoredMemoryWorkers(session.apartmentId);
        if (saved !== null) {
          resolvedWorkers = saved;
        } else {
          setStoredMemoryWorkers(session.apartmentId, res.workers);
        }
      }

      setWorkers(resolvedWorkers);
      setSelectedWorkerId((prev) => {
        if (prev && resolvedWorkers.some((w) => w.id === prev)) {
          return prev;
        }
        return '';
      });
    } catch {
      // Ignore transient errors
    }
  }, [session?.authenticated, session?.apartmentId]);

  const fetchLogs = useCallback(async () => {
    if (!session?.authenticated) return;
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterWorkerId && filterWorkerId !== 'all') {
        params.set('workerId', filterWorkerId);
      }
      if (filterDate) params.set('date', filterDate);
      if (filterStatus && filterStatus !== 'all') {
        params.set('status', filterStatus);
      }
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await apiFetch<{ logs: WorkLog[] }>(
        `/api/logs?${params.toString()}`
      );
      setLogs(res.logs);
    } catch {
      // Handled gracefully
    } finally {
      setLogsLoading(false);
    }
  }, [session?.authenticated, filterWorkerId, filterDate, filterStatus, searchQuery]);

  const applyAdState = useCallback((state: AdSlotStateResponse) => {
    if (state.adSlot) setAdSlot(state.adSlot);
    if (state.globalAdSlot) setGlobalAdSlot(state.globalAdSlot);
    setHasApartmentOverride(Boolean(state.hasApartmentOverride));
  }, []);

  const fetchNoticesAndHandovers = useCallback(async () => {
    if (!session?.authenticated) return;
    try {
      const [noticeRes, handoverRes, bannerRes, adSlotRes] = await Promise.all([
        apiFetch<{ notices: Notice[] }>('/api/notices'),
        apiFetch<{ handovers: Handover[] }>('/api/handovers'),
        apiFetch<{ banners: EventBanner[] }>('/api/banners'),
        apiFetch<AdSlotStateResponse>('/api/ad-slot'),
      ]);
      setNotices(noticeRes.notices);
      setHandovers(handoverRes.handovers);
      setBanners(bannerRes.banners);
      applyAdState(adSlotRes);
    } catch {
      // Handled gracefully
    }
  }, [session?.authenticated, applyAdState]);

  useEffect(() => {
    if (session?.authenticated) {
      void fetchWorkers();
      void fetchNoticesAndHandovers();
    }
  }, [session?.authenticated, fetchWorkers, fetchNoticesAndHandovers]);

  useEffect(() => {
    if (session?.authenticated) {
      void fetchLogs();
    }
  }, [session?.authenticated, fetchLogs]);

  const fetchUrgentLogs = useCallback(
    async (notifyNew = true) => {
      if (!session?.authenticated) return;
      try {
        const res = await apiFetch<{ logs: WorkLog[] }>(
          '/api/logs?status=urgent'
        );
        const list = res.logs || [];
        setUrgentLogs(list);

        const seen = getSeenUrgentIds();
        if (!urgentBaselineLoadedRef.current) {
          urgentBaselineLoadedRef.current = true;
          list.forEach((item) => markUrgentIdSeen(item.id));
          return;
        }

        if (notifyNew) {
          const unseen = list.filter((item) => !seen.has(item.id));
          if (unseen.length > 0) {
            unseen.forEach((item) => markUrgentIdSeen(item.id));
            notifyIncomingUrgentLog(unseen[0], true);
          }
        }
      } catch {
        // Ignore transient errors
      }
    },
    [session?.authenticated, notifyIncomingUrgentLog]
  );

  const fetchUnreadChatCount = useCallback(async () => {
    if (!session?.authenticated || activeTab === 'chat') return;
    try {
      const lastRead = getStoredChatLastRead();
      const afterQuery = lastRead
        ? `&after=${encodeURIComponent(lastRead)}`
        : '';
      const [generalRes, urgentRes] = await Promise.all([
        apiFetch<{
          messages: ChatMessage[];
          onlineUsers?: ChatOnlineUser[];
          wsSupported?: boolean;
        }>(`/api/chat/messages?roomId=general${afterQuery}`),
        apiFetch<{ messages: ChatMessage[] }>(
          `/api/chat/messages?roomId=urgent${afterQuery}`
        ),
      ]);
      if (typeof generalRes.wsSupported === 'boolean') {
        setWsSupported(generalRes.wsSupported);
      }
      if (Array.isArray(generalRes.onlineUsers)) {
        setOnlineUsers(generalRes.onlineUsers);
      }
      const combined = [...generalRes.messages, ...urgentRes.messages];
      const count = combined.filter(
        (m) =>
          (!selectedWorkerId || m.workerId !== selectedWorkerId) &&
          (!lastRead || m.createdAt > lastRead)
      ).length;
      setUnreadChatCount(count);
    } catch {
      // Ignore transient errors
    }
  }, [session?.authenticated, activeTab, selectedWorkerId]);

  useEffect(() => {
    if (!session?.authenticated) return;
    void fetchUrgentLogs(false);
    void fetchUnreadChatCount();
  }, [session?.authenticated, fetchUrgentLogs, fetchUnreadChatCount]);

  useEffect(() => {
    if (!session?.authenticated || !wsSupported) {
      setWsConnected(false);
      return;
    }

    const token = getStoredToken();
    if (!token) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({ token });
      const activeWorker = workersRef.current.find(
        (w) => w.id === selectedWorkerIdRef.current
      );
      if (activeWorker) {
        params.set('workerId', activeWorker.id);
        params.set('workerName', activeWorker.name);
        params.set('workerRole', activeWorker.role);
      }
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/chat?${params.toString()}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attempts = 0;
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as ChatRealtimePacket;

          if (
            payload.type === 'chat:presence' &&
            Array.isArray(payload.onlineUsers)
          ) {
            setOnlineUsers(payload.onlineUsers);
          } else if (
            payload.type === 'chat:typing' &&
            payload.workerName &&
            payload.workerId !== selectedWorkerIdRef.current
          ) {
            const room: ChatRoomId =
              payload.roomId === 'urgent' ? 'urgent' : 'general';
            setTypingByRoom((prev) => ({
              ...prev,
              [room]: payload.workerName || null,
            }));
            const existingTimer = typingTimersRef.current[room];
            if (existingTimer) clearTimeout(existingTimer);
            typingTimersRef.current[room] = setTimeout(() => {
              setTypingByRoom((prev) => ({ ...prev, [room]: null }));
            }, 2200);
          } else if (payload.type === 'chat:message' && payload.message) {
            if (
              activeTabRef.current !== 'chat' &&
              (!selectedWorkerIdRef.current ||
                payload.message.workerId !== selectedWorkerIdRef.current)
            ) {
              setUnreadChatCount((prev) => prev + 1);
            }
          } else if (payload.type === 'worklog:urgent' && payload.log) {
            const urgentLog = payload.log;
            setLogs((prev) => {
              const exists = prev.some((l) => l.id === urgentLog.id);
              return exists
                ? prev.map((l) => (l.id === urgentLog.id ? urgentLog : l))
                : [urgentLog, ...prev];
            });
            setUrgentLogs((prev) => {
              const filtered = prev.filter((l) => l.id !== urgentLog.id);
              return [urgentLog, ...filtered];
            });
            setCalendarRefreshTick((t) => t + 1);

            const seen = getSeenUrgentIds();
            if (!seen.has(urgentLog.id)) {
              notifyIncomingUrgentLog(urgentLog, true);
            }
            if (
              activeTabRef.current !== 'chat' &&
              (!selectedWorkerIdRef.current ||
                urgentLog.workerId !== selectedWorkerIdRef.current)
            ) {
              setUnreadChatCount((prev) => prev + 1);
            }
          } else if (payload.type === 'worklog:updated' && payload.log) {
            const updatedLog = payload.log;
            setLogs((prev) =>
              prev.map((l) => (l.id === updatedLog.id ? updatedLog : l))
            );
            setUrgentLogs((prev) => {
              if (updatedLog.status === 'urgent') {
                const exists = prev.some((l) => l.id === updatedLog.id);
                return exists
                  ? prev.map((l) => (l.id === updatedLog.id ? updatedLog : l))
                  : [updatedLog, ...prev];
              }
              return prev.filter((l) => l.id !== updatedLog.id);
            });
            setLiveUrgentAlert((prev) =>
              prev && prev.id === updatedLog.id && updatedLog.status !== 'urgent'
                ? null
                : prev
            );
          } else if (payload.type === 'worklog:deleted' && payload.id) {
            const delId = payload.id;
            setLogs((prev) => prev.filter((l) => l.id !== delId));
            setUrgentLogs((prev) => prev.filter((l) => l.id !== delId));
            setLiveUrgentAlert((prev) =>
              prev && prev.id === delId ? null : prev
            );
          }

          chatListenersRef.current.forEach((listener) => {
            listener(payload);
          });
        } catch {
          // Ignore malformed WS packets
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
        if (!cancelled) {
          const delay = Math.min(1000 * Math.pow(1.6, attempts), 10000);
          attempts += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (typingTimersRef.current.general) {
        clearTimeout(typingTimersRef.current.general);
      }
      if (typingTimersRef.current.urgent) {
        clearTimeout(typingTimersRef.current.urgent);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [session?.authenticated, wsSupported, notifyIncomingUrgentLog]);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const activeWorker = workers.find((w) => w.id === selectedWorkerId);
      ws.send(
        JSON.stringify({
          type: 'chat:presence:update',
          workerId: activeWorker?.id || '',
          workerName: activeWorker?.name || '',
          workerRole: activeWorker?.role || '',
        })
      );
    }
  }, [selectedWorkerId, workers]);

  useEffect(() => {
    if (!session?.authenticated || wsConnected) return;
    const timer = setInterval(() => {
      void fetchUrgentLogs(true);
      if (activeTabRef.current !== 'chat') {
        void fetchUnreadChatCount();
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [session?.authenticated, wsConnected, fetchUrgentLogs, fetchUnreadChatCount]);

  const handleQuickCompleteUrgentLog = useCallback(
    async (log: WorkLog) => {
      const res = await apiFetch<{ log: WorkLog }>(`/api/logs/${log.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          actingWorkerId: selectedWorkerId,
          status: 'completed',
        }),
      });
      setLogs((prev) =>
        prev.map((item) => (item.id === res.log.id ? res.log : item))
      );
      setUrgentLogs((prev) => prev.filter((item) => item.id !== res.log.id));
      setLiveUrgentAlert((prev) =>
        prev && prev.id === res.log.id ? null : prev
      );
      setCalendarRefreshTick((t) => t + 1);
    },
    [selectedWorkerId]
  );

  const handleSelectWorker = (workerId: string) => {
    setSelectedWorkerId(workerId);
    setStoredWorkerId(workerId);
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Always clear local session
    }
    setStoredToken(null);
    setSelectedWorkerId('');
    setStoredWorkerId('');
    setBanners([]);
    setUrgentLogs([]);
    setLiveUrgentAlert(null);
    setUnreadChatCount(0);
    setOnlineUsers([]);
    urgentBaselineLoadedRef.current = false;
    setAdSlot(DEFAULT_AD_SLOT);
    setGlobalAdSlot(DEFAULT_AD_SLOT);
    setHasApartmentOverride(false);
    setSession((prev) => ({
      authenticated: false,
      isAdmin: false,
      isMaster: false,
      companyId: prev?.companyId || 'horyeoul7',
      apartmentId: prev?.apartmentId || 'apt-horyeoul7',
      apartmentName: prev?.apartmentName || '호려울마을 7단지',
      officeName: prev?.officeName || '호려울마을 7단지 관리사무소',
    }));
    setActiveTab('workspace');
  };

  const handleResetFilters = () => {
    setFilterWorkerId('all');
    setFilterDate('');
    setFilterStatus('all');
    setSearchQuery('');
  };

  const selectedWorker = workers.find((w) => w.id === selectedWorkerId);
  const pinnedNotice = notices.find((n) => n.isPinned) || notices[0] || null;
  const pendingHandoverCount = handovers.filter(
    (h) => h.status === 'pending'
  ).length;
  const activeBanners = banners.filter((b) => b.isActive);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-500">
          공동 작업일지를 불러오는 중입니다...
        </div>
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <LoginView
        defaultCompanyId={session?.companyId || 'horyeoul7'}
        onLoginSuccess={(nextSession) => setSession(nextSession)}
      />
    );
  }

  return (
    <div className="min-h-screen relative bg-slate-100 flex flex-col pt-14 md:pt-16 pb-24 md:pb-10">
      {/* Subtle Fixed Apartment Architectural Background */}
      {!heroImgFailed && (
        <img
          src={HERO_APARTMENT_IMAGE}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onError={() => setHeroImgFailed(true)}
          className="fixed inset-0 w-full h-full object-cover opacity-[0.08] pointer-events-none select-none z-0"
        />
      )}

      {/* Prominent Fixed Top Bar (High-Contrast Teal Brand Header) */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-teal-900/95 backdrop-blur-md border-b border-teal-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Prominent single-element brand wordmark (CSS selector target) */}
          <button
            type="button"
            onClick={() => switchTab('workspace')}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded-lg px-1 -ml-1 whitespace-nowrap shrink-0 inline-flex items-center gap-2.5"
          >
            {!logoImgFailed && (
              <img
                src={APARTMENT_LOGO_IMAGE}
                alt={`${session.apartmentName} 로고`}
                referrerPolicy="no-referrer"
                onError={() => setLogoImgFailed(true)}
                className="w-8 h-8 md:w-9 md:h-9 rounded-xl object-cover ring-1 ring-white/25 shadow-sm shrink-0"
              />
            )}
            <span className="md:hidden text-lg font-extrabold tracking-tight text-white drop-shadow-sm">
              {session.apartmentName}
            </span>
            <span className="hidden md:inline text-xl font-extrabold tracking-tight text-white drop-shadow-sm">
              {session.apartmentName} 공동 작업일지
            </span>
          </button>

          {/* Zone 2: Desktop single-line text navigation links (6 links) */}
          <nav
            aria-label="주요 메뉴"
            className="hidden md:flex items-center gap-5 lg:gap-7 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => switchTab('workspace')}
              className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'workspace'
                  ? 'border-amber-300 text-white font-semibold'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              작업일지 작성
            </button>
            <button
              type="button"
              onClick={() => switchTab('feed')}
              className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'feed'
                  ? 'border-amber-300 text-white font-semibold'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              전체 작업 내역
            </button>
            <button
              type="button"
              onClick={() => switchTab('calendar')}
              className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'calendar'
                  ? 'border-amber-300 text-white font-semibold'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              작업 캘린더
            </button>
            <button
              type="button"
              onClick={() => switchTab('chat')}
              className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                activeTab === 'chat'
                  ? 'border-amber-300 text-white font-semibold'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              <span>직원 채팅</span>
              {unreadChatCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#FEE500] text-slate-900 text-[11px] font-bold flex items-center justify-center tabular-nums">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => switchTab('notice_handover')}
              className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'notice_handover'
                  ? 'border-amber-300 text-white font-semibold'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              공지 · 인수인계
            </button>
            <button
              type="button"
              onClick={() => switchTab('admin')}
              className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'admin'
                  ? 'border-amber-300 text-white font-semibold'
                  : 'border-transparent text-teal-100 hover:text-white'
              }`}
            >
              관리자 관리
            </button>
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-teal-950 bg-white hover:bg-teal-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        {/* Apartment Architectural Hero Banner */}
        <div className="relative mb-4 sm:mb-6 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 to-teal-900 border border-slate-200/80 shadow-sm">
          {!heroImgFailed && (
            <img
              src={HERO_APARTMENT_IMAGE}
              alt={`${session.apartmentName} 전경`}
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/75 to-teal-950/65"
          />

          <div className="relative z-10 px-5 py-5 sm:px-7 sm:py-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-teal-300">
                {session.officeName}
              </p>
              <h1 className="mt-1 text-xl sm:text-2xl font-extrabold tracking-tight text-white truncate">
                {activeTab === 'admin'
                  ? '관리자 통합 관리 및 단지 설정'
                  : activeTab === 'notice_handover'
                    ? '공지사항 및 교대 인수인계'
                    : activeTab === 'chat'
                      ? '직원 소통 채팅방'
                      : activeTab === 'calendar'
                        ? '월별 작업 캘린더'
                        : activeTab === 'feed'
                          ? '전체 작업 내역 조회'
                          : `${session.apartmentName} 공동 작업일지`}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-200">
                {selectedWorker
                  ? `현재 작업자: ${selectedWorker.name} (${selectedWorker.role})`
                  : '작업자를 선택해 주세요'}
                <span aria-hidden="true"> · </span>
                {session.isAdmin ? '관리자 권한' : '직원 권한'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
              {notificationPermission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={() => void handleRequestNotificationPermission()}
                  disabled={notificationPermission === 'granted'}
                  title={
                    notificationPermission === 'granted'
                      ? '긴급 작업 등록 시 실시간 브라우저 푸시 알림이 켜져 있습니다.'
                      : notificationPermission === 'denied'
                        ? '브라우저 사이트 설정에서 알림 권한을 허용해 주세요.'
                        : '긴급 작업 등록 시 브라우저 푸시 알림을 받으려면 클릭하세요.'
                  }
                  className={`min-h-[42px] px-3 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    notificationPermission === 'granted'
                      ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100 cursor-default'
                      : notificationPermission === 'denied'
                        ? 'bg-white/10 border-white/20 text-slate-300'
                        : 'bg-rose-600/90 hover:bg-rose-600 border-rose-400/50 text-white shadow-xs'
                  }`}
                >
                  {notificationPermission === 'granted' ? (
                    <BellRing className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {notificationPermission === 'granted'
                      ? '긴급 푸시 ON'
                      : notificationPermission === 'denied'
                        ? '알림 차단됨'
                        : '긴급 푸시 알림 켜기'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  void fetchLogs();
                  void fetchUrgentLogs(false);
                  void fetchNoticesAndHandovers();
                  setCalendarRefreshTick((t) => t + 1);
                }}
                className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>새로고침</span>
              </button>
            </div>
          </div>
        </div>

        {/* Real-Time Global Urgent Highlight Banner (shown on non-chat views) */}
        {activeTab !== 'chat' && (liveUrgentAlert || urgentLogs.length > 0) && (
          <div
            role="alert"
            className="mb-4 sm:mb-6 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 text-white px-4 py-3 sm:px-5 shadow-md flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Siren className="w-5 h-5 animate-pulse" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-extrabold flex flex-wrap items-center gap-1.5">
                  <span>
                    {liveUrgentAlert
                      ? '방금 긴급 작업이 등록되었습니다!'
                      : `처리 대기 중인 긴급 작업 ${urgentLogs.length}건`}
                  </span>
                  <span className="font-semibold text-rose-100">
                    · {(liveUrgentAlert || urgentLogs[0]).location} (
                    {(liveUrgentAlert || urgentLogs[0]).workerName})
                  </span>
                </p>
                <p className="text-xs text-rose-100 truncate mt-0.5">
                  {(liveUrgentAlert || urgentLogs[0]).content}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openUrgentChatRoom}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#FEE500] hover:bg-[#f5dc00] text-slate-900 text-xs font-extrabold transition-colors whitespace-nowrap"
              >
                채팅 긴급방 보기
              </button>
              {liveUrgentAlert && (
                <button
                  type="button"
                  onClick={() => setLiveUrgentAlert(null)}
                  aria-label="긴급 알림 배너 닫기"
                  className="p-1.5 rounded-lg text-rose-100 hover:bg-white/15"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quiet Single-Line Notice & Handover Summary Bar (on workspace & feed views) */}
        {(activeTab === 'workspace' || activeTab === 'feed') &&
          (pinnedNotice || pendingHandoverCount > 0) && (
            <button
              type="button"
              onClick={() => switchTab('notice_handover')}
              className="mb-4 sm:mb-6 w-full min-h-[48px] px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-left transition-colors shadow-xs"
            >
              <div className="min-w-0 flex items-center gap-2.5 text-xs sm:text-sm">
                <Megaphone
                  className="w-4 h-4 text-teal-800 shrink-0"
                  aria-hidden="true"
                />
                <span className="font-semibold text-slate-900 truncate">
                  {pinnedNotice
                    ? `공지: ${pinnedNotice.title}`
                    : '공지사항 및 인수인계 확인'}
                </span>
                {pendingHandoverCount > 0 && (
                  <span className="text-amber-700 font-semibold whitespace-nowrap shrink-0 tabular-nums">
                    · 미확인 인수인계 {pendingHandoverCount}건
                  </span>
                )}
              </div>
              <ChevronRight
                className="w-4 h-4 text-slate-400 shrink-0"
                aria-hidden="true"
              />
            </button>
          )}

        {/* Active Event / Wedding / Funeral Banners */}
        {(activeTab === 'workspace' || activeTab === 'feed') &&
          activeBanners.length > 0 && (
            <div className="mb-4 sm:mb-6 space-y-3">
              {activeBanners.map((banner) => (
                <EventBannerCard
                  key={banner.id}
                  banner={banner}
                  officeName={session.officeName}
                />
              ))}
            </div>
          )}

        {/* Active View */}
        {activeTab === 'workspace' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5">
              <WorkLogComposer
                workers={workers}
                selectedWorkerId={selectedWorkerId}
                prefillDate={composerPrefillDate}
                onSelectWorker={handleSelectWorker}
                onLogCreated={(created) => {
                  setLogs((prev) => [created, ...prev]);
                  if (created.status === 'urgent') {
                    markUrgentIdSeen(created.id);
                    setUrgentLogs((prev) => [created, ...prev]);
                  }
                  setCalendarRefreshTick((t) => t + 1);
                }}
                onNavigateAdmin={() => switchTab('admin')}
                onNavigateFeed={() => switchTab('feed')}
              />
            </div>

            {/* Desktop side-by-side feed; hidden on mobile so mobile uses dedicated thumb-zone tab */}
            <div className="hidden md:block lg:col-span-7">
              <WorkLogFeed
                logs={logs}
                workers={workers}
                apartmentName={session.apartmentName}
                selectedWorkerId={selectedWorkerId}
                isAdmin={session.isAdmin}
                loading={logsLoading}
                filterWorkerId={filterWorkerId}
                filterDate={filterDate}
                filterStatus={filterStatus}
                searchQuery={searchQuery}
                onFilterWorkerChange={setFilterWorkerId}
                onFilterDateChange={setFilterDate}
                onFilterStatusChange={setFilterStatus}
                onSearchQueryChange={setSearchQuery}
                onResetFilters={handleResetFilters}
                onEditLog={setEditingLog}
                onLogUpdated={(updated) => {
                  setLogs((prev) =>
                    prev.map((item) => (item.id === updated.id ? updated : item))
                  );
                  setUrgentLogs((prev) => {
                    if (updated.status === 'urgent') {
                      const exists = prev.some((i) => i.id === updated.id);
                      return exists
                        ? prev.map((i) => (i.id === updated.id ? updated : i))
                        : [updated, ...prev];
                    }
                    return prev.filter((i) => i.id !== updated.id);
                  });
                }}
                onLogDeleted={(id) => {
                  setLogs((prev) => prev.filter((item) => item.id !== id));
                  setUrgentLogs((prev) => prev.filter((item) => item.id !== id));
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'feed' && (
          <WorkLogFeed
            logs={logs}
            workers={workers}
            apartmentName={session.apartmentName}
            selectedWorkerId={selectedWorkerId}
            isAdmin={session.isAdmin}
            loading={logsLoading}
            filterWorkerId={filterWorkerId}
            filterDate={filterDate}
            filterStatus={filterStatus}
            searchQuery={searchQuery}
            onFilterWorkerChange={setFilterWorkerId}
            onFilterDateChange={setFilterDate}
            onFilterStatusChange={setFilterStatus}
            onSearchQueryChange={setSearchQuery}
            onResetFilters={handleResetFilters}
            onEditLog={setEditingLog}
            onLogUpdated={(updated) => {
              setLogs((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item))
              );
              setUrgentLogs((prev) => {
                if (updated.status === 'urgent') {
                  const exists = prev.some((i) => i.id === updated.id);
                  return exists
                    ? prev.map((i) => (i.id === updated.id ? updated : i))
                    : [updated, ...prev];
                }
                return prev.filter((i) => i.id !== updated.id);
              });
            }}
            onLogDeleted={(id) => {
              setLogs((prev) => prev.filter((item) => item.id !== id));
              setUrgentLogs((prev) => prev.filter((item) => item.id !== id));
            }}
          />
        )}

        {activeTab === 'calendar' && (
          <WorkCalendarView
            workers={workers}
            selectedWorkerId={selectedWorkerId}
            isAdmin={session.isAdmin}
            refreshTrigger={calendarRefreshTick}
            onEditLog={setEditingLog}
            onLogUpdated={(updated) => {
              setLogs((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item))
              );
              setUrgentLogs((prev) => {
                if (updated.status === 'urgent') {
                  const exists = prev.some((i) => i.id === updated.id);
                  return exists
                    ? prev.map((i) => (i.id === updated.id ? updated : i))
                    : [updated, ...prev];
                }
                return prev.filter((i) => i.id !== updated.id);
              });
            }}
            onLogDeleted={(id) => {
              setLogs((prev) => prev.filter((item) => item.id !== id));
              setUrgentLogs((prev) => prev.filter((item) => item.id !== id));
            }}
            onWriteForDate={(dateStr) => {
              setComposerPrefillDate((prev) => ({
                date: dateStr,
                seq: (prev?.seq || 0) + 1,
              }));
              switchTab('workspace');
            }}
          />
        )}

        {activeTab === 'chat' && (
          <StaffChatView
            apartmentName={session.apartmentName}
            workers={workers}
            selectedWorkerId={selectedWorkerId}
            isAdmin={session.isAdmin}
            wsConnected={wsConnected}
            onlineUsers={onlineUsers}
            typingByRoom={typingByRoom}
            urgentLogs={urgentLogs}
            requestedRoom={requestedChatRoom}
            notificationPermission={notificationPermission}
            onSelectWorker={handleSelectWorker}
            onMarkRead={handleMarkChatRead}
            onEmitTyping={handleEmitTyping}
            subscribeChatEvents={subscribeChatEvents}
            onOnlineUsersSync={setOnlineUsers}
            onRequestNotificationPermission={
              handleRequestNotificationPermission
            }
            onQuickCompleteUrgentLog={handleQuickCompleteUrgentLog}
            onViewUrgentFeed={() => {
              setFilterStatus('urgent');
              switchTab('feed');
            }}
          />
        )}

        {activeTab === 'notice_handover' && (
          <NoticeHandoverView
            notices={notices}
            handovers={handovers}
            workers={workers}
            selectedWorkerId={selectedWorkerId}
            isAdmin={session.isAdmin}
            onSelectWorker={handleSelectWorker}
            onNoticesChange={setNotices}
            onHandoversChange={setHandovers}
            onNavigateAdmin={() => switchTab('admin')}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanel
            isAdmin={session.isAdmin}
            isMaster={Boolean(session.isMaster)}
            apartmentId={session.apartmentId}
            apartmentName={session.apartmentName}
            officeName={session.officeName}
            storageMode={storageMode}
            workers={workers}
            logs={logs}
            banners={banners}
            adSlot={adSlot}
            globalAdSlot={globalAdSlot}
            hasApartmentOverride={hasApartmentOverride}
            filterWorkerId={filterWorkerId}
            filterDate={filterDate}
            filterStatus={filterStatus}
            searchQuery={searchQuery}
            onAdminStateChanged={(isAdmin) =>
              setSession((prev) => (prev ? { ...prev, isAdmin } : prev))
            }
            onMasterStateChanged={(isMaster) =>
              setSession((prev) => (prev ? { ...prev, isMaster } : prev))
            }
            onApartmentUpdated={(apt) =>
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      apartmentName: apt.name,
                      officeName: apt.officeName,
                    }
                  : prev
              )
            }
            onWorkersChanged={() => void fetchWorkers()}
            onWorkersReplaced={handleWorkersReplaced}
            onBannersChanged={setBanners}
            onAdStateChanged={applyAdState}
            onEditLog={setEditingLog}
            onLogDeleted={(id) =>
              setLogs((prev) => prev.filter((item) => item.id !== id))
            }
          />
        )}
      </main>

      {/* Bottom External Advertisement Area */}
      {adSlot.mode !== 'hidden' && (
        <footer className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 mt-8 pt-4">
          <BottomAdSlot
            adSlot={adSlot}
            onOpenAdmin={() => switchTab('admin')}
          />
        </footer>
      )}

      {/* Mobile Fixed Bottom Thumb-Zone Navigation (6 tabs) */}
      <nav
        aria-label="하단 모바일 메뉴"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-6 h-15 items-center">
          <button
            type="button"
            onClick={() => switchTab('workspace')}
            className={`h-full min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'workspace'
                ? 'text-teal-800 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <PenSquare className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] leading-none whitespace-nowrap">
              작성
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('feed')}
            className={`h-full min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'feed'
                ? 'text-teal-800 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] leading-none whitespace-nowrap">
              내역
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('calendar')}
            className={`h-full min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'calendar'
                ? 'text-teal-800 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] leading-none whitespace-nowrap">
              캘린더
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('chat')}
            className={`h-full min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors relative ${
              activeTab === 'chat'
                ? 'text-teal-800 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <MessageCircle className="w-5 h-5" aria-hidden="true" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-none whitespace-nowrap">
              채팅
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('notice_handover')}
            className={`h-full min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors relative ${
              activeTab === 'notice_handover'
                ? 'text-teal-800 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <Megaphone className="w-5 h-5" aria-hidden="true" />
              {pendingHandoverCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {pendingHandoverCount}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-none whitespace-nowrap">
              공지·인계
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('admin')}
            className={`h-full min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'admin'
                ? 'text-teal-800 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] leading-none whitespace-nowrap">
              관리자
            </span>
          </button>
        </div>
      </nav>

      {/* Edit Log Modal */}
      {editingLog && (
        <EditLogModal
          log={editingLog}
          actingWorkerId={selectedWorkerId}
          isAdmin={session.isAdmin}
          onClose={() => setEditingLog(null)}
          onSaved={(updated) => {
            setLogs((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
            setUrgentLogs((prev) => {
              if (updated.status === 'urgent') {
                markUrgentIdSeen(updated.id);
                const exists = prev.some((i) => i.id === updated.id);
                return exists
                  ? prev.map((i) => (i.id === updated.id ? updated : i))
                  : [updated, ...prev];
              }
              return prev.filter((i) => i.id !== updated.id);
            });
            setCalendarRefreshTick((t) => t + 1);
            setEditingLog(null);
          }}
        />
      )}
    </div>
  );
}

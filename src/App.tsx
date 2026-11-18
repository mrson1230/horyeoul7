import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  LogOut,
  Megaphone,
  PenSquare,
  RefreshCw,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { BottomAdSlot } from './components/BottomAdSlot';
import { EditLogModal } from './components/EditLogModal';
import { EventBannerCard } from './components/EventBannerCard';
import { LoginView } from './components/LoginView';
import { NoticeHandoverView } from './components/NoticeHandoverView';
import { WorkCalendarView } from './components/WorkCalendarView';
import { WorkLogComposer } from './components/WorkLogComposer';
import { WorkLogFeed } from './components/WorkLogFeed';
import {
  apiFetch,
  getStoredWorkerId,
  setStoredToken,
  setStoredWorkerId,
} from './utils/api';
import type {
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

type ActiveTab =
  | 'workspace'
  | 'feed'
  | 'calendar'
  | 'notice_handover'
  | 'admin';

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(
    getStoredWorkerId()
  );

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [banners, setBanners] = useState<EventBanner[]>([]);
  const [adSlot, setAdSlot] = useState<ExternalAdConfig>(DEFAULT_AD_SLOT);

  const [filterWorkerId, setFilterWorkerId] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | WorkStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [calendarRefreshTick, setCalendarRefreshTick] = useState(0);
  const [composerPrefillDate, setComposerPrefillDate] = useState<{
    date: string;
    seq: number;
  } | null>(null);

  const switchTab = (nextTab: ActiveTab) => {
    setActiveTab(nextTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const fetchWorkers = useCallback(async () => {
    if (!session?.authenticated) return;
    try {
      const res = await apiFetch<{ workers: Worker[] }>('/api/workers');
      setWorkers(res.workers);
      setSelectedWorkerId((prev) => {
        if (prev && res.workers.some((w) => w.id === prev)) {
          return prev;
        }
        return '';
      });
    } catch {
      // Ignore transient errors
    }
  }, [session?.authenticated]);

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

  const fetchNoticesAndHandovers = useCallback(async () => {
    if (!session?.authenticated) return;
    try {
      const [noticeRes, handoverRes, bannerRes, adSlotRes] = await Promise.all([
        apiFetch<{ notices: Notice[] }>('/api/notices'),
        apiFetch<{ handovers: Handover[] }>('/api/handovers'),
        apiFetch<{ banners: EventBanner[] }>('/api/banners'),
        apiFetch<{ adSlot: ExternalAdConfig }>('/api/ad-slot'),
      ]);
      setNotices(noticeRes.notices);
      setHandovers(handoverRes.handovers);
      setBanners(bannerRes.banners);
      if (adSlotRes.adSlot) {
        setAdSlot(adSlotRes.adSlot);
      }
    } catch {
      // Handled gracefully
    }
  }, [session?.authenticated]);

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
    setAdSlot(DEFAULT_AD_SLOT);
    setSession((prev) => ({
      authenticated: false,
      isAdmin: false,
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
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded px-1 -ml-1 whitespace-nowrap shrink-0"
          >
            <span className="md:hidden text-lg font-extrabold tracking-tight text-white drop-shadow-sm">
              {session.apartmentName}
            </span>
            <span className="hidden md:inline text-xl font-extrabold tracking-tight text-white drop-shadow-sm">
              {session.apartmentName} 공동 작업일지
            </span>
          </button>

          {/* Zone 2: Desktop single-line text navigation links (5 links) */}
          <nav
            aria-label="주요 메뉴"
            className="hidden md:flex items-center gap-6 lg:gap-7 text-sm font-medium"
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

            <button
              type="button"
              onClick={() => {
                void fetchLogs();
                void fetchNoticesAndHandovers();
                setCalendarRefreshTick((t) => t + 1);
              }}
              className="self-start sm:self-auto min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>새로고침</span>
            </button>
          </div>
        </div>

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
                onLogUpdated={(updated) =>
                  setLogs((prev) =>
                    prev.map((item) => (item.id === updated.id ? updated : item))
                  )
                }
                onLogDeleted={(id) =>
                  setLogs((prev) => prev.filter((item) => item.id !== id))
                }
              />
            </div>
          </div>
        )}

        {activeTab === 'feed' && (
          <WorkLogFeed
            logs={logs}
            workers={workers}
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
            onLogUpdated={(updated) =>
              setLogs((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item))
              )
            }
            onLogDeleted={(id) =>
              setLogs((prev) => prev.filter((item) => item.id !== id))
            }
          />
        )}

        {activeTab === 'calendar' && (
          <WorkCalendarView
            workers={workers}
            selectedWorkerId={selectedWorkerId}
            isAdmin={session.isAdmin}
            refreshTrigger={calendarRefreshTick}
            onEditLog={setEditingLog}
            onLogUpdated={(updated) =>
              setLogs((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item))
              )
            }
            onLogDeleted={(id) =>
              setLogs((prev) => prev.filter((item) => item.id !== id))
            }
            onWriteForDate={(dateStr) => {
              setComposerPrefillDate((prev) => ({
                date: dateStr,
                seq: (prev?.seq || 0) + 1,
              }));
              switchTab('workspace');
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
            apartmentName={session.apartmentName}
            officeName={session.officeName}
            workers={workers}
            logs={logs}
            banners={banners}
            adSlot={adSlot}
            filterWorkerId={filterWorkerId}
            filterDate={filterDate}
            filterStatus={filterStatus}
            searchQuery={searchQuery}
            onAdminStateChanged={(isAdmin) =>
              setSession((prev) => (prev ? { ...prev, isAdmin } : prev))
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
            onBannersChanged={setBanners}
            onAdSlotChanged={setAdSlot}
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

      {/* Mobile Fixed Bottom Thumb-Zone Navigation (5 tabs) */}
      <nav
        aria-label="하단 모바일 메뉴"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-5 h-15 items-center">
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
              작업 작성
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
              전체 내역
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
            setCalendarRefreshTick((t) => t + 1);
            setEditingLog(null);
          }}
        />
      )}
    </div>
  );
}

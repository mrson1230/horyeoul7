import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Image as ImageIcon,
  Maximize2,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  apiFetch,
  formatKoreanDateTime,
  getTodayKoreaDate,
} from '../utils/api';
import {
  buildSlideshowItems,
  PhotoSlideshowModal,
} from './PhotoSlideshowModal';
import { WORK_STATUS_OPTIONS, WorkStatusLabel } from './WorkStatusLabel';
import type { Worker, WorkLog, WorkStatus } from '../types';

interface WorkLogFeedProps {
  logs: WorkLog[];
  workers: Worker[];
  selectedWorkerId: string;
  isAdmin: boolean;
  loading: boolean;
  filterWorkerId: string;
  filterDate: string;
  filterStatus: 'all' | WorkStatus;
  searchQuery: string;
  onFilterWorkerChange: (val: string) => void;
  onFilterDateChange: (val: string) => void;
  onFilterStatusChange: (val: 'all' | WorkStatus) => void;
  onSearchQueryChange: (val: string) => void;
  onResetFilters: () => void;
  onEditLog: (log: WorkLog) => void;
  onLogUpdated: (updated: WorkLog) => void;
  onLogDeleted: (id: string) => void;
}

function LogPhotoThumbnail({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="mt-3 w-full h-40 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1.5">
        <ImageIcon className="w-6 h-6" aria-hidden="true" />
        <span className="text-xs">첨부된 사진</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 relative block w-full text-left rounded-xl overflow-hidden border border-slate-200 bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 group"
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-48 sm:h-56 object-cover group-hover:scale-[1.01] transition-transform duration-200"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-slate-950/70 backdrop-blur-xs text-white text-[11px] font-medium inline-flex items-center gap-1"
      >
        <Maximize2 className="w-3 h-3" />
        <span>전체화면</span>
      </span>
    </button>
  );
}

export function WorkLogFeed({
  logs,
  workers,
  selectedWorkerId,
  isAdmin,
  loading,
  filterWorkerId,
  filterDate,
  filterStatus,
  searchQuery,
  onFilterWorkerChange,
  onFilterDateChange,
  onFilterStatusChange,
  onSearchQueryChange,
  onResetFilters,
  onEditLog,
  onLogUpdated,
  onLogDeleted,
}: WorkLogFeedProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [slideshowIndex, setSlideshowIndex] = useState<number | null>(null);

  const slideshowItems = buildSlideshowItems(logs);
  const today = getTodayKoreaDate();
  const hasActiveFilter =
    filterWorkerId !== 'all' ||
    filterDate !== '' ||
    filterStatus !== 'all' ||
    searchQuery.trim() !== '';
  const isMyLogsOnly =
    Boolean(selectedWorkerId) && filterWorkerId === selectedWorkerId;
  const isTodayOnly = filterDate === today;

  const handleQuickComplete = async (log: WorkLog) => {
    setActionError(null);
    setUpdatingStatusId(log.id);
    try {
      const res = await apiFetch<{ log: WorkLog }>(`/api/logs/${log.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          actingWorkerId: selectedWorkerId,
          status: 'completed',
        }),
      });
      onLogUpdated(res.log);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : '상태 변경에 실패했습니다.'
      );
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    setDeletingId(id);
    try {
      await apiFetch(`/api/logs/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      onLogDeleted(id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : '작업일지 삭제에 실패했습니다.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Mobile-First Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">전체 작업 내역</h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              조회된 기록 {logs.length}건
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={onResetFilters}
                className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>초기화</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((prev) => !prev)}
              className="md:hidden min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>상세 필터</span>
              {mobileFiltersOpen ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* One-Tap Mobile Quick Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-2 md:mb-3">
          <button
            type="button"
            onClick={() => onFilterWorkerChange('all')}
            className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              filterWorkerId === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            전체 직원
          </button>

          {selectedWorkerId && (
            <button
              type="button"
              onClick={() =>
                onFilterWorkerChange(isMyLogsOnly ? 'all' : selectedWorkerId)
              }
              className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                isMyLogsOnly
                  ? 'bg-teal-800 text-white border-teal-800'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              내 기록만
            </button>
          )}

          <button
            type="button"
            onClick={() => onFilterDateChange(isTodayOnly ? '' : today)}
            className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              isTodayOnly
                ? 'bg-teal-800 text-white border-teal-800'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            오늘 작업만
          </button>
        </div>

        {/* Status Filter Strip */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-2 md:mb-3"
          role="group"
          aria-label="진행 상태 필터"
        >
          <button
            type="button"
            onClick={() => onFilterStatusChange('all')}
            className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              filterStatus === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            전체 상태
          </button>
          {WORK_STATUS_OPTIONS.map((option) => {
            const active = filterStatus === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  onFilterStatusChange(active ? 'all' : option.value)
                }
                className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? option.activeButtonClass
                    : `bg-slate-50 border-slate-200 ${option.textClass} hover:bg-slate-100`
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/* Detailed Filters (Always open on md+, collapsible on mobile) */}
        <div
          className={`${
            mobileFiltersOpen ? 'grid' : 'hidden md:grid'
          } grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 md:pt-0`}
        >
          <div>
            <label htmlFor="filter-worker" className="sr-only">
              작성자 필터
            </label>
            <select
              id="filter-worker"
              value={filterWorkerId}
              onChange={(e) => onFilterWorkerChange(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            >
              <option value="all">작성자: 전체 직원</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-date" className="sr-only">
              날짜 필터
            </label>
            <input
              id="filter-date"
              type="date"
              value={filterDate}
              onChange={(e) => onFilterDateChange(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm font-mono-tabular bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <div className="relative">
            <label htmlFor="filter-search" className="sr-only">
              장소 또는 처리 내용 검색
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="filter-search"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="장소·내용 검색"
              className="w-full min-h-[44px] pl-9 pr-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>
        </div>
      </section>

      {actionError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium"
        >
          {actionError}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse space-y-3"
            >
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-5 w-64 bg-slate-200 rounded" />
              <div className="h-16 w-full bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <ClipboardList
            className="w-10 h-10 text-slate-300 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-slate-800">
            조건에 맞는 작업일지가 없습니다.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            새로운 작업 내용을 기록하거나 검색 필터를 초기화해 보세요.
          </p>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={onResetFilters}
              className="mt-4 min-h-[44px] px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors"
            >
              전체 작업일지 보기
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const isOwner = Boolean(selectedWorkerId && log.workerId === selectedWorkerId);
            const canEdit = isAdmin || isOwner;
            const canDelete = isAdmin;

            return (
              <article
                key={log.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 transition-colors"
              >
                {/* Clean Unboxed Metadata Line */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <WorkStatusLabel status={log.status} />
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular font-semibold text-slate-700">
                      {log.workDate}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-900">
                      {log.workerName}
                    </span>
                    {log.workerRole && (
                      <span className="text-slate-500">({log.workerRole})</span>
                    )}
                    {isOwner && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-teal-800">내 기록</span>
                      </>
                    )}
                  </div>
                  <span className="font-mono-tabular text-slate-400">
                    {formatKoreanDateTime(log.createdAt)}
                  </span>
                </div>

                {/* Location Title */}
                <h3 className="mt-2 text-base font-bold text-slate-900 break-words">
                  {log.location}
                </h3>

                {/* Description */}
                <p className="mt-1.5 text-[15px] text-slate-700 leading-relaxed whitespace-pre-line break-words">
                  {log.content}
                </p>

                {/* Photo Thumbnail */}
                {log.photoUrl && (
                  <LogPhotoThumbnail
                    src={log.photoUrl}
                    alt={`${log.location} 작업 완료 사진`}
                    onClick={() => {
                      const idx = slideshowItems.findIndex(
                        (item) => item.id === log.id
                      );
                      setSlideshowIndex(idx >= 0 ? idx : 0);
                    }}
                  />
                )}

                {/* Action Row */}
                {(canEdit || canDelete) && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                    {canEdit && log.status !== 'completed' && (
                      <button
                        type="button"
                        disabled={updatingStatusId === log.id}
                        onClick={() => handleQuickComplete(log)}
                        className="min-h-[44px] px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {updatingStatusId === log.id ? '변경 중...' : '완료 처리'}
                        </span>
                      </button>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onEditLog(log)}
                        className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>수정</span>
                      </button>
                    )}

                    {canDelete && (
                      <>
                        {confirmDeleteId === log.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={deletingId === log.id}
                              onClick={() => handleDelete(log.id)}
                              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors whitespace-nowrap"
                            >
                              {deletingId === log.id ? '삭제 중...' : '삭제 확인'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors whitespace-nowrap"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(log.id)}
                            className="min-h-[44px] px-4 py-2 text-xs font-semibold text-red-600 bg-red-50/70 hover:bg-red-50 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>삭제</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Full-Screen Photo Slideshow Modal */}
      {slideshowIndex !== null && slideshowItems.length > 0 && (
        <PhotoSlideshowModal
          items={slideshowItems}
          initialIndex={slideshowIndex}
          onClose={() => setSlideshowIndex(null)}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Image as ImageIcon,
  Maximize2,
  Pencil,
  PenSquare,
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
import { WorkStatusLabel } from './WorkStatusLabel';
import type { Worker, WorkLog, WorkStatus } from '../types';

interface WorkCalendarViewProps {
  workers: Worker[];
  selectedWorkerId: string;
  isAdmin: boolean;
  refreshTrigger: number;
  onEditLog: (log: WorkLog) => void;
  onLogUpdated: (updated: WorkLog) => void;
  onLogDeleted: (id: string) => void;
  onWriteForDate: (dateStr: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateKoreanHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS[dt.getUTCDay()] || '';
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

export function WorkCalendarView({
  workers,
  selectedWorkerId,
  isAdmin,
  refreshTrigger,
  onEditLog,
  onLogUpdated,
  onLogDeleted,
  onWriteForDate,
}: WorkCalendarViewProps) {
  const today = getTodayKoreaDate();
  const [todayYear, todayMonth] = today.split('-').map(Number);

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth); // 1-12
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarWorkerId, setCalendarWorkerId] = useState('all');

  const [allLogs, setAllLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [slideshowIndex, setSlideshowIndex] = useState<number | null>(null);

  const dayListRef = useRef<HTMLDivElement | null>(null);

  const fetchCalendarLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (calendarWorkerId !== 'all') {
        params.set('workerId', calendarWorkerId);
      }
      const res = await apiFetch<{ logs: WorkLog[] }>(
        `/api/logs?${params.toString()}`
      );
      setAllLogs(res.logs);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '작업 캘린더 데이터를 불러오지 못했습니다.'
      );
    } finally {
      setLoading(false);
    }
  }, [calendarWorkerId]);

  useEffect(() => {
    void fetchCalendarLogs();
  }, [fetchCalendarLogs, refreshTrigger]);

  const monthPrefix = `${viewYear}-${pad2(viewMonth)}`;

  const logsByDate = useMemo(() => {
    const map = new Map<string, WorkLog[]>();
    for (const log of allLogs) {
      const list = map.get(log.workDate);
      if (list) {
        list.push(log);
      } else {
        map.set(log.workDate, [log]);
      }
    }
    return map;
  }, [allLogs]);

  const monthSummary = useMemo(() => {
    let total = 0;
    let completed = 0;
    let inProgress = 0;
    let pending = 0;

    for (const log of allLogs) {
      if (!log.workDate.startsWith(monthPrefix)) continue;
      total += 1;
      const st: WorkStatus = log.status || 'completed';
      if (st === 'pending') pending += 1;
      else if (st === 'in_progress') inProgress += 1;
      else completed += 1;
    }

    return { total, completed, inProgress, pending };
  }, [allLogs, monthPrefix]);

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
    const cells: Array<{ day: number; dateStr: string } | null> = [];

    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push({
        day: d,
        dateStr: `${viewYear}-${pad2(viewMonth)}-${pad2(d)}`,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const selectedDayLogs = logsByDate.get(selectedDate) || [];
  const slideshowItems = buildSlideshowItems(selectedDayLogs);

  const selectedDaySummary = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let pending = 0;
    for (const log of selectedDayLogs) {
      const st: WorkStatus = log.status || 'completed';
      if (st === 'pending') pending += 1;
      else if (st === 'in_progress') inProgress += 1;
      else completed += 1;
    }
    return { completed, inProgress, pending };
  }, [selectedDayLogs]);

  const moveMonth = (delta: number) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setViewYear(nextYear);
    setViewMonth(nextMonth);
    setSelectedDate(`${nextYear}-${pad2(nextMonth)}-01`);
  };

  const jumpToToday = () => {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    setSelectedDate(today);
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (window.innerWidth < 1024 && dayListRef.current) {
      dayListRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleQuickComplete = async (log: WorkLog) => {
    setError(null);
    setUpdatingStatusId(log.id);
    try {
      const res = await apiFetch<{ log: WorkLog }>(`/api/logs/${log.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          actingWorkerId: selectedWorkerId,
          status: 'completed',
        }),
      });
      setAllLogs((prev) =>
        prev.map((item) => (item.id === res.log.id ? res.log : item))
      );
      onLogUpdated(res.log);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '상태 변경에 실패했습니다.'
      );
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setDeletingId(id);
    try {
      await apiFetch(`/api/logs/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      setAllLogs((prev) => prev.filter((item) => item.id !== id));
      onLogDeleted(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '작업일지 삭제에 실패했습니다.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Left: Monthly Calendar Card */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Calendar Header & Month Switcher */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  aria-label="이전 달"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-extrabold text-slate-900 tabular-nums px-1 whitespace-nowrap">
                  {viewYear}년 {viewMonth}월
                </h2>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  aria-label="다음 달"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={jumpToToday}
                className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors whitespace-nowrap"
              >
                오늘
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="calendar-worker-filter" className="sr-only">
                작업자별 보기
              </label>
              <select
                id="calendar-worker-filter"
                value={calendarWorkerId}
                onChange={(e) => setCalendarWorkerId(e.target.value)}
                className="w-full sm:w-auto min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:bg-white focus:border-teal-700"
              >
                <option value="all">전체 직원 기록</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Monthly KPI Summary Strip */}
          <div className="grid grid-cols-4 gap-px bg-slate-100 border-b border-slate-100">
            <div className="bg-white px-3 py-3 sm:px-4">
              <p className="text-[11px] font-medium text-slate-500">이달 전체</p>
              <p className="mt-0.5 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                {monthSummary.total}건
              </p>
            </div>
            <div className="bg-white px-3 py-3 sm:px-4">
              <p className="text-[11px] font-medium text-emerald-700">완료</p>
              <p className="mt-0.5 text-base sm:text-lg font-bold text-emerald-700 tabular-nums">
                {monthSummary.completed}건
              </p>
            </div>
            <div className="bg-white px-3 py-3 sm:px-4">
              <p className="text-[11px] font-medium text-blue-700">진행 중</p>
              <p className="mt-0.5 text-base sm:text-lg font-bold text-blue-700 tabular-nums">
                {monthSummary.inProgress}건
              </p>
            </div>
            <div className="bg-white px-3 py-3 sm:px-4">
              <p className="text-[11px] font-medium text-amber-700">대기</p>
              <p className="mt-0.5 text-base sm:text-lg font-bold text-amber-700 tabular-nums">
                {monthSummary.pending}건
              </p>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="p-3 sm:p-5">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
              {WEEKDAYS.map((dayName, idx) => (
                <div
                  key={dayName}
                  className={`py-1 text-xs font-semibold ${
                    idx === 0
                      ? 'text-rose-600'
                      : idx === 6
                        ? 'text-blue-600'
                        : 'text-slate-500'
                  }`}
                >
                  {dayName}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-1.5 animate-pulse">
                {Array.from({ length: 35 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-14 sm:h-20 rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {calendarCells.map((cell, idx) => {
                  if (!cell) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="min-h-[54px] sm:min-h-[76px]"
                        aria-hidden="true"
                      />
                    );
                  }

                  const dayLogs = logsByDate.get(cell.dateStr) || [];
                  const totalCount = dayLogs.length;
                  const completedCount = dayLogs.filter(
                    (l) => (l.status || 'completed') === 'completed'
                  ).length;
                  const inProgressCount = dayLogs.filter(
                    (l) => l.status === 'in_progress'
                  ).length;
                  const pendingCount = dayLogs.filter(
                    (l) => l.status === 'pending'
                  ).length;

                  const isSelected = selectedDate === cell.dateStr;
                  const isToday = today === cell.dateStr;
                  const colIdx = idx % 7;

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => handleSelectDate(cell.dateStr)}
                      aria-label={`${cell.dateStr} 작업 ${totalCount}건`}
                      aria-pressed={isSelected}
                      className={`min-h-[54px] sm:min-h-[76px] p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
                        isSelected
                          ? 'bg-teal-800 border-teal-800 text-white shadow-sm'
                          : totalCount > 0
                            ? 'bg-slate-50/80 border-slate-200 hover:bg-slate-100 text-slate-900'
                            : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between gap-1">
                        <span
                          className={`text-xs sm:text-sm font-bold tabular-nums leading-none ${
                            isSelected
                              ? 'text-white'
                              : colIdx === 0
                                ? 'text-rose-600'
                                : colIdx === 6
                                  ? 'text-blue-600'
                                  : 'text-slate-800'
                          }`}
                        >
                          {cell.day}
                        </span>
                        {isToday && (
                          <span
                            className={`text-[10px] font-bold leading-none ${
                              isSelected ? 'text-amber-200' : 'text-teal-700'
                            }`}
                          >
                            오늘
                          </span>
                        )}
                      </div>

                      {totalCount > 0 && (
                        <div className="w-full space-y-1 mt-1">
                          <div
                            className={`text-[11px] font-bold tabular-nums leading-none ${
                              isSelected ? 'text-teal-100' : 'text-slate-700'
                            }`}
                          >
                            {totalCount}건
                          </div>

                          {/* Proportional Status Bar */}
                          <div
                            className={`w-full h-1.5 rounded-full overflow-hidden flex ${
                              isSelected ? 'bg-teal-950/60' : 'bg-slate-200'
                            }`}
                            aria-hidden="true"
                          >
                            {completedCount > 0 && (
                              <div
                                className="bg-emerald-500 h-full"
                                style={{
                                  width: `${(completedCount / totalCount) * 100}%`,
                                }}
                              />
                            )}
                            {inProgressCount > 0 && (
                              <div
                                className="bg-blue-500 h-full"
                                style={{
                                  width: `${(inProgressCount / totalCount) * 100}%`,
                                }}
                              />
                            )}
                            {pendingCount > 0 && (
                              <div
                                className="bg-amber-500 h-full"
                                style={{
                                  width: `${(pendingCount / totalCount) * 100}%`,
                                }}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Calendar Color Legend */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>날짜를 터치하면 해당 날짜의 작업 목록이 표시됩니다.</span>
              <div className="flex items-center gap-3 font-medium">
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="w-2.5 h-1.5 rounded-sm bg-emerald-500" aria-hidden="true" />
                  완료
                </span>
                <span className="inline-flex items-center gap-1 text-blue-700">
                  <span className="w-2.5 h-1.5 rounded-sm bg-blue-500" aria-hidden="true" />
                  진행 중
                </span>
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <span className="w-2.5 h-1.5 rounded-sm bg-amber-500" aria-hidden="true" />
                  대기
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Selected Date Work List */}
        <section
          ref={dayListRef}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden"
        >
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CalendarDays
                  className="w-4 h-4 text-teal-800 shrink-0"
                  aria-hidden="true"
                />
                <span>{formatDateKoreanHeading(selectedDate)}</span>
              </h3>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                작업 {selectedDayLogs.length}건
                {selectedDayLogs.length > 0 && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="text-emerald-700 font-medium">
                      완료 {selectedDaySummary.completed}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span className="text-blue-700 font-medium">
                      진행 {selectedDaySummary.inProgress}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span className="text-amber-700 font-medium">
                      대기 {selectedDaySummary.pending}
                    </span>
                  </>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onWriteForDate(selectedDate)}
              className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <PenSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span>이 날짜에 기록</span>
            </button>
          </div>

          {selectedDayLogs.length === 0 ? (
            <div className="p-8 sm:p-10 text-center">
              <ClipboardList
                className="w-9 h-9 text-slate-300 mx-auto mb-2.5"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-slate-800">
                등록된 작업일지가 없습니다.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                다른 날짜를 선택하거나 새 작업 기록을 추가해 보세요.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {selectedDayLogs.map((log) => {
                const isOwner = Boolean(
                  selectedWorkerId && log.workerId === selectedWorkerId
                );
                const canEdit = isAdmin || isOwner;
                const canDelete = isAdmin;

                return (
                  <article key={log.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <WorkStatusLabel status={log.status} />
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-900">
                          {log.workerName}
                        </span>
                        {log.workerRole && (
                          <span className="text-slate-500">({log.workerRole})</span>
                        )}
                      </div>
                      <span className="font-mono-tabular text-slate-400">
                        {formatKoreanDateTime(log.createdAt)}
                      </span>
                    </div>

                    <h4 className="mt-2 text-sm sm:text-base font-bold text-slate-900 break-words">
                      {log.location}
                    </h4>

                    <p className="mt-1 text-sm text-slate-700 leading-relaxed whitespace-pre-line break-words">
                      {log.content}
                    </p>

                    {log.photoUrl && (
                      <CalendarPhotoPreview
                        src={log.photoUrl}
                        alt={`${log.location} 작업 사진`}
                        onClick={() => {
                          const idx = slideshowItems.findIndex(
                            (item) => item.id === log.id
                          );
                          setSlideshowIndex(idx >= 0 ? idx : 0);
                        }}
                      />
                    )}

                    {(canEdit || canDelete) && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                        {canEdit && log.status !== 'completed' && (
                          <button
                            type="button"
                            disabled={updatingStatusId === log.id}
                            onClick={() => handleQuickComplete(log)}
                            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 rounded-xl inline-flex items-center gap-1 whitespace-nowrap"
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
                            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl inline-flex items-center gap-1 whitespace-nowrap"
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
                                  className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl whitespace-nowrap"
                                >
                                  삭제 확인
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl whitespace-nowrap"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(log.id)}
                                className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50/70 hover:bg-red-50 rounded-xl inline-flex items-center gap-1 whitespace-nowrap"
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
        </section>
      </div>

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

function CalendarPhotoPreview({
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
      <div className="mt-2.5 w-full h-32 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
        <ImageIcon className="w-5 h-5" aria-hidden="true" />
        <span className="text-xs">첨부된 사진</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2.5 relative block w-full text-left rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-40 object-cover group-hover:scale-[1.01] transition-transform duration-200"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-slate-950/70 backdrop-blur-xs text-white text-[11px] font-medium inline-flex items-center gap-1"
      >
        <Maximize2 className="w-3 h-3" />
        <span>전체화면</span>
      </span>
    </button>
  );
}

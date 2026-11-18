import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { apiFetch, formatKoreanDateTime } from '../utils/api';
import type { Handover, Notice, Worker } from '../types';

interface NoticeHandoverViewProps {
  notices: Notice[];
  handovers: Handover[];
  workers: Worker[];
  selectedWorkerId: string;
  isAdmin: boolean;
  onSelectWorker: (workerId: string) => void;
  onNoticesChange: (notices: Notice[]) => void;
  onHandoversChange: (handovers: Handover[]) => void;
  onNavigateAdmin: () => void;
}

const SHIFT_OPTIONS = ['주간/익일', '야간/당직', '주말/전체'] as const;

export function NoticeHandoverView({
  notices,
  handovers,
  workers,
  selectedWorkerId,
  isAdmin,
  onSelectWorker,
  onNoticesChange,
  onHandoversChange,
  onNavigateAdmin,
}: NoticeHandoverViewProps) {
  const [mobileSection, setMobileSection] = useState<'handovers' | 'notices'>(
    'handovers'
  );

  // Notice admin composer state
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticePinned, setNoticePinned] = useState(false);
  const [noticeSubmitting, setNoticeSubmitting] = useState(false);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState<string | null>(
    null
  );

  // Handover composer & filter state
  const [targetShift, setTargetShift] = useState<string>('주간/익일');
  const [handoverContent, setHandoverContent] = useState('');
  const [handoverSubmitting, setHandoverSubmitting] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [handoverFilter, setHandoverFilter] = useState<'all' | 'pending' | 'completed'>(
    'all'
  );
  const [editingHandoverId, setEditingHandoverId] = useState<string | null>(null);
  const [editingHandoverShift, setEditingHandoverShift] = useState('주간/익일');
  const [editingHandoverContent, setEditingHandoverContent] = useState('');
  const [confirmDeleteHandoverId, setConfirmDeleteHandoverId] = useState<
    string | null
  >(null);

  const selectedWorker = workers.find((w) => w.id === selectedWorkerId);
  const pendingCount = handovers.filter((h) => h.status === 'pending').length;

  const filteredHandovers = handovers.filter((h) => {
    if (handoverFilter === 'pending') return h.status === 'pending';
    if (handoverFilter === 'completed') return h.status === 'completed';
    return true;
  });

  // Notice handlers (Admin only)
  const handleCreateNotice = async (e: FormEvent) => {
    e.preventDefault();
    setNoticeError(null);
    setNoticeSubmitting(true);
    try {
      const res = await apiFetch<{ notice: Notice }>('/api/notices', {
        method: 'POST',
        body: JSON.stringify({
          title: noticeTitle.trim(),
          content: noticeContent.trim(),
          isPinned: noticePinned,
          authorName: selectedWorker?.name || '관리사무소',
        }),
      });
      const updated = [res.notice, ...notices].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
      onNoticesChange(updated);
      setNoticeTitle('');
      setNoticeContent('');
      setNoticePinned(false);
      setShowNoticeForm(false);
    } catch (err) {
      setNoticeError(
        err instanceof Error ? err.message : '공지사항 등록에 실패했습니다.'
      );
    } finally {
      setNoticeSubmitting(false);
    }
  };

  const handleToggleNoticePin = async (notice: Notice) => {
    try {
      const res = await apiFetch<{ notice: Notice }>(`/api/notices/${notice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPinned: !notice.isPinned }),
      });
      const updated = notices
        .map((n) => (n.id === res.notice.id ? res.notice : n))
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.createdAt.localeCompare(a.createdAt);
        });
      onNoticesChange(updated);
    } catch (err) {
      setNoticeError(
        err instanceof Error ? err.message : '공지 고정 변경에 실패했습니다.'
      );
    }
  };

  const handleDeleteNotice = async (id: string) => {
    try {
      await apiFetch(`/api/notices/${id}`, { method: 'DELETE' });
      setConfirmDeleteNoticeId(null);
      onNoticesChange(notices.filter((n) => n.id !== id));
    } catch (err) {
      setNoticeError(
        err instanceof Error ? err.message : '공지사항 삭제에 실패했습니다.'
      );
    }
  };

  // Handover handlers
  const handleCreateHandover = async (e: FormEvent) => {
    e.preventDefault();
    setHandoverError(null);
    if (!selectedWorkerId) {
      setHandoverError('인수인계를 등록하려면 먼저 본인 이름을 선택해 주세요.');
      return;
    }
    setHandoverSubmitting(true);
    try {
      const res = await apiFetch<{ handover: Handover }>('/api/handovers', {
        method: 'POST',
        body: JSON.stringify({
          workerId: selectedWorkerId,
          targetShift,
          content: handoverContent.trim(),
        }),
      });
      const updated = [res.handover, ...handovers].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
      onHandoversChange(updated);
      setHandoverContent('');
    } catch (err) {
      setHandoverError(
        err instanceof Error ? err.message : '인수인계 등록에 실패했습니다.'
      );
    } finally {
      setHandoverSubmitting(false);
    }
  };

  const handleToggleHandoverStatus = async (item: Handover) => {
    setHandoverError(null);
    if (!selectedWorkerId && !isAdmin) {
      setHandoverError('인계 확인을 처리하려면 먼저 본인 이름을 선택해 주세요.');
      return;
    }
    const nextStatus = item.status === 'pending' ? 'completed' : 'pending';
    try {
      const res = await apiFetch<{ handover: Handover }>(
        `/api/handovers/${item.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: nextStatus,
            actingWorkerId: selectedWorkerId,
          }),
        }
      );
      const updated = handovers
        .map((h) => (h.id === res.handover.id ? res.handover : h))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
          return b.createdAt.localeCompare(a.createdAt);
        });
      onHandoversChange(updated);
    } catch (err) {
      setHandoverError(
        err instanceof Error ? err.message : '상태 변경에 실패했습니다.'
      );
    }
  };

  const handleSaveHandoverEdit = async (id: string) => {
    setHandoverError(null);
    try {
      const res = await apiFetch<{ handover: Handover }>(`/api/handovers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          actingWorkerId: selectedWorkerId,
          targetShift: editingHandoverShift,
          content: editingHandoverContent.trim(),
        }),
      });
      onHandoversChange(
        handovers.map((h) => (h.id === res.handover.id ? res.handover : h))
      );
      setEditingHandoverId(null);
    } catch (err) {
      setHandoverError(
        err instanceof Error ? err.message : '인수인계 수정에 실패했습니다.'
      );
    }
  };

  const handleDeleteHandover = async (id: string) => {
    setHandoverError(null);
    try {
      await apiFetch(`/api/handovers/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ actingWorkerId: selectedWorkerId }),
      });
      setConfirmDeleteHandoverId(null);
      onHandoversChange(handovers.filter((h) => h.id !== id));
    } catch (err) {
      setHandoverError(
        err instanceof Error ? err.message : '인수인계 삭제에 실패했습니다.'
      );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mobile Segmented Switcher (< lg) */}
      <div className="lg:hidden grid grid-cols-2 gap-1 p-1 bg-slate-200/75 rounded-xl">
        <button
          type="button"
          onClick={() => setMobileSection('handovers')}
          className={`min-h-[44px] px-3 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap tabular-nums ${
            mobileSection === 'handovers'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          인수인계 ({pendingCount > 0 ? `미확인 ${pendingCount}` : handovers.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileSection('notices')}
          className={`min-h-[44px] px-3 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap tabular-nums ${
            mobileSection === 'notices'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          공지사항 ({notices.length})
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Notices Section */}
        <section
          className={`space-y-4 ${
            mobileSection === 'notices' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
                  <span>관리사무소 공지사항</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  등록된 공지 {notices.length}건 · 작성 및 삭제는 관리자 권한
                </p>
              </div>

              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setShowNoticeForm((prev) => !prev)}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{showNoticeForm ? '닫기' : '공지 등록'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onNavigateAdmin}
                  className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  관리자 인증
                </button>
              )}
            </div>

            {showNoticeForm && isAdmin && (
              <form
                onSubmit={handleCreateNotice}
                className="mt-4 pt-4 border-t border-slate-100 space-y-3"
              >
                <div>
                  <label
                    htmlFor="notice-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    공지 제목
                  </label>
                  <input
                    id="notice-title"
                    type="text"
                    required
                    maxLength={100}
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    placeholder="예: 12월 소방시설 종합정밀점검 안내"
                    className="w-full min-h-[44px] px-3.5 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                  />
                </div>

                <div>
                  <label
                    htmlFor="notice-content"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    공지 내용
                  </label>
                  <textarea
                    id="notice-content"
                    required
                    rows={3}
                    maxLength={1000}
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    placeholder="전 직원에게 전달할 공지 내용을 입력하세요."
                    className="w-full px-3.5 py-2.5 text-base md:text-sm leading-relaxed bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 min-h-[44px] text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noticePinned}
                      onChange={(e) => setNoticePinned(e.target.checked)}
                      className="w-4 h-4 accent-teal-800 rounded"
                    />
                    <span>상단 고정 공지로 등록</span>
                  </label>

                  <button
                    type="submit"
                    disabled={noticeSubmitting}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-xl whitespace-nowrap"
                  >
                    {noticeSubmitting ? '등록 중...' : '공지 올리기'}
                  </button>
                </div>
              </form>
            )}

            {noticeError && (
              <div
                role="alert"
                className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
              >
                {noticeError}
              </div>
            )}
          </div>

          {notices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
              등록된 공지사항이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {notices.map((notice) => (
                <article
                  key={notice.id}
                  className={`border rounded-2xl p-4 sm:p-5 transition-colors ${
                    notice.isPinned
                      ? 'bg-teal-50/40 border-teal-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      {notice.isPinned && (
                        <>
                          <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                            <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>고정 공지</span>
                          </span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span className="font-semibold text-slate-800">
                        {notice.authorName}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-slate-400">
                      {formatKoreanDateTime(notice.createdAt)}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900 break-words">
                    {notice.title}
                  </h3>
                  <p className="mt-1.5 text-[15px] text-slate-700 leading-relaxed whitespace-pre-line break-words">
                    {notice.content}
                  </p>

                  {isAdmin && (
                    <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleNoticePin(notice)}
                        className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{notice.isPinned ? '고정 해제' : '상단 고정'}</span>
                      </button>

                      {confirmDeleteNoticeId === notice.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteNotice(notice.id)}
                            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl whitespace-nowrap"
                          >
                            삭제 확인
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteNoticeId(null)}
                            className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl whitespace-nowrap"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteNoticeId(notice.id)}
                          className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>삭제</span>
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Handover Section */}
        <section
          className={`space-y-4 ${
            mobileSection === 'handovers' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Handover Composer */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ArrowRightLeft
                    className="w-4 h-4 text-teal-800 shrink-0"
                    aria-hidden="true"
                  />
                  <span>교대·업무 인수인계</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  미확인 {pendingCount}건 · 전체 {handovers.length}건
                </p>
              </div>
            </div>

            {!selectedWorker && (
              <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label
                  htmlFor="handover-worker-select"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  작성·확인 전 본인 이름을 먼저 선택하세요
                </label>
                <select
                  id="handover-worker-select"
                  value={selectedWorkerId}
                  onChange={(e) => onSelectWorker(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                >
                  <option value="">직원 이름을 선택하세요</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.role || '직원'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <form onSubmit={handleCreateHandover} className="space-y-3">
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                  인계 대상 근무
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {SHIFT_OPTIONS.map((shift) => (
                    <button
                      key={shift}
                      type="button"
                      onClick={() => setTargetShift(shift)}
                      className={`min-h-[40px] px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap ${
                        targetShift === shift
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {shift}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="handover-content"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  전달할 인수인계 내용
                </label>
                <textarea
                  id="handover-content"
                  required
                  rows={3}
                  maxLength={800}
                  value={handoverContent}
                  onChange={(e) => setHandoverContent(e.target.value)}
                  placeholder="예: 703동 지하수 펌프 점검 업체 내일 10시 방문 예정, 열쇠 전달 필요"
                  className="w-full px-3.5 py-2.5 text-base md:text-sm leading-relaxed bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700"
                />
              </div>

              {handoverError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
                >
                  {handoverError}
                </div>
              )}

              <button
                type="submit"
                disabled={handoverSubmitting}
                className="w-full min-h-[48px] px-4 py-2.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {handoverSubmitting ? '등록 중...' : '인수인계 등록하기'}
              </button>
            </form>
          </div>

          {/* Handover Status Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setHandoverFilter('all')}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                handoverFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              전체 ({handovers.length})
            </button>
            <button
              type="button"
              onClick={() => setHandoverFilter('pending')}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                handoverFilter === 'pending'
                  ? 'bg-amber-700 text-white border-amber-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              미확인 ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setHandoverFilter('completed')}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                handoverFilter === 'completed'
                  ? 'bg-teal-800 text-white border-teal-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              확인 완료 ({handovers.length - pendingCount})
            </button>
          </div>

          {/* Handover List */}
          {filteredHandovers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
              표시할 인수인계 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHandovers.map((item) => {
                const isOwner = Boolean(
                  selectedWorkerId && item.workerId === selectedWorkerId
                );
                const canManage = isAdmin || isOwner;
                const isEditing = editingHandoverId === item.id;

                return (
                  <article
                    key={item.id}
                    className={`border rounded-2xl p-4 sm:p-5 transition-colors ${
                      item.status === 'pending'
                        ? 'bg-white border-amber-200'
                        : 'bg-white border-slate-200 opacity-90'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>미확인</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>확인 완료</span>
                          </span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-800">
                          {item.targetShift}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700">
                          {item.workerName}
                        </span>
                      </div>
                      <span className="font-mono-tabular text-slate-400">
                        {formatKoreanDateTime(item.createdAt)}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="mt-3 space-y-2.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          {SHIFT_OPTIONS.map((shift) => (
                            <button
                              key={shift}
                              type="button"
                              onClick={() => setEditingHandoverShift(shift)}
                              className={`min-h-[38px] px-2 py-1 text-xs font-semibold rounded-lg border ${
                                editingHandoverShift === shift
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {shift}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={3}
                          value={editingHandoverContent}
                          onChange={(e) => setEditingHandoverContent(e.target.value)}
                          className="w-full px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingHandoverId(null)}
                            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveHandoverEdit(item.id)}
                            className="min-h-[40px] px-4 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-xl"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2.5 text-[15px] text-slate-800 leading-relaxed whitespace-pre-line break-words">
                        {item.content}
                      </p>
                    )}

                    {item.status === 'completed' && item.completedBy && (
                      <p className="mt-2 text-xs text-slate-500">
                        확인자: <span className="font-semibold text-slate-700">{item.completedBy}</span>
                        {item.completedAt && (
                          <span className="font-mono-tabular text-slate-400">
                            {' '}
                            · {formatKoreanDateTime(item.completedAt)}
                          </span>
                        )}
                      </p>
                    )}

                    {!isEditing && (
                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleHandoverStatus(item)}
                          className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                            item.status === 'pending'
                              ? 'bg-teal-800 hover:bg-teal-900 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {item.status === 'pending'
                              ? '인계 확인 완료'
                              : '미확인으로 되돌리기'}
                          </span>
                        </button>

                        {canManage && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingHandoverId(item.id);
                                setEditingHandoverShift(item.targetShift);
                                setEditingHandoverContent(item.content);
                              }}
                              className="min-h-[44px] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>수정</span>
                            </button>

                            {confirmDeleteHandoverId === item.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHandover(item.id)}
                                  className="min-h-[44px] px-3 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl whitespace-nowrap"
                                >
                                  확인
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteHandoverId(null)}
                                  className="min-h-[44px] px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl whitespace-nowrap"
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteHandoverId(item.id)}
                                className="min-h-[44px] px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>삭제</span>
                              </button>
                            )}
                          </div>
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
    </div>
  );
}

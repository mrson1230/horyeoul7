import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Camera, ImagePlus, Trash2, X } from 'lucide-react';
import { apiFetch, compressImageToBase64 } from '../utils/api';
import { WorkStatusSelector } from './WorkStatusLabel';
import type { WorkLog, WorkStatus } from '../types';

interface EditLogModalProps {
  log: WorkLog;
  actingWorkerId: string;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (updated: WorkLog) => void;
}

export function EditLogModal({
  log,
  actingWorkerId,
  isAdmin,
  onClose,
  onSaved,
}: EditLogModalProps) {
  const [workDate, setWorkDate] = useState(log.workDate);
  const [status, setStatus] = useState<WorkStatus>(log.status || 'completed');
  const [location, setLocation] = useState(log.location);
  const [content, setContent] = useState(log.content);
  const [newPhotoBase64, setNewPhotoBase64] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentPreviewUrl = newPhotoBase64
    ? newPhotoBase64
    : removePhoto
      ? null
      : log.photoUrl;

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setPhotoLoading(true);
    try {
      const compressed = await compressImageToBase64(file);
      setNewPhotoBase64(compressed);
      setRemovePhoto(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '사진을 불러오는 중 오류가 발생했습니다.'
      );
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ log: WorkLog }>(`/api/logs/${log.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          actingWorkerId,
          workDate,
          status,
          location: location.trim(),
          content: content.trim(),
          photoBase64: newPhotoBase64,
          removePhoto,
        }),
      });
      onSaved(res.log);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '작업일지 수정에 실패했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-log-title"
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 id="edit-log-title" className="text-base font-bold text-slate-900">
              작업일지 수정
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              작성자: {log.workerName} · {isAdmin ? '관리자 권한 수정' : '본인 기록 수정'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label
              htmlFor="edit-work-date"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              작업 날짜
            </label>
            <input
              id="edit-work-date"
              type="date"
              required
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-mono-tabular bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-slate-800 mb-1.5">
              진행 상태
            </span>
            <WorkStatusSelector value={status} onChange={setStatus} />
          </div>

          <div>
            <label
              htmlFor="edit-work-location"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              작업 장소
            </label>
            <input
              id="edit-work-location"
              type="text"
              required
              maxLength={80}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full min-h-[48px] px-3.5 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <div>
            <label
              htmlFor="edit-work-content"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              처리 내용
            </label>
            <textarea
              id="edit-work-content"
              required
              rows={4}
              maxLength={1000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3.5 py-3 text-base leading-relaxed bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-slate-800 mb-1.5">
              작업 완료 사진
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {currentPreviewUrl ? (
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img
                  src={currentPreviewUrl}
                  alt="작업 사진 미리보기"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-52 object-cover"
                />
                <div className="p-2.5 bg-white border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={photoLoading}
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>사진 변경</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPhotoBase64(null);
                      setRemovePhoto(true);
                    }}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>사진 삭제</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={photoLoading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[48px] px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 flex items-center justify-center gap-2"
              >
                <ImagePlus className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <span>{photoLoading ? '사진 처리 중...' : '새 사진 첨부하기'}</span>
              </button>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium"
            >
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving || photoLoading}
              className="flex-1 min-h-[48px] px-4 py-2.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? '저장 중...' : '수정 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

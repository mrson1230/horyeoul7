import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ImagePlus,
  Trash2,
  UserCheck,
} from 'lucide-react';
import {
  apiFetch,
  compressImageToBase64,
  getKoreaDateOffset,
  getTodayKoreaDate,
} from '../utils/api';
import { WorkStatusSelector } from './WorkStatusLabel';
import type { Worker, WorkLog, WorkStatus } from '../types';

interface WorkLogComposerProps {
  workers: Worker[];
  selectedWorkerId: string;
  prefillDate?: { date: string; seq: number } | null;
  onSelectWorker: (workerId: string) => void;
  onLogCreated: (log: WorkLog) => void;
  onNavigateAdmin: () => void;
  onNavigateFeed: () => void;
}

const PRESET_LOCATIONS = [
  '701동 지하주차장',
  '704동 중앙보행로',
  '어린이놀이터',
  '관리동 사무실',
  '정문 경비실',
  '승강기 로비',
];

export function WorkLogComposer({
  workers,
  selectedWorkerId,
  prefillDate,
  onSelectWorker,
  onLogCreated,
  onNavigateAdmin,
  onNavigateFeed,
}: WorkLogComposerProps) {
  const todayDate = getTodayKoreaDate();
  const yesterdayDate = getKoreaDateOffset(-1);

  const [workDate, setWorkDate] = useState(todayDate);
  const [status, setStatus] = useState<WorkStatus>('completed');
  const [location, setLocation] = useState('');
  const [content, setContent] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (prefillDate?.date) {
      setWorkDate(prefillDate.date);
    }
  }, [prefillDate]);

  const selectedWorker = workers.find((w) => w.id === selectedWorkerId);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setPhotoLoading(true);
    try {
      const compressed = await compressImageToBase64(file);
      setPhotoBase64(compressed);
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
    setSuccessMessage(null);

    if (!selectedWorkerId) {
      setError('먼저 작업자 선택란에서 본인 이름을 선택해 주세요.');
      return;
    }
    if (!location.trim()) {
      setError('작업 장소를 입력해 주세요.');
      return;
    }
    if (!content.trim()) {
      setError('처리 내용을 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ log: WorkLog }>('/api/logs', {
        method: 'POST',
        body: JSON.stringify({
          workerId: selectedWorkerId,
          workDate,
          status,
          location: location.trim(),
          content: content.trim(),
          photoBase64,
        }),
      });
      onLogCreated(res.log);
      setStatus('completed');
      setLocation('');
      setContent('');
      setPhotoBase64(null);
      setSuccessMessage('작업일지가 정상적으로 등록되었습니다.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '작업일지 등록에 실패했습니다.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Worker Selection Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
              <span>작업자 선택</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              직원 이름을 눌러 선택하세요.
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              명단은 관리자가 관리합니다.
            </p>
          </div>
          {selectedWorker && (
            <span className="text-xs font-semibold text-teal-800 whitespace-nowrap shrink-0">
              {selectedWorker.name} · {selectedWorker.role}
            </span>
          )}
        </div>

        {workers.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>등록된 직원이 없습니다. 관리자 화면에서 직원을 등록해 주세요.</span>
            <button
              type="button"
              onClick={onNavigateAdmin}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg whitespace-nowrap shrink-0"
            >
              관리자 화면 이동
            </button>
          </div>
        ) : workers.length <= 10 ? (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="직원 이름 선택">
            {workers.map((worker) => {
              const active = worker.id === selectedWorkerId;
              return (
                <button
                  key={worker.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSelectWorker(worker.id)}
                  className={`min-h-[48px] px-3 py-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 active:scale-[0.98] ${
                    active
                      ? 'bg-teal-800 border-teal-800 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{worker.name}</div>
                    <div
                      className={`text-[11px] truncate ${
                        active ? 'text-teal-100' : 'text-slate-500'
                      }`}
                    >
                      {worker.role || '직원'}
                    </div>
                  </div>
                  {active && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <label htmlFor="worker-select" className="sr-only">
              직원 이름을 선택하세요
            </label>
            <select
              id="worker-select"
              value={selectedWorkerId}
              onChange={(e) => onSelectWorker(e.target.value)}
              className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 transition-colors"
            >
              <option value="">직원 이름을 선택하세요</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name} ({worker.role || '직원'})
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Work Log Form Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
        <div className="mb-4 sm:mb-5">
          <h2 className="text-base font-bold text-slate-900">오늘의 작업 기록</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            작성한 내용은 전체 직원이 함께 열람하며, 본인 기록만 수정할 수 있습니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="work-date"
                className="block text-sm font-semibold text-slate-800"
              >
                작업 날짜
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setWorkDate(todayDate)}
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    workDate === todayDate
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  오늘
                </button>
                <button
                  type="button"
                  onClick={() => setWorkDate(yesterdayDate)}
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    workDate === yesterdayDate
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  어제
                </button>
              </div>
            </div>
            <input
              id="work-date"
              type="date"
              required
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-mono-tabular bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 transition-colors"
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
              htmlFor="work-location"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              작업 장소
            </label>
            <input
              id="work-location"
              type="text"
              required
              maxLength={80}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="예: 702동 1층 로비, 지하주차장 B1 등"
              className="w-full min-h-[48px] px-3.5 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 transition-colors"
            />
            <div className="mt-2 flex md:flex-wrap gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {PRESET_LOCATIONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLocation(preset)}
                  className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 active:scale-[0.98] ${
                    location === preset
                      ? 'bg-teal-800 text-white border-teal-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="work-content"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              처리 내용
            </label>
            <textarea
              id="work-content"
              required
              rows={4}
              maxLength={1000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="점검 사항, 수선 내용, 교체 자재 등 작업 처리 내용을 입력하세요."
              className="w-full px-3.5 py-3 text-base leading-relaxed bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 transition-colors resize-y"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-slate-800 mb-1.5">
              작업 완료 사진 <span className="text-xs font-normal text-slate-500">(선택)</span>
            </span>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {!photoBase64 ? (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={photoLoading}
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-[48px] px-3 py-2.5 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] border border-slate-200 rounded-xl text-sm font-medium text-slate-700 flex items-center justify-center gap-2 transition-all whitespace-nowrap"
                >
                  <Camera className="w-4 h-4 text-slate-600 shrink-0" aria-hidden="true" />
                  <span>{photoLoading ? '처리 중...' : '사진 촬영'}</span>
                </button>
                <button
                  type="button"
                  disabled={photoLoading}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[48px] px-3 py-2.5 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] border border-slate-200 rounded-xl text-sm font-medium text-slate-700 flex items-center justify-center gap-2 transition-all whitespace-nowrap"
                >
                  <ImagePlus className="w-4 h-4 text-slate-600 shrink-0" aria-hidden="true" />
                  <span>{photoLoading ? '처리 중...' : '앨범 선택'}</span>
                </button>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img
                  src={photoBase64}
                  alt="작업 완료 사진 미리보기"
                  className="w-full max-h-60 object-cover"
                />
                <div className="p-2.5 bg-white border-t border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">사진 첨부 준비 완료</span>
                  <button
                    type="button"
                    onClick={() => setPhotoBase64(null)}
                    className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>삭제</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium"
            >
              {error}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-sm text-teal-900 font-medium flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSuccessMessage(null);
                  onNavigateFeed();
                }}
                className="md:hidden min-h-[36px] px-3 py-1 text-xs font-semibold text-teal-900 bg-white border border-teal-200 rounded-lg whitespace-nowrap"
              >
                전체 내역 보기
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || photoLoading}
            className="w-full min-h-[52px] px-4 py-3 bg-teal-800 hover:bg-teal-900 active:scale-[0.98] disabled:opacity-60 text-white text-base font-semibold rounded-xl transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          >
            {submitting ? '등록 중...' : '작업일지 등록하기'}
          </button>
        </form>
      </section>
    </div>
  );
}

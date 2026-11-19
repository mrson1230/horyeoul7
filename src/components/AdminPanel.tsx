import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  KeyRound,
  Lock,
  Pencil,
  PlusCircle,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  apiFetch,
  getStoredToken,
  getTodayKoreaDate,
  setStoredMemoryWorkers,
  setStoredToken,
} from '../utils/api';
import type { StorageMode } from '../utils/api';
import { AdSlotManagerSection } from './AdSlotManagerSection';
import { BannerMakerSection } from './BannerMakerSection';
import { WorkStatusLabel } from './WorkStatusLabel';
import type {
  AdSlotStateResponse,
  Apartment,
  EventBanner,
  ExternalAdConfig,
  Worker,
  WorkLog,
  WorkStatus,
} from '../types';

interface AdminPanelProps {
  isAdmin: boolean;
  isMaster: boolean;
  apartmentId: string;
  apartmentName: string;
  officeName: string;
  storageMode: StorageMode | null;
  workers: Worker[];
  logs: WorkLog[];
  banners: EventBanner[];
  adSlot: ExternalAdConfig;
  globalAdSlot: ExternalAdConfig;
  hasApartmentOverride: boolean;
  filterWorkerId: string;
  filterDate: string;
  filterStatus: 'all' | WorkStatus;
  searchQuery: string;
  onAdminStateChanged: (isAdmin: boolean) => void;
  onMasterStateChanged: (isMaster: boolean) => void;
  onApartmentUpdated: (apt: Apartment) => void;
  onWorkersChanged: () => void;
  onWorkersReplaced: (next: Worker[]) => void;
  onBannersChanged: (next: EventBanner[]) => void;
  onAdStateChanged: (next: AdSlotStateResponse) => void;
  onEditLog: (log: WorkLog) => void;
  onLogDeleted: (id: string) => void;
}

export function AdminPanel({
  isAdmin,
  isMaster,
  apartmentId,
  apartmentName,
  officeName,
  storageMode,
  workers,
  logs,
  banners,
  adSlot,
  globalAdSlot,
  hasApartmentOverride,
  filterWorkerId,
  filterDate,
  filterStatus,
  searchQuery,
  onAdminStateChanged,
  onMasterStateChanged,
  onApartmentUpdated,
  onWorkersChanged,
  onWorkersReplaced,
  onBannersChanged,
  onAdStateChanged,
  onEditLog,
  onLogDeleted,
}: AdminPanelProps) {
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Worker add state
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerRole, setNewWorkerRole] = useState('');
  const [workerLoading, setWorkerLoading] = useState(false);
  const [removingWorkerId, setRemovingWorkerId] = useState<string | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [confirmRemoveWorkerId, setConfirmRemoveWorkerId] = useState<string | null>(
    null
  );

  // Log delete confirm state
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  // Password settings state
  const [nextCompanyPw, setNextCompanyPw] = useState('');
  const [nextAdminPw, setNextAdminPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  // Apartment edit + multi-apartment registry
  const [editAptName, setEditAptName] = useState(apartmentName);
  const [editOfficeName, setEditOfficeName] = useState(officeName);
  const [aptSaving, setAptSaving] = useState(false);
  const [aptMessage, setAptMessage] = useState<string | null>(null);
  const [aptError, setAptError] = useState<string | null>(null);

  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [showNewAptForm, setShowNewAptForm] = useState(false);
  const [newAptName, setNewAptName] = useState('');
  const [newAptOffice, setNewAptOffice] = useState('');
  const [newAptCompanyId, setNewAptCompanyId] = useState('');
  const [newAptCompanyPw, setNewAptCompanyPw] = useState('');
  const [newAptAdminPw, setNewAptAdminPw] = useState('');
  const [newAptCreating, setNewAptCreating] = useState(false);
  const [newAptError, setNewAptError] = useState<string | null>(null);
  const [newAptMessage, setNewAptMessage] = useState<string | null>(null);

  // Export feedback
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setEditAptName(apartmentName);
    setEditOfficeName(officeName);
  }, [apartmentName, officeName]);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch<{ apartments: Apartment[] }>('/api/apartments')
      .then((res) => setApartments(res.apartments))
      .catch(() => {
        // Ignore
      });
  }, [isAdmin]);

  const handleUnlockAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await apiFetch<{ isAdmin: boolean; token?: string }>(
        '/api/auth/admin/unlock',
        {
          method: 'POST',
          body: JSON.stringify({ adminPassword: adminPasswordInput }),
        }
      );
      if (res.token) {
        setStoredToken(res.token);
      }
      setAdminPasswordInput('');
      onAdminStateChanged(true);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : '관리자 인증에 실패했습니다.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLockAdmin = async () => {
    const res = await apiFetch<{ isAdmin: boolean; token?: string }>(
      '/api/auth/admin/lock',
      { method: 'POST' }
    );
    if (res.token) {
      setStoredToken(res.token);
    }
    onAdminStateChanged(false);
  };

  const handleAddWorker = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = newWorkerName.trim();
    const trimmedRole = newWorkerRole.trim() || '직원';
    if (!trimmedName) {
      setWorkerError('직원 이름을 입력해 주세요.');
      return;
    }
    if (workers.some((w) => w.name === trimmedName)) {
      setWorkerError('이미 등록된 직원 이름입니다.');
      return;
    }

    setWorkerError(null);
    setWorkerLoading(true);
    try {
      const res = await apiFetch<{
        worker: Worker;
        workers?: Worker[];
        storage?: StorageMode;
      }>('/api/workers', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          role: trimmedRole,
        }),
      });
      setNewWorkerName('');
      setNewWorkerRole('');

      const activeMode = res.storage || storageMode;
      if (activeMode === 'memory') {
        const nextWorkers = [...workers, res.worker];
        setStoredMemoryWorkers(apartmentId, nextWorkers);
        onWorkersReplaced(nextWorkers);
      } else if (Array.isArray(res.workers)) {
        onWorkersReplaced(res.workers);
      } else {
        onWorkersChanged();
      }
    } catch (err) {
      setWorkerError(
        err instanceof Error ? err.message : '직원 등록에 실패했습니다.'
      );
    } finally {
      setWorkerLoading(false);
    }
  };

  const handleRemoveWorker = async (id: string) => {
    setWorkerError(null);
    setRemovingWorkerId(id);
    try {
      const res = await apiFetch<{
        ok: boolean;
        deletedId?: string;
        workers?: Worker[];
        storage?: StorageMode;
      }>(`/api/workers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setConfirmRemoveWorkerId(null);

      const activeMode = res.storage || storageMode;
      if (activeMode === 'memory') {
        const nextWorkers = workers.filter((w) => w.id !== id);
        setStoredMemoryWorkers(apartmentId, nextWorkers);
        onWorkersReplaced(nextWorkers);
      } else if (Array.isArray(res.workers)) {
        onWorkersReplaced(res.workers);
      } else {
        onWorkersChanged();
      }
    } catch (err) {
      setWorkerError(
        err instanceof Error ? err.message : '직원 삭제에 실패했습니다.'
      );
    } finally {
      setRemovingWorkerId(null);
    }
  };

  const handleDeleteLog = async (id: string) => {
    setDeletingLogId(id);
    try {
      await apiFetch(`/api/logs/${id}`, { method: 'DELETE' });
      setConfirmDeleteLogId(null);
      onLogDeleted(id);
    } finally {
      setDeletingLogId(null);
    }
  };

  const handleExportCsv = async (useActiveFilters: boolean) => {
    setExportError(null);
    try {
      const token = getStoredToken();
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (useActiveFilters) {
        if (filterWorkerId && filterWorkerId !== 'all') {
          params.set('workerId', filterWorkerId);
        }
        if (filterDate) params.set('date', filterDate);
        if (filterStatus && filterStatus !== 'all') {
          params.set('status', filterStatus);
        }
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
      }

      const response = await fetch(`/api/logs/export.csv?${params.toString()}`);
      if (!response.ok) {
        throw new Error('엑셀 파일 생성에 실패했습니다.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${apartmentName.replace(/\s+/g, '')}_공동작업일지_${getTodayKoreaDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : '파일 다운로드에 실패했습니다.'
      );
    }
  };

  const handleSavePasswords = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwMessage(null);
    if (!nextCompanyPw.trim() && !nextAdminPw.trim()) {
      setPwError('변경할 비밀번호를 입력해 주세요.');
      return;
    }

    setPwSaving(true);
    try {
      const payload: { companyPassword?: string; adminPassword?: string } = {};
      if (nextCompanyPw.trim()) payload.companyPassword = nextCompanyPw.trim();
      if (nextAdminPw.trim()) payload.adminPassword = nextAdminPw.trim();

      await apiFetch('/api/settings/passwords', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setNextCompanyPw('');
      setNextAdminPw('');
      setPwMessage('보안 비밀번호가 안전하게 변경되었습니다.');
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다.'
      );
    } finally {
      setPwSaving(false);
    }
  };

  const handleSaveCurrentApartment = async (e: FormEvent) => {
    e.preventDefault();
    setAptError(null);
    setAptMessage(null);
    setAptSaving(true);
    try {
      const res = await apiFetch<{ apartment: Apartment }>(
        '/api/apartments/current',
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editAptName.trim(),
            officeName: editOfficeName.trim(),
          }),
        }
      );
      onApartmentUpdated(res.apartment);
      setApartments((prev) =>
        prev.map((a) => (a.id === res.apartment.id ? res.apartment : a))
      );
      setAptMessage('단지 정보가 업데이트되었습니다.');
    } catch (err) {
      setAptError(
        err instanceof Error ? err.message : '단지 정보 수정에 실패했습니다.'
      );
    } finally {
      setAptSaving(false);
    }
  };

  const handleRegisterNewApartment = async (e: FormEvent) => {
    e.preventDefault();
    setNewAptError(null);
    setNewAptMessage(null);
    setNewAptCreating(true);
    try {
      const res = await apiFetch<{ apartment: Apartment }>('/api/apartments', {
        method: 'POST',
        body: JSON.stringify({
          name: newAptName.trim(),
          officeName: newAptOffice.trim() || undefined,
          companyId: newAptCompanyId.trim(),
          companyPassword: newAptCompanyPw,
          adminPassword: newAptAdminPw,
          autoLogin: false,
        }),
      });
      setApartments((prev) => [...prev, res.apartment]);
      setNewAptName('');
      setNewAptOffice('');
      setNewAptCompanyId('');
      setNewAptCompanyPw('');
      setNewAptAdminPw('');
      setShowNewAptForm(false);
      setNewAptMessage(
        `${res.apartment.name} 단지가 등록되었습니다. 로그인 화면에서 해당 단지를 선택해 접속할 수 있습니다.`
      );
    } catch (err) {
      setNewAptError(
        err instanceof Error ? err.message : '신규 아파트 등록에 실패했습니다.'
      );
    } finally {
      setNewAptCreating(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8">
          <div className="flex items-center gap-2.5 text-teal-800 mb-2">
            <ShieldCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-900">관리자 인증</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            직원 명단 등록·삭제, 행사·경조사 배너 제작, 전체 작업일지 수정·삭제, 엑셀 파일 통합 다운로드 및 단지·보안 설정은 관리자 비밀번호 인증 후 이용할 수 있습니다.
          </p>

          <form onSubmit={handleUnlockAdmin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                관리자 비밀번호
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                placeholder="관리자 비밀번호를 입력하세요"
                className="w-full min-h-[48px] px-3.5 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              />
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full min-h-[48px] px-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>{authLoading ? '확인 중...' : '관리자 모드 잠금 해제'}</span>
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 font-mono-tabular">
              초기 관리자 비밀번호: admin7777
            </span>
            <button
              type="button"
              onClick={() => setAdminPasswordInput('admin7777')}
              className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg whitespace-nowrap"
            >
              초기값 입력
            </button>
          </div>
        </section>
      </div>
    );
  }

  const today = getTodayKoreaDate();
  const todayCount = logs.filter((l) => l.workDate === today).length;
  const photoCount = logs.filter((l) => Boolean(l.photoUrl)).length;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Top Admin Status & KPI Strip */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              관리자 통합 관리
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {officeName} · 전체 기록 관리 및 엑셀 다운로드
            </p>
          </div>
          <button
            type="button"
            onClick={handleLockAdmin}
            className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>관리자 모드 잠금</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100">
          <div className="bg-white p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">조회된 작업일지</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {logs.length}건
            </p>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">오늘 등록</p>
            <p className="mt-1 text-2xl font-bold text-teal-800 tabular-nums">
              {todayCount}건
            </p>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">등록 직원 수</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {workers.length}명
            </p>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">사진 첨부</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {photoCount}건
            </p>
          </div>
        </div>
      </section>

      {/* Excel Download + Worker Management Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start">
        {/* Excel Export Section */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-1.5">
            <Download className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
            <h3 className="text-base font-bold text-slate-900">
              엑셀 파일 통합 다운로드
            </h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            단지명, 작업 날짜, 진행 상태, 작성자, 직책, 작업 장소, 처리 내용, 사진 첨부 여부 및 등록 시각이 포함된 엑셀 호환 CSV 파일을 내려받습니다.
          </p>

          {exportError && (
            <div
              role="alert"
              className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
            >
              {exportError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => handleExportCsv(false)}
              className="flex-1 min-h-[48px] px-4 py-2.5 bg-teal-800 hover:bg-teal-900 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>전체 일지 다운로드 (CSV)</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportCsv(true)}
              className="min-h-[48px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
            >
              현재 필터 조건만 받기
            </button>
          </div>
        </section>

        {/* Worker Management Section */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-1.5">
            <Users className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
            <h3 className="text-base font-bold text-slate-900">
              직원 이름 등록 및 삭제
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            여기서 등록한 직원 목록이 작업일지 작성 화면의 작업자 선택 목록에 즉시 반영됩니다.
          </p>

          {storageMode === 'memory' && (
            <div
              role="status"
              className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2 leading-relaxed"
            >
              <AlertTriangle
                className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>
                현재 배포 서버가 <strong>임시 메모리 모드(DB 미연결)</strong>로 실행 중입니다. 이 브라우저에서는 등록·삭제가 유지되지만, 모든 직원 기기에서 영구 동기화하려면 배포 환경 변수에{' '}
                <code className="px-1 py-0.5 bg-amber-100 rounded font-mono text-[11px]">
                  DATABASE_URL
                </code>
                (PostgreSQL)을 연결해 주세요.
              </span>
            </div>
          )}

          <form onSubmit={handleAddWorker} className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              type="text"
              required
              maxLength={20}
              value={newWorkerName}
              onChange={(e) => setNewWorkerName(e.target.value)}
              placeholder="직원 이름 (예: 홍길동)"
              className="flex-1 min-h-[48px] sm:min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
            <input
              type="text"
              maxLength={20}
              value={newWorkerRole}
              onChange={(e) => setNewWorkerRole(e.target.value)}
              placeholder="직책 (예: 기사)"
              className="sm:w-32 min-h-[48px] sm:min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
            <button
              type="submit"
              disabled={workerLoading}
              className="min-h-[48px] sm:min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              <span>{workerLoading ? '등록 중...' : '등록'}</span>
            </button>
          </form>

          {workerError && (
            <div
              role="alert"
              className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
            >
              {workerError}
            </div>
          )}

          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {workers.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                등록된 직원이 없습니다.
              </p>
            ) : (
              workers.map((worker) => (
                <div
                  key={worker.id}
                  className="py-2.5 flex items-center justify-between gap-3 min-h-[56px]"
                >
                  <div className="text-sm">
                    <span className="font-semibold text-slate-900">
                      {worker.name}
                    </span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-slate-500">{worker.role || '직원'}</span>
                  </div>

                  {confirmRemoveWorkerId === worker.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={removingWorkerId === worker.id}
                        onClick={() => handleRemoveWorker(worker.id)}
                        className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg whitespace-nowrap"
                      >
                        {removingWorkerId === worker.id ? '삭제 중...' : '삭제 확인'}
                      </button>
                      <button
                        type="button"
                        disabled={removingWorkerId === worker.id}
                        onClick={() => setConfirmRemoveWorkerId(null)}
                        className="min-h-[44px] px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 rounded-lg whitespace-nowrap"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveWorkerId(worker.id)}
                      className="min-h-[44px] px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Event & Condolence/Wedding Banner Maker */}
      <BannerMakerSection
        officeName={officeName}
        banners={banners}
        onBannersChanged={onBannersChanged}
      />

      {/* Bottom External Ad Slot Configuration */}
      <AdSlotManagerSection
        adSlot={adSlot}
        globalAdSlot={globalAdSlot}
        hasApartmentOverride={hasApartmentOverride}
        isMaster={isMaster}
        onMasterStateChanged={onMasterStateChanged}
        onAdStateChanged={onAdStateChanged}
      />

      {/* Apartment Management & New Apartment Registration */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
              <h3 className="text-base font-bold text-slate-900">
                아파트 단지 설정 및 타 단지 등록
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              현재 접속 중인 단지 명칭을 수정하거나, 다른 아파트에서 사용할 새 단지를 등록할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowNewAptForm((prev) => !prev);
              setNewAptError(null);
            }}
            className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            <span>{showNewAptForm ? '등록 창 닫기' : '새 아파트 등록'}</span>
          </button>
        </div>

        {/* Edit Current Apartment Info */}
        <form
          onSubmit={handleSaveCurrentApartment}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-3 border-t border-slate-100"
        >
          <div>
            <label
              htmlFor="edit-apt-name"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              현재 아파트 단지명
            </label>
            <input
              id="edit-apt-name"
              type="text"
              required
              maxLength={40}
              value={editAptName}
              onChange={(e) => setEditAptName(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>
          <div>
            <label
              htmlFor="edit-office-name"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              관리사무소 표기명
            </label>
            <input
              id="edit-office-name"
              type="text"
              required
              maxLength={50}
              value={editOfficeName}
              onChange={(e) => setEditOfficeName(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>
          <button
            type="submit"
            disabled={aptSaving}
            className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-xl whitespace-nowrap"
          >
            {aptSaving ? '저장 중...' : '현재 단지명 저장'}
          </button>
        </form>

        {aptError && <p className="text-xs font-medium text-red-600">{aptError}</p>}
        {aptMessage && (
          <p className="text-xs font-medium text-teal-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{aptMessage}</span>
          </p>
        )}

        {/* New Apartment Registration Sub-form */}
        {showNewAptForm && (
          <form
            onSubmit={handleRegisterNewApartment}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <p className="text-xs font-bold text-slate-800">
              새 아파트 단지 등록 (독립된 직원 명단·작업일지·공지사항 공간 생성)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                maxLength={40}
                value={newAptName}
                onChange={(e) => setNewAptName(e.target.value)}
                placeholder="아파트 단지명 (예: 은빛마을 3단지)"
                className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              />
              <input
                type="text"
                maxLength={50}
                value={newAptOffice}
                onChange={(e) => setNewAptOffice(e.target.value)}
                placeholder="관리사무소명 (미입력 시 자동 생성)"
                className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              />
              <input
                type="text"
                required
                value={newAptCompanyId}
                onChange={(e) => setNewAptCompanyId(e.target.value)}
                placeholder="공통 아이디 (영문·숫자 3자 이상)"
                className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newAptCompanyPw}
                  onChange={(e) => setNewAptCompanyPw(e.target.value)}
                  placeholder="공통 비밀번호"
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                />
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newAptAdminPw}
                  onChange={(e) => setNewAptAdminPw(e.target.value)}
                  placeholder="관리자 비밀번호"
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                />
              </div>
            </div>

            {newAptError && (
              <p className="text-xs font-medium text-red-600">{newAptError}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={newAptCreating}
                className="min-h-[44px] px-4 py-2 bg-teal-800 hover:bg-teal-900 disabled:opacity-60 text-white text-xs font-semibold rounded-xl"
              >
                {newAptCreating ? '등록 중...' : '신규 아파트 등록 완료'}
              </button>
            </div>
          </form>
        )}

        {newAptMessage && (
          <p className="text-xs font-medium text-teal-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{newAptMessage}</span>
          </p>
        )}

        {/* Registered Apartments List */}
        {apartments.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-2 tabular-nums">
              등록된 전체 단지 목록 ({apartments.length}곳)
            </p>
            <div className="divide-y divide-slate-100">
              {apartments.map((apt) => (
                <div
                  key={apt.id}
                  className="py-2 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{apt.name}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-slate-500">{apt.officeName}</span>
                  </div>
                  <span className="font-mono-tabular text-slate-500">
                    ID: {apt.companyId}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Full Log Management (Mobile Touch Cards + Desktop Table) */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">
            전체 작업일지 통합 관리
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            관리자 권한으로 모든 직원의 작업일지를 수정하거나 삭제할 수 있습니다.
          </p>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            표시할 작업일지가 없습니다.
          </div>
        ) : (
          <>
            {/* Mobile Stacked Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <WorkStatusLabel status={log.status} />
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular font-semibold text-slate-700">
                        {log.workDate}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-900">
                      {log.workerName}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 break-words">
                    {log.location}
                  </p>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {log.content}
                  </p>
                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEditLog(log)}
                      className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl inline-flex items-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>수정</span>
                    </button>

                    {confirmDeleteLogId === log.id ? (
                      <>
                        <button
                          type="button"
                          disabled={deletingLogId === log.id}
                          onClick={() => handleDeleteLog(log.id)}
                          className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl"
                        >
                          삭제 확인
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteLogId(null)}
                          className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteLogId(log.id)}
                        className="min-h-[44px] px-4 py-2 text-xs font-semibold text-red-600 bg-red-50/70 hover:bg-red-50 rounded-xl inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>삭제</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4 whitespace-nowrap">진행 상태</th>
                    <th className="py-3 px-4 whitespace-nowrap">작업 날짜</th>
                    <th className="py-3 px-4 whitespace-nowrap">작성자</th>
                    <th className="py-3 px-4 whitespace-nowrap">작업 장소</th>
                    <th className="py-3 px-4">처리 내용</th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap align-top text-xs">
                        <WorkStatusLabel status={log.status} />
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap align-top">
                        {log.workDate}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap align-top">
                        {log.workerName}
                      </td>
                      <td className="py-3 px-4 text-slate-800 whitespace-nowrap align-top">
                        {log.location}
                      </td>
                      <td className="py-3 px-4 text-slate-600 min-w-[220px] max-w-md align-top">
                        <p className="line-clamp-2">{log.content}</p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right align-top">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditLog(log)}
                            className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>수정</span>
                          </button>

                          {confirmDeleteLogId === log.id ? (
                            <>
                              <button
                                type="button"
                                disabled={deletingLogId === log.id}
                                onClick={() => handleDeleteLog(log.id)}
                                className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                              >
                                확인
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteLogId(null)}
                                className="min-h-[38px] px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-lg"
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLogId(log.id)}
                              className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>삭제</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Security Password Settings */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1.5">
          <KeyRound className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
          <h3 className="text-base font-bold text-slate-900">보안 비밀번호 설정</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          직원들이 사용하는 회사 공통 비밀번호와 관리자 인증 비밀번호를 변경할 수 있습니다. (4자 이상)
        </p>

        <form
          onSubmit={handleSavePasswords}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
        >
          <div>
            <label
              htmlFor="next-company-pw"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              새 회사 공통 비밀번호
            </label>
            <input
              id="next-company-pw"
              type="password"
              value={nextCompanyPw}
              onChange={(e) => setNextCompanyPw(e.target.value)}
              placeholder="변경 시에만 입력"
              className="w-full min-h-[48px] sm:min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <div>
            <label
              htmlFor="next-admin-pw"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              새 관리자 비밀번호
            </label>
            <input
              id="next-admin-pw"
              type="password"
              value={nextAdminPw}
              onChange={(e) => setNextAdminPw(e.target.value)}
              placeholder="변경 시에만 입력"
              className="w-full min-h-[48px] sm:min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <button
            type="submit"
            disabled={pwSaving}
            className="min-h-[48px] sm:min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
          >
            {pwSaving ? '저장 중...' : '비밀번호 변경 저장'}
          </button>
        </form>

        {pwError && (
          <p className="mt-3 text-xs font-medium text-red-600">{pwError}</p>
        )}
        {pwMessage && (
          <p className="mt-3 text-xs font-medium text-teal-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{pwMessage}</span>
          </p>
        )}
      </section>
    </div>
  );
}

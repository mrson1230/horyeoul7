import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Building2, Eye, EyeOff, Lock, PlusCircle } from 'lucide-react';
import { apiFetch, setStoredToken } from '../utils/api';
import type { Apartment, SessionInfo } from '../types';

const HERO_APARTMENT_IMAGE =
  '/src/assets/images/apartment_complex_hero_1794999359810.jpg';
const APARTMENT_LOGO_IMAGE =
  '/src/assets/images/horyeoul_apartment_logo_1795090158112.jpg';

interface LoginViewProps {
  defaultCompanyId: string;
  onLoginSuccess: (session: SessionInfo) => void;
}

export function LoginView({ defaultCompanyId, onLoginSuccess }: LoginViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string>('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [logoImgFailed, setLogoImgFailed] = useState(false);

  // Login form state
  const [companyId, setCompanyId] = useState(defaultCompanyId || 'horyeoul7');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register apartment form state
  const [regName, setRegName] = useState('');
  const [regOfficeName, setRegOfficeName] = useState('');
  const [regCompanyId, setRegCompanyId] = useState('');
  const [regCompanyPw, setRegCompanyPw] = useState('');
  const [regAdminPw, setRegAdminPw] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<{ apartments: Apartment[] }>('/api/apartments')
      .then((res) => {
        if (!active) return;
        setApartments(res.apartments);
        if (res.apartments.length > 0) {
          setSelectedApartmentId(res.apartments[0].id);
          setCompanyId(res.apartments[0].companyId);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : '서버 연결 상태를 확인할 수 없습니다.'
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSelectApartment = (aptId: string) => {
    setSelectedApartmentId(aptId);
    const found = apartments.find((a) => a.id === aptId);
    if (found) {
      setCompanyId(found.companyId);
      setError(null);
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<SessionInfo & { token: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            apartmentId: selectedApartmentId || undefined,
            companyId,
            password,
          }),
        }
      );
      setStoredToken(res.token);
      onLoginSuccess({
        authenticated: res.authenticated,
        isAdmin: res.isAdmin,
        companyId: res.companyId,
        apartmentId: res.apartmentId,
        apartmentName: res.apartmentName,
        officeName: res.officeName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{
        apartment: Apartment;
        token: string;
        session: SessionInfo;
      }>('/api/apartments', {
        method: 'POST',
        body: JSON.stringify({
          name: regName.trim(),
          officeName: regOfficeName.trim() || undefined,
          companyId: regCompanyId.trim(),
          companyPassword: regCompanyPw,
          adminPassword: regAdminPw,
          autoLogin: true,
        }),
      });
      setStoredToken(res.token);
      onLoginSuccess(res.session);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '아파트 단지 등록에 실패했습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  const fillInitialCredentials = () => {
    const first = apartments[0];
    if (first) {
      setSelectedApartmentId(first.id);
      setCompanyId(first.companyId);
    } else {
      setCompanyId(defaultCompanyId || 'horyeoul7');
    }
    setPassword('7777');
    setError(null);
  };

  const activeApt = apartments.find((a) => a.id === selectedApartmentId);

  return (
    <div className="min-h-screen relative flex flex-col justify-center px-4 py-10 sm:px-6 bg-slate-900 overflow-hidden">
      {/* Full-Bleed Apartment Backdrop Image */}
      {!heroImgFailed && (
        <img
          src={HERO_APARTMENT_IMAGE}
          alt="아파트 단지 전경"
          referrerPolicy="no-referrer"
          onError={() => setHeroImgFailed(true)}
          className="fixed inset-0 w-full h-full object-cover pointer-events-none select-none"
        />
      )}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-gradient-to-br from-slate-950/85 via-slate-900/75 to-teal-950/85 pointer-events-none"
      />

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="mb-6 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3.5 mb-2.5">
            {!logoImgFailed ? (
              <img
                src={APARTMENT_LOGO_IMAGE}
                alt={`${activeApt?.name || '호려울마을 7단지'} 로고`}
                referrerPolicy="no-referrer"
                onError={() => setLogoImgFailed(true)}
                className="w-14 h-14 rounded-2xl object-cover shadow-lg ring-2 ring-teal-300/40 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-teal-900/90 border border-teal-400/40 flex items-center justify-center shadow-lg shrink-0">
                <Building2 className="w-7 h-7 text-teal-200" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-teal-300 mb-1">
                <span className="text-xs sm:text-sm font-semibold tracking-tight">
                  {activeApt?.officeName || '관리사무소 공동 관리 시스템'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white text-balance">
                {activeApt?.name || '아파트'} 공동 작업일지
              </h1>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-200 leading-relaxed">
            단지 선택 후 회사 공통 아이디와 비밀번호로 로그인하거나, 새로운 아파트 단지를 등록해 바로 시작하세요.
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-md border border-white/30 rounded-2xl p-5 sm:p-7 shadow-2xl">
          {/* Login / Register Mode Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`min-h-[42px] px-3 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              공동 로그인
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`min-h-[42px] px-3 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              새 아파트 등록
            </button>
          </div>

          {mode === 'login' ? (
            <>
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {apartments.length > 0 && (
                  <div>
                    <label
                      htmlFor="apartment-select"
                      className="block text-sm font-semibold text-slate-800 mb-1.5"
                    >
                      아파트 단지 선택
                    </label>
                    <select
                      id="apartment-select"
                      value={selectedApartmentId}
                      onChange={(e) => handleSelectApartment(e.target.value)}
                      className="w-full min-h-[48px] px-3.5 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                    >
                      {apartments.map((apt) => (
                        <option key={apt.id} value={apt.id}>
                          {apt.name} ({apt.officeName})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="company-id"
                    className="block text-sm font-semibold text-slate-800 mb-1.5"
                  >
                    회사 공통 아이디
                  </label>
                  <input
                    id="company-id"
                    type="text"
                    autoComplete="username"
                    required
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    placeholder="아이디를 입력하세요"
                    className="w-full min-h-[48px] px-3.5 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="company-password"
                    className="block text-sm font-semibold text-slate-800 mb-1.5"
                  >
                    공통 비밀번호
                  </label>
                  <div className="relative">
                    <input
                      id="company-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호를 입력하세요"
                      className="w-full min-h-[48px] pl-3.5 pr-12 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] px-4 py-3 bg-teal-800 hover:bg-teal-900 active:scale-[0.99] disabled:opacity-60 text-white text-base font-semibold rounded-xl transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
                >
                  <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{loading ? '로그인 중...' : '공동 작업일지 로그인'}</span>
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-slate-200/80 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500 leading-relaxed">
                  <p className="font-medium text-slate-700">호려울마을 7단지 초기 계정</p>
                  <p className="mt-0.5 font-mono-tabular">
                    아이디: horyeoul7 · 비밀번호: 7777
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fillInitialCredentials}
                  className="min-h-[44px] px-3 py-2 text-xs font-semibold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                >
                  초기값 입력
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="reg-apt-name"
                  className="block text-sm font-semibold text-slate-800 mb-1"
                >
                  아파트 단지명
                </label>
                <input
                  id="reg-apt-name"
                  type="text"
                  required
                  maxLength={40}
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="예: 한빛마을 3단지"
                  className="w-full min-h-[46px] px-3.5 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-office-name"
                  className="block text-sm font-semibold text-slate-800 mb-1"
                >
                  관리사무소명 <span className="text-xs font-normal text-slate-500">(선택)</span>
                </label>
                <input
                  id="reg-office-name"
                  type="text"
                  maxLength={50}
                  value={regOfficeName}
                  onChange={(e) => setRegOfficeName(e.target.value)}
                  placeholder="미입력 시 '단지명 관리사무소' 자동 설정"
                  className="w-full min-h-[46px] px-3.5 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-company-id"
                  className="block text-sm font-semibold text-slate-800 mb-1"
                >
                  사용할 회사 공통 아이디
                </label>
                <input
                  id="reg-company-id"
                  type="text"
                  required
                  value={regCompanyId}
                  onChange={(e) => setRegCompanyId(e.target.value)}
                  placeholder="영문 소문자·숫자 3자 이상 (예: hanbit3)"
                  className="w-full min-h-[46px] px-3.5 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-company-pw"
                    className="block text-sm font-semibold text-slate-800 mb-1"
                  >
                    공통 비밀번호
                  </label>
                  <input
                    id="reg-company-pw"
                    type="password"
                    required
                    minLength={4}
                    value={regCompanyPw}
                    onChange={(e) => setRegCompanyPw(e.target.value)}
                    placeholder="4자 이상"
                    className="w-full min-h-[46px] px-3.5 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-admin-pw"
                    className="block text-sm font-semibold text-slate-800 mb-1"
                  >
                    관리자 비밀번호
                  </label>
                  <input
                    id="reg-admin-pw"
                    type="password"
                    required
                    minLength={4}
                    value={regAdminPw}
                    onChange={(e) => setRegAdminPw(e.target.value)}
                    placeholder="4자 이상"
                    className="w-full min-h-[46px] px-3.5 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                  />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] px-4 py-3 bg-teal-800 hover:bg-teal-900 disabled:opacity-60 text-white text-base font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{loading ? '등록 중...' : '아파트 등록하고 바로 시작하기'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

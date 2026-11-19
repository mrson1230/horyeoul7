import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  CheckCircle2,
  Globe,
  ImagePlus,
  KeyRound,
  Lock,
  Megaphone,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  apiFetch,
  compressImageToBase64,
  setStoredToken,
} from '../utils/api';
import { BottomAdSlot } from './BottomAdSlot';
import type {
  AdSlotMode,
  AdSlotStateResponse,
  ExternalAdConfig,
} from '../types';

interface AdSlotManagerSectionProps {
  adSlot: ExternalAdConfig;
  globalAdSlot: ExternalAdConfig;
  hasApartmentOverride: boolean;
  isMaster: boolean;
  onMasterStateChanged: (isMaster: boolean) => void;
  onAdStateChanged: (next: AdSlotStateResponse) => void;
}

const MODE_OPTIONS: Array<{
  mode: AdSlotMode;
  label: string;
  helper: string;
}> = [
  {
    mode: 'inquiry',
    label: '광고 문의 안내',
    helper: '아직 외부 광고가 없을 때 하단에 광고 게재 안내 문구를 표시합니다.',
  },
  {
    mode: 'custom',
    label: '직접 배너 (이미지·링크)',
    helper:
      '인근 상가·협력업체 배너 이미지와 클릭 시 이동할 웹사이트 링크를 직접 등록합니다.',
  },
  {
    mode: 'adsense',
    label: 'Google AdSense',
    helper:
      'Google AdSense 클라이언트 ID(ca-pub-...)와 광고 슬롯 ID를 입력해 자동 광고를 표시합니다.',
  },
  {
    mode: 'adfit',
    label: '카카오 애드핏',
    helper:
      '카카오 애드핏에서 발급받은 광고 단위 ID(DAN-...)를 연결해 배너를 표시합니다.',
  },
  {
    mode: 'hidden',
    label: '숨김',
    helper: '하단 외부 광고 영역을 화면에 표시하지 않습니다.',
  },
];

export function AdSlotManagerSection({
  adSlot,
  globalAdSlot,
  hasApartmentOverride,
  isMaster,
  onMasterStateChanged,
  onAdStateChanged,
}: AdSlotManagerSectionProps) {
  const [scopeTab, setScopeTab] = useState<'global' | 'apartment'>('global');

  const activeSource = scopeTab === 'global' ? globalAdSlot : adSlot;

  const [mode, setMode] = useState<AdSlotMode>(activeSource.mode);
  const [sponsorName, setSponsorName] = useState(activeSource.sponsorName);
  const [headline, setHeadline] = useState(activeSource.headline);
  const [description, setDescription] = useState(activeSource.description);
  const [imageUrl, setImageUrl] = useState(activeSource.imageUrl);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState(activeSource.linkUrl);
  const [ctaLabel, setCtaLabel] = useState(
    activeSource.ctaLabel || '자세히 보기'
  );
  const [contactInfo, setContactInfo] = useState(activeSource.contactInfo);
  const [adsenseClientId, setAdsenseClientId] = useState(
    activeSource.adsenseClientId
  );
  const [adsenseSlotId, setAdsenseSlotId] = useState(
    activeSource.adsenseSlotId
  );
  const [adfitUnitId, setAdfitUnitId] = useState(activeSource.adfitUnitId);
  const [applyToAll, setApplyToAll] = useState(true);

  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [masterUnlocking, setMasterUnlocking] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);

  const [imgUploading, setImgUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const src = scopeTab === 'global' ? globalAdSlot : adSlot;
    setMode(src.mode);
    setSponsorName(src.sponsorName);
    setHeadline(src.headline);
    setDescription(src.description);
    setImageUrl(src.imageUrl);
    setImageBase64(null);
    setLinkUrl(src.linkUrl);
    setCtaLabel(src.ctaLabel || '자세히 보기');
    setContactInfo(src.contactInfo);
    setAdsenseClientId(src.adsenseClientId);
    setAdsenseSlotId(src.adsenseSlotId);
    setAdfitUnitId(src.adfitUnitId);
  }, [scopeTab, adSlot, globalAdSlot]);

  const handleUnlockMaster = async (e: FormEvent) => {
    e.preventDefault();
    setMasterError(null);
    setMasterUnlocking(true);
    try {
      const res = await apiFetch<{ isMaster: boolean; token?: string }>(
        '/api/auth/master/unlock',
        {
          method: 'POST',
          body: JSON.stringify({ masterPassword: masterPasswordInput }),
        }
      );
      if (res.token) {
        setStoredToken(res.token);
      }
      setMasterPasswordInput('');
      onMasterStateChanged(true);
    } catch (err) {
      setMasterError(
        err instanceof Error
          ? err.message
          : '마스터 비밀번호 인증에 실패했습니다.'
      );
    } finally {
      setMasterUnlocking(false);
    }
  };

  const handleImageFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setImgUploading(true);
    try {
      const compressed = await compressImageToBase64(file);
      setImageBase64(compressed);
      setImageUrl(compressed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '배너 이미지를 불러오는 중 오류가 발생했습니다.'
      );
    } finally {
      setImgUploading(false);
    }
  };

  const handleApplySampleSponsor = () => {
    setMode('custom');
    setSponsorName('한빛 종합설비 · 인테리어');
    setHeadline('아파트 배관·누수 탐지 및 세대 LED 조명 교체 전문');
    setDescription(
      '단지 인근 상가 제휴 업체 · 당일 출장 점검 및 관리사무소 협력 할인 적용'
    );
    setCtaLabel('홈페이지 방문');
    setLinkUrl('https://example.com');
    setContactInfo('상담 문의: 044-000-0000');
    setError(null);
    setSuccessMsg(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const payload = {
        mode,
        sponsorName: sponsorName.trim(),
        headline: headline.trim(),
        description: description.trim(),
        imageUrl: imageBase64 ? '' : imageUrl.trim(),
        imageBase64,
        linkUrl: linkUrl.trim(),
        ctaLabel: ctaLabel.trim() || '자세히 보기',
        contactInfo: contactInfo.trim(),
        adsenseClientId: adsenseClientId.trim(),
        adsenseSlotId: adsenseSlotId.trim(),
        adfitUnitId: adfitUnitId.trim(),
      };

      const res =
        scopeTab === 'global'
          ? await apiFetch<AdSlotStateResponse>('/api/ad-slot/global', {
              method: 'PUT',
              body: JSON.stringify({ ...payload, applyToAll }),
            })
          : await apiFetch<AdSlotStateResponse>('/api/ad-slot', {
              method: 'PUT',
              body: JSON.stringify(payload),
            });

      setImageBase64(null);
      onAdStateChanged(res);
      setSuccessMsg(
        scopeTab === 'global'
          ? '전체 아파트 단지에 공통 외부 광고가 일괄 반영되었습니다.'
          : '현재 단지 전용 외부 광고가 저장되었습니다.'
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '광고 설정 저장에 실패했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRevertToGlobal = async () => {
    setError(null);
    setSuccessMsg(null);
    setReverting(true);
    try {
      const res = await apiFetch<AdSlotStateResponse>('/api/ad-slot/override', {
        method: 'DELETE',
      });
      onAdStateChanged(res);
      setSuccessMsg('이 단지도 전체 단지 공통 광고를 따르도록 되돌렸습니다.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '공통 광고 복원에 실패했습니다.'
      );
    } finally {
      setReverting(false);
    }
  };

  const activeModeInfo =
    MODE_OPTIONS.find((item) => item.mode === mode) || MODE_OPTIONS[0];

  const previewConfig: ExternalAdConfig = {
    apartmentId: activeSource.apartmentId,
    mode,
    sponsorName,
    headline,
    description,
    imageUrl: imageBase64 || imageUrl,
    linkUrl,
    ctaLabel,
    contactInfo,
    adsenseClientId,
    adsenseSlotId,
    adfitUnitId,
    updatedAt: activeSource.updatedAt,
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Megaphone
              className="w-4 h-4 text-teal-800 shrink-0"
              aria-hidden="true"
            />
            <span>하단 외부 광고 영역 설정</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            모든 아파트에 같은 광고를 한 번에 넣거나 빼고 수정할 수 있으며, 특정 단지만 별도 광고로 덮어쓸 수도 있습니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleApplySampleSponsor}
          className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>제휴 배너 예시 채우기</span>
        </button>
      </div>

      {/* Scope Switcher: Global All-Apartments vs Current Apartment Only */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
        <button
          type="button"
          onClick={() => {
            setScopeTab('global');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
            scopeTab === 'global'
              ? 'bg-white text-teal-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>전체 단지 공통 광고 (한 번에 관리)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setScopeTab('apartment');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
            scopeTab === 'apartment'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>현재 단지만 개별 설정</span>
          <span className="text-[11px] font-normal text-slate-500">
            · {hasApartmentOverride ? '개별 적용 중' : '공통 따름'}
          </span>
        </button>
      </div>

      {/* Master Unlock Gate for Global Shared Ad */}
      {scopeTab === 'global' && !isMaster ? (
        <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex items-start gap-2.5">
            <KeyRound
              className="w-4 h-4 text-teal-800 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-bold text-slate-900">
                전체 단지 통합 광고 마스터 인증
              </p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                여러 아파트 단지에 공통으로 들어가는 하단 광고를 한 곳에서 넣고 빼고 수정하려면 마스터 비밀번호를 입력해 주세요. (기본 단지 관리자 비밀번호와 별도로 운영자만 관리할 수 있습니다.)
              </p>
            </div>
          </div>

          <form
            onSubmit={handleUnlockMaster}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="password"
              required
              value={masterPasswordInput}
              onChange={(e) => setMasterPasswordInput(e.target.value)}
              placeholder="마스터 비밀번호 입력"
              className="flex-1 min-h-[44px] px-3.5 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
            />
            <button
              type="submit"
              disabled={masterUnlocking}
              className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{masterUnlocking ? '확인 중...' : '통합 광고 관리 열기'}</span>
            </button>
          </form>

          {masterError && (
            <p className="text-xs font-medium text-red-600">{masterError}</p>
          )}

          <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 font-mono-tabular">
              초기 마스터 비밀번호: master7777
            </span>
            <button
              type="button"
              onClick={() => setMasterPasswordInput('master7777')}
              className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg whitespace-nowrap"
            >
              초기값 입력
            </button>
          </div>
        </div>
      ) : (
        <>
          {scopeTab === 'apartment' && (
            <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-700">
                {hasApartmentOverride
                  ? '현재 이 단지는 공통 광고 대신 개별 광고를 표시하고 있습니다.'
                  : '현재 이 단지는 전체 단지 공통 광고를 자동으로 따라가고 있습니다.'}
              </span>
              {hasApartmentOverride && (
                <button
                  type="button"
                  disabled={reverting}
                  onClick={handleRevertToGlobal}
                  className="min-h-[36px] px-3 py-1 text-xs font-semibold text-teal-800 bg-white hover:bg-teal-50 border border-slate-200 rounded-lg whitespace-nowrap"
                >
                  {reverting ? '복원 중...' : '전체 공통 광고 따르기로 되돌리기'}
                </button>
              )}
            </div>
          )}

          {/* Mode Selector */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              광고 운영 방식 선택
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {MODE_OPTIONS.map((item) => {
                const active = mode === item.mode;
                return (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => {
                      setMode(item.mode);
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-teal-800 border-teal-800 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">{activeModeInfo.helper}</p>
          </div>

          {/* Live Bottom Slot Preview */}
          <div>
            <span className="block text-xs font-semibold text-slate-600 mb-2">
              하단 광고 영역 실시간 미리보기
            </span>
            <BottomAdSlot adSlot={previewConfig} previewMode />
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {(mode === 'inquiry' || mode === 'custom') && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="ad-sponsor-name"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      광고주 / 영역 표기명
                    </label>
                    <input
                      id="ad-sponsor-name"
                      type="text"
                      maxLength={40}
                      value={sponsorName}
                      onChange={(e) => setSponsorName(e.target.value)}
                      placeholder="예: 지역 상가 · 파트너 광고"
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ad-headline"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      광고 제목 (문구)
                    </label>
                    <input
                      id="ad-headline"
                      type="text"
                      maxLength={80}
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder="예: 단지 인근 제휴 업체 안내"
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="ad-description"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    상세 안내 문구
                  </label>
                  <input
                    id="ad-description"
                    type="text"
                    maxLength={160}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="예: 배너 클릭 시 업체 안내 페이지로 이동합니다."
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="ad-link-url"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      클릭 시 이동 링크 URL (선택)
                    </label>
                    <input
                      id="ad-link-url"
                      type="url"
                      maxLength={500}
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ad-cta-label"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      버튼 문구
                    </label>
                    <input
                      id="ad-cta-label"
                      type="text"
                      maxLength={24}
                      value={ctaLabel}
                      onChange={(e) => setCtaLabel(e.target.value)}
                      placeholder="자세히 보기"
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="ad-contact-info"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    문의 연락처 / 하단 참고 문구 (선택)
                  </label>
                  <input
                    id="ad-contact-info"
                    type="text"
                    maxLength={80}
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="예: 광고 게재 문의 010-0000-0000"
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                  />
                </div>

                {mode === 'custom' && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        광고 배너 이미지 (업로드 또는 외부 이미지 URL)
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleImageFile}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={imgUploading}
                          onClick={() => fileInputRef.current?.click()}
                          className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {imgUploading ? '처리 중...' : '배너 이미지 업로드'}
                          </span>
                        </button>

                        {(imageUrl || imageBase64) && (
                          <button
                            type="button"
                            onClick={() => {
                              setImageBase64(null);
                              setImageUrl('');
                            }}
                            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 border border-slate-200 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>이미지 제거</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="url"
                      value={imageBase64 ? '' : imageUrl}
                      onChange={(e) => {
                        setImageBase64(null);
                        setImageUrl(e.target.value);
                      }}
                      placeholder={
                        imageBase64
                          ? '직접 업로드한 배너 이미지가 적용되었습니다.'
                          : '또는 이미지 URL 입력 (https://...)'
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>
                )}
              </>
            )}

            {mode === 'adsense' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label
                    htmlFor="adsense-client"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Google AdSense 게시자 ID (data-ad-client)
                  </label>
                  <input
                    id="adsense-client"
                    type="text"
                    maxLength={40}
                    value={adsenseClientId}
                    onChange={(e) => setAdsenseClientId(e.target.value)}
                    placeholder="ca-pub-1234567890123456"
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 font-mono-tabular focus:outline-none focus:border-teal-700"
                  />
                </div>

                <div>
                  <label
                    htmlFor="adsense-slot"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    광고 단위 슬롯 ID (data-ad-slot)
                  </label>
                  <input
                    id="adsense-slot"
                    type="text"
                    maxLength={40}
                    value={adsenseSlotId}
                    onChange={(e) => setAdsenseSlotId(e.target.value)}
                    placeholder="1234567890"
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 font-mono-tabular focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>
            )}

            {mode === 'adfit' && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <label
                  htmlFor="adfit-unit"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  카카오 애드핏 광고 단위 ID (data-ad-unit)
                </label>
                <input
                  id="adfit-unit"
                  type="text"
                  maxLength={40}
                  value={adfitUnitId}
                  onChange={(e) => setAdfitUnitId(e.target.value)}
                  placeholder="DAN-xxxxxxxxxxxxxxxx"
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 font-mono-tabular focus:outline-none focus:border-teal-700"
                />
              </div>
            )}

            {scopeTab === 'global' && (
              <label className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-teal-800 focus:ring-teal-700"
                />
                <span className="text-xs sm:text-sm font-medium text-slate-700">
                  개별 설정이 있던 단지도 포함해 등록된 모든 아파트에 즉시 일괄 적용
                </span>
              </label>
            )}

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
              >
                {error}
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 font-medium flex items-center gap-2"
              >
                <CheckCircle2
                  className="w-4 h-4 text-teal-700 shrink-0"
                  aria-hidden="true"
                />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto min-h-[48px] px-6 py-2.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
            >
              {saving
                ? '저장 중...'
                : scopeTab === 'global'
                  ? '모든 아파트에 공통 광고 저장 및 적용'
                  : '이 단지에만 개별 광고 저장'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

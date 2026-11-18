import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import {
  BANNER_THEMES,
  downloadBannerAsPng,
  EventBannerCard,
  getBannerThemeMeta,
} from './EventBannerCard';
import type { BannerCategory, EventBanner } from '../types';

interface BannerMakerSectionProps {
  officeName: string;
  banners: EventBanner[];
  onBannersChanged: (next: EventBanner[]) => void;
}

interface BannerPreset {
  label: string;
  category: BannerCategory;
  title: string;
  subtitle: string;
  eventDate: string;
  eventLocation: string;
  contactInfo: string;
}

const BANNER_PRESETS: BannerPreset[] = [
  {
    label: '결혼 예문',
    category: 'wedding',
    title: '[경사] 직원 자녀 혼례 안내',
    subtitle: '두 사람의 앞날을 함께 축복해 주시면 감사하겠습니다.',
    eventDate: '이번 주 토요일 오전 11:30',
    eventLocation: '더컨벤션 웨딩홀 3층 그랜드홀',
    contactInfo: '관리사무소 서무실 문의',
  },
  {
    label: '부고 예문',
    category: 'funeral',
    title: '[부고] 삼가 고인의 명복을 빕니다',
    subtitle: '깊은 애도와 위로의 마음을 전하며 장례 일정을 안내드립니다.',
    eventDate: '발인: 내일 오전 08:00',
    eventLocation: '시립병원 장례식장 특2호실',
    contactInfo: '조문 및 조의 안내: 관리사무소',
  },
  {
    label: '단지 행사 예문',
    category: 'celebration',
    title: '관리사무소 직원 간담회 및 회식 안내',
    subtitle: '한 달간 수고하신 직원분들과 함께하는 화합의 자리입니다.',
    eventDate: '금주 금요일 오후 18:30',
    eventLocation: '단지 인근 한우마을 별관',
    contactInfo: '참석 여부 시설과장에게 전달',
  },
  {
    label: '자체 일정 예문',
    category: 'notice',
    title: '단지 자체 소방 훈련 및 점검 일정 안내',
    subtitle: '전 직원 및 경비·미화 반장님께서는 정시 집결 부탁드립니다.',
    eventDate: '수요일 오후 14:00 ~ 15:00',
    eventLocation: '관리동 앞 중앙광장',
    contactInfo: '관리소장 / 시설과장',
  },
];

export function BannerMakerSection({
  officeName,
  banners,
  onBannersChanged,
}: BannerMakerSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState<BannerCategory>('wedding');
  const [title, setTitle] = useState(BANNER_PRESETS[0].title);
  const [subtitle, setSubtitle] = useState(BANNER_PRESETS[0].subtitle);
  const [eventDate, setEventDate] = useState(BANNER_PRESETS[0].eventDate);
  const [eventLocation, setEventLocation] = useState(
    BANNER_PRESETS[0].eventLocation
  );
  const [contactInfo, setContactInfo] = useState(BANNER_PRESETS[0].contactInfo);
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const applyPreset = (preset: BannerPreset) => {
    setEditingId(null);
    setCategory(preset.category);
    setTitle(preset.title);
    setSubtitle(preset.subtitle);
    setEventDate(preset.eventDate);
    setEventLocation(preset.eventLocation);
    setContactInfo(preset.contactInfo);
    setIsActive(true);
    setError(null);
    setSuccessMsg(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setCategory('wedding');
    setTitle('');
    setSubtitle('');
    setEventDate('');
    setEventLocation('');
    setContactInfo('');
    setIsActive(true);
    setError(null);
    setSuccessMsg(null);
  };

  const loadForEdit = (banner: EventBanner) => {
    setEditingId(banner.id);
    setCategory(banner.category);
    setTitle(banner.title);
    setSubtitle(banner.subtitle);
    setEventDate(banner.eventDate);
    setEventLocation(banner.eventLocation);
    setContactInfo(banner.contactInfo);
    setIsActive(banner.isActive);
    setError(null);
    setSuccessMsg(null);
  };

  const handleSaveBanner = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!title.trim()) {
      setError('배너 제목을 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        category,
        title: title.trim(),
        subtitle: subtitle.trim(),
        eventDate: eventDate.trim(),
        eventLocation: eventLocation.trim(),
        contactInfo: contactInfo.trim(),
        isActive,
      };

      if (editingId) {
        const res = await apiFetch<{ banner: EventBanner }>(
          `/api/banners/${editingId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }
        );
        onBannersChanged(
          banners.map((b) => (b.id === editingId ? res.banner : b))
        );
        setEditingId(null);
        setSuccessMsg('행사 배너가 수정되어 반영되었습니다.');
      } else {
        const res = await apiFetch<{ banner: EventBanner }>('/api/banners', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onBannersChanged([res.banner, ...banners]);
        setSuccessMsg(
          isActive
            ? '행사 배너가 등록되어 직원 화면에 게시되었습니다.'
            : '행사 배너가 비공개 상태로 저장되었습니다.'
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '배너 저장에 실패했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (banner: EventBanner) => {
    setTogglingId(banner.id);
    setError(null);
    try {
      const res = await apiFetch<{ banner: EventBanner }>(
        `/api/banners/${banner.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !banner.isActive }),
        }
      );
      onBannersChanged(
        banners.map((b) => (b.id === banner.id ? res.banner : b))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '배너 상태 변경에 실패했습니다.'
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/banners/${id}`, { method: 'DELETE' });
      onBannersChanged(banners.filter((b) => b.id !== id));
      setConfirmDeleteId(null);
      if (editingId === id) {
        resetForm();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '배너 삭제에 실패했습니다.'
      );
    }
  };

  const previewBanner = {
    category,
    title,
    subtitle,
    eventDate,
    eventLocation,
    contactInfo,
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
            <span>자체 행사 · 경조사 배너 제작툴</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            결혼, 부고(장례), 단지 행사 등의 알림 배너를 제작해 직원 화면에 게시하거나 이미지(PNG)로 저장할 수 있습니다.
          </p>
        </div>

        <button
          type="button"
          onClick={resetForm}
          className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>새로 작성</span>
        </button>
      </div>

      {/* Quick Preset Fillers */}
      <div>
        <span className="block text-xs font-semibold text-slate-600 mb-2">
          상황별 빠른 예문 불러오기
        </span>
        <div className="flex flex-wrap gap-2">
          {BANNER_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <span className="block text-xs font-semibold text-slate-600 mb-2">
          실시간 배너 미리보기
        </span>
        <EventBannerCard banner={previewBanner} officeName={officeName} />
      </div>

      {/* Editor Form */}
      <form onSubmit={handleSaveBanner} className="space-y-4">
        <div>
          <span className="block text-xs font-semibold text-slate-700 mb-1.5">
            배너 테마 선택
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BANNER_THEMES.map((item) => {
              const active = category === item.category;
              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => setCategory(item.category)}
                  className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap ${
                    active ? item.activeButtonClass : item.buttonClass
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="banner-title"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              배너 제목
            </label>
            <input
              id="banner-title"
              type="text"
              required
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: [결혼] 김철수 과장 장남 혼례 안내"
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <div>
            <label
              htmlFor="banner-subtitle"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              부제 / 인사말
            </label>
            <input
              id="banner-subtitle"
              type="text"
              maxLength={120}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="예: 축하와 격려의 마음을 함께 전해 주세요."
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="banner-date"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              일시
            </label>
            <input
              id="banner-date"
              type="text"
              maxLength={60}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              placeholder="예: 11월 28일 (토) 11:30"
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <div>
            <label
              htmlFor="banner-location"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              장소
            </label>
            <input
              id="banner-location"
              type="text"
              maxLength={80}
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              placeholder="예: 세종웨딩홀 / 시립장례식장"
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>

          <div>
            <label
              htmlFor="banner-contact"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              안내 · 연락처
            </label>
            <input
              id="banner-contact"
              type="text"
              maxLength={80}
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="예: 관리사무소 내선 101"
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-teal-800 focus:ring-teal-700"
          />
          <span className="text-xs sm:text-sm font-medium text-slate-700">
            직원 작업일지 화면 상단에 배너 바로 게시하기
          </span>
        </label>

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
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
          >
            {saving
              ? '저장 중...'
              : editingId
                ? '배너 수정 내용 저장'
                : '배너 저장 및 게시하기'}
          </button>

          <button
            type="button"
            onClick={() => downloadBannerAsPng(previewBanner, officeName)}
            className="min-h-[48px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>이미지(PNG) 다운로드</span>
          </button>
        </div>
      </form>

      {/* Saved Banners Management List */}
      <div className="pt-4 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 mb-2.5 tabular-nums">
          등록된 행사 배너 목록 ({banners.length}건)
        </p>

        {banners.length === 0 ? (
          <p className="py-5 text-center text-xs text-slate-400">
            아직 등록된 행사 배너가 없습니다. 위 제작툴로 배너를 만들어 게시해 보세요.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {banners.map((banner) => {
              const meta = getBannerThemeMeta(banner.category);
              return (
                <div
                  key={banner.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span
                        className={`font-semibold ${
                          banner.isActive ? 'text-teal-800' : 'text-slate-400'
                        }`}
                      >
                        {banner.isActive ? '게시 중' : '숨김'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{meta.label}</span>
                      {banner.eventDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{banner.eventDate}</span>
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-slate-900 truncate">
                      {banner.title}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={togglingId === banner.id}
                      onClick={() => handleToggleActive(banner)}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      {banner.isActive ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>숨김</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>게시</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => loadForEdit(banner)}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>수정</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadBannerAsPng(banner, officeName)}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>PNG</span>
                    </button>

                    {confirmDeleteId === banner.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDelete(banner.id)}
                          className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap"
                        >
                          삭제 확인
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(banner.id)}
                        className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50/70 hover:bg-red-50 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>삭제</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

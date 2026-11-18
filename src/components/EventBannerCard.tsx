import {
  Calendar,
  MapPin,
  Megaphone,
  PartyPopper,
  Phone,
} from 'lucide-react';
import type { BannerCategory, EventBanner } from '../types';

export interface BannerThemeMeta {
  category: BannerCategory;
  label: string;
  kicker: string;
  buttonClass: string;
  activeButtonClass: string;
}

export const BANNER_THEMES: BannerThemeMeta[] = [
  {
    category: 'wedding',
    label: '결혼 · 경사',
    kicker: '경사 안내 · 결혼 축하',
    buttonClass: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100',
    activeButtonClass: 'bg-rose-700 text-white border-rose-700',
  },
  {
    category: 'funeral',
    label: '부고 · 장례',
    kicker: '부고 안내 · 삼가 조의를 표합니다',
    buttonClass: 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200',
    activeButtonClass: 'bg-slate-900 text-white border-slate-900',
  },
  {
    category: 'celebration',
    label: '단지 행사 · 모임',
    kicker: '자체 행사 · 친목 모임 안내',
    buttonClass: 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100',
    activeButtonClass: 'bg-teal-800 text-white border-teal-800',
  },
  {
    category: 'notice',
    label: '주요 일정 안내',
    kicker: '관리사무소 자체 일정 안내',
    buttonClass: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
    activeButtonClass: 'bg-amber-700 text-white border-amber-700',
  },
];

export function getBannerThemeMeta(category: BannerCategory): BannerThemeMeta {
  return (
    BANNER_THEMES.find((item) => item.category === category) || BANNER_THEMES[3]
  );
}

function BannerOrnament({ category }: { category: BannerCategory }) {
  if (category === 'wedding') {
    return (
      <svg
        viewBox="0 0 80 80"
        className="w-16 h-16 sm:w-20 sm:h-20 text-rose-300/80 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="32" cy="42" r="16" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="48" cy="42" r="16" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M40 16l3.5 6.5L50 26l-6.5 3.5L40 36l-3.5-6.5L30 26l6.5-3.5L40 16z"
          fill="currentColor"
          opacity="0.7"
        />
      </svg>
    );
  }

  if (category === 'funeral') {
    return (
      <svg
        viewBox="0 0 80 80"
        className="w-16 h-16 sm:w-20 sm:h-20 text-slate-400/75 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="40" cy="40" r="6" stroke="currentColor" strokeWidth="2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <ellipse
            key={deg}
            cx="40"
            cy="22"
            rx="4.2"
            ry="10"
            stroke="currentColor"
            strokeWidth="1.8"
            transform={`rotate(${deg} 40 40)`}
          />
        ))}
      </svg>
    );
  }

  if (category === 'celebration') {
    return (
      <div
        className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <PartyPopper className="w-7 h-7 sm:w-8 sm:h-8 text-amber-200" />
      </div>
    );
  }

  return (
    <div
      className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      <Megaphone className="w-7 h-7 sm:w-8 sm:h-8 text-amber-300" />
    </div>
  );
}

export interface EventBannerCardProps {
  banner: Pick<
    EventBanner,
    | 'category'
    | 'title'
    | 'subtitle'
    | 'eventDate'
    | 'eventLocation'
    | 'contactInfo'
  >;
  officeName: string;
}

export function EventBannerCard({ banner, officeName }: EventBannerCardProps) {
  const theme = getBannerThemeMeta(banner.category);

  const containerStyle =
    banner.category === 'wedding'
      ? 'bg-gradient-to-br from-rose-50 via-amber-50/60 to-white border border-rose-200 text-slate-900'
      : banner.category === 'funeral'
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 border border-slate-700 text-white'
        : banner.category === 'celebration'
          ? 'bg-gradient-to-br from-teal-900 via-teal-800 to-emerald-900 border border-teal-700 text-white'
          : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 text-white';

  const kickerColor =
    banner.category === 'wedding'
      ? 'text-rose-700'
      : banner.category === 'funeral'
        ? 'text-slate-300'
        : banner.category === 'celebration'
          ? 'text-amber-200'
          : 'text-amber-300';

  const subtitleColor =
    banner.category === 'wedding' ? 'text-slate-700' : 'text-slate-200';

  const metaColor =
    banner.category === 'wedding' ? 'text-slate-600' : 'text-slate-200/90';

  const dividerBorder =
    banner.category === 'wedding' ? 'border-rose-200/80' : 'border-white/15';

  const hasDetails = Boolean(
    banner.eventDate.trim() ||
      banner.eventLocation.trim() ||
      banner.contactInfo.trim()
  );

  return (
    <article
      className={`rounded-2xl p-5 sm:p-6 shadow-xs transition-colors ${containerStyle}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${kickerColor}`}>
            {theme.kicker}
            <span aria-hidden="true"> · </span>
            <span>{officeName}</span>
          </p>

          <h3 className="mt-1.5 text-lg sm:text-xl font-extrabold tracking-tight text-balance break-words">
            {banner.title || '행사 배너 제목을 입력하세요'}
          </h3>

          {banner.subtitle && (
            <p
              className={`mt-1.5 text-sm leading-relaxed break-words ${subtitleColor}`}
            >
              {banner.subtitle}
            </p>
          )}
        </div>

        <BannerOrnament category={banner.category} />
      </div>

      {hasDetails && (
        <div
          className={`mt-4 pt-3.5 border-t ${dividerBorder} flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm ${metaColor}`}
        >
          {banner.eventDate.trim() && (
            <div className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4 shrink-0 opacity-80" aria-hidden="true" />
              <span className="font-medium">{banner.eventDate}</span>
            </div>
          )}
          {banner.eventLocation.trim() && (
            <div className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 shrink-0 opacity-80" aria-hidden="true" />
              <span className="font-medium">{banner.eventLocation}</span>
            </div>
          )}
          {banner.contactInfo.trim() && (
            <div className="inline-flex items-center gap-1.5">
              <Phone className="w-4 h-4 shrink-0 opacity-80" aria-hidden="true" />
              <span className="font-medium">{banner.contactInfo}</span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export function downloadBannerAsPng(
  banner: EventBannerCardProps['banner'],
  officeName: string
): void {
  const width = 1200;
  const height = 460;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const theme = getBannerThemeMeta(banner.category);
  const isWedding = banner.category === 'wedding';

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  if (isWedding) {
    grad.addColorStop(0, '#fff1f2');
    grad.addColorStop(0.55, '#fffbeb');
    grad.addColorStop(1, '#ffffff');
  } else if (banner.category === 'funeral') {
    grad.addColorStop(0, '#020617');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#1e293b');
  } else if (banner.category === 'celebration') {
    grad.addColorStop(0, '#134e4a');
    grad.addColorStop(0.5, '#115e59');
    grad.addColorStop(1, '#064e3b');
  } else {
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1, '#0f172a');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Inner frame hairline
  ctx.strokeStyle = isWedding ? '#fecdd3' : 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // Subtle decorative motif on right
  ctx.save();
  if (isWedding) {
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(width - 155, 165, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width - 110, 165, 42, 0, Math.PI * 2);
    ctx.stroke();
  } else if (banner.category === 'funeral') {
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.24)';
    ctx.lineWidth = 3;
    const cx = width - 135;
    const cy = 165;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath();
      ctx.ellipse(0, -34, 8, 20, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(width - 135, 165, 56, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const fontStack =
    '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  // Kicker
  ctx.fillStyle = isWedding
    ? '#be123c'
    : banner.category === 'funeral'
      ? '#cbd5e1'
      : '#fcd34d';
  ctx.font = `600 22px ${fontStack}`;
  ctx.fillText(`${theme.kicker}  ·  ${officeName}`, 64, 86);

  // Title
  ctx.fillStyle = isWedding ? '#0f172a' : '#ffffff';
  ctx.font = `800 44px ${fontStack}`;
  const titleLines = wrapCanvasLines(
    ctx,
    banner.title || '행사 안내 배너',
    width - 280
  ).slice(0, 2);
  let y = 154;
  for (const line of titleLines) {
    ctx.fillText(line, 64, y);
    y += 56;
  }

  // Subtitle
  if (banner.subtitle.trim()) {
    ctx.fillStyle = isWedding ? '#334155' : '#e2e8f0';
    ctx.font = `400 25px ${fontStack}`;
    const subLines = wrapCanvasLines(ctx, banner.subtitle.trim(), width - 260).slice(
      0,
      2
    );
    y += 6;
    for (const line of subLines) {
      ctx.fillText(line, 64, y);
      y += 36;
    }
  }

  // Divider
  ctx.strokeStyle = isWedding
    ? 'rgba(244, 63, 94, 0.25)'
    : 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 342);
  ctx.lineTo(width - 64, 342);
  ctx.stroke();

  // Bottom details
  const detailParts: string[] = [];
  if (banner.eventDate.trim()) detailParts.push(`일시: ${banner.eventDate.trim()}`);
  if (banner.eventLocation.trim())
    detailParts.push(`장소: ${banner.eventLocation.trim()}`);
  if (banner.contactInfo.trim())
    detailParts.push(`안내: ${banner.contactInfo.trim()}`);

  ctx.fillStyle = isWedding ? '#475569' : '#e2e8f0';
  ctx.font = `600 22px ${fontStack}`;
  const detailsLine = detailParts.join('   |   ') || officeName;
  ctx.fillText(detailsLine, 64, 392, width - 128);

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  const safeName = (banner.title || '행사배너')
    .replace(/[^\w가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 24);
  link.download = `${safeName || '행사배너'}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

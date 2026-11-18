import { useEffect, useState } from 'react';
import {
  ExternalLink,
  Image as ImageIcon,
  Megaphone,
  Settings2,
} from 'lucide-react';
import type { ExternalAdConfig } from '../types';

interface BottomAdSlotProps {
  adSlot: ExternalAdConfig;
  previewMode?: boolean;
  onOpenAdmin?: () => void;
}

interface AdWindow extends Window {
  adsbygoogle?: Array<Record<string, unknown>>;
}

export function BottomAdSlot({
  adSlot,
  previewMode = false,
  onOpenAdmin,
}: BottomAdSlotProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [adSlot.imageUrl]);

  useEffect(() => {
    if (previewMode || adSlot.mode !== 'adsense') return;
    if (!adSlot.adsenseClientId || !adSlot.adsenseSlotId) return;

    const scriptId = 'google-adsense-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adSlot.adsenseClientId)}`;
      document.head.appendChild(script);
    }

    const timer = window.setTimeout(() => {
      try {
        const w = window as AdWindow;
        w.adsbygoogle = w.adsbygoogle || [];
        w.adsbygoogle.push({});
      } catch {
        // Ignore ad-blocker or duplicate push exceptions
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [
    previewMode,
    adSlot.mode,
    adSlot.adsenseClientId,
    adSlot.adsenseSlotId,
  ]);

  useEffect(() => {
    if (previewMode || adSlot.mode !== 'adfit' || !adSlot.adfitUnitId) return;

    const scriptId = 'kakao-adfit-script';
    const existing = document.getElementById(scriptId);
    if (existing) {
      existing.remove();
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.type = 'text/javascript';
    script.src = 'https://t1.daumcdn.net/kas/static/ba.min.js';
    document.body.appendChild(script);
  }, [previewMode, adSlot.mode, adSlot.adfitUnitId]);

  if (adSlot.mode === 'hidden') {
    if (!previewMode) return null;
    return (
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-4 text-center text-xs text-slate-500">
        현재 하단 외부 광고 영역이 숨김 상태입니다. 저장 시 사용자 화면 하단에서 보이지 않습니다.
      </div>
    );
  }

  const hasValidLink = /^https?:\/\//i.test(adSlot.linkUrl);
  const topLabel =
    adSlot.mode === 'custom' && adSlot.sponsorName
      ? `AD · ${adSlot.sponsorName}`
      : adSlot.mode === 'adsense'
        ? 'AD · Google AdSense'
        : adSlot.mode === 'adfit'
          ? 'AD · 카카오 애드핏'
          : `AD · ${adSlot.sponsorName || '외부 광고 영역'}`;

  return (
    <div
      aria-label="하단 외부 광고 영역"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs"
    >
      {/* Subtle Top AD Attribution Strip */}
      <div className="px-4 py-1.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3 text-[11px] text-slate-500">
        <span className="font-semibold tracking-wide truncate">{topLabel}</span>
        {adSlot.mode === 'inquiry' && onOpenAdmin && !previewMode && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="text-[11px] font-semibold text-teal-800 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Settings2 className="w-3 h-3" aria-hidden="true" />
            <span>관리자 광고 설정</span>
          </button>
        )}
        {adSlot.mode === 'custom' && hasValidLink && (
          <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
            외부 제휴 링크
          </span>
        )}
      </div>

      {/* Mode: Custom Image / Sponsor Banner */}
      {adSlot.mode === 'custom' && (() => {
        const hasText = Boolean(adSlot.headline || adSlot.description);
        const showImage = Boolean(adSlot.imageUrl) && !imageFailed;

        const innerContent =
          showImage && !hasText ? (
            <div className="relative bg-slate-50">
              <img
                src={adSlot.imageUrl}
                alt={adSlot.sponsorName || '외부 제휴 광고 배너'}
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="w-full max-h-36 sm:max-h-40 object-cover block"
              />
            </div>
          ) : (
            <div className="p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 min-w-0 flex-1">
                {showImage ? (
                  <img
                    src={adSlot.imageUrl}
                    alt={adSlot.headline || adSlot.sponsorName || '광고 배너'}
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                    className="w-full sm:w-44 h-24 sm:h-20 object-cover rounded-xl border border-slate-200 shrink-0"
                  />
                ) : adSlot.imageUrl && imageFailed ? (
                  <div className="w-full sm:w-44 h-20 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 shrink-0">
                    <ImageIcon className="w-4 h-4" aria-hidden="true" />
                    <span className="text-[11px]">배너 이미지</span>
                  </div>
                ) : null}

                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-slate-900 leading-snug break-words">
                    {adSlot.headline || adSlot.sponsorName || '외부 제휴 광고'}
                  </p>
                  {adSlot.description && (
                    <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-2">
                      {adSlot.description}
                    </p>
                  )}
                  {adSlot.contactInfo && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {adSlot.contactInfo}
                    </p>
                  )}
                </div>
              </div>

              {hasValidLink && (
                <span className="self-start sm:self-center min-h-[40px] px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0">
                  <span>{adSlot.ctaLabel || '자세히 보기'}</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              )}
            </div>
          );

        return hasValidLink ? (
          <a
            href={adSlot.linkUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block hover:bg-slate-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          >
            {innerContent}
          </a>
        ) : (
          <div>{innerContent}</div>
        );
      })()}

      {/* Mode: Google AdSense */}
      {adSlot.mode === 'adsense' && (
        <div className="p-3 sm:p-4 bg-slate-50/40 min-h-[104px] flex items-center justify-center">
          {previewMode ? (
            <div className="text-center space-y-1">
              <p className="text-xs font-bold text-slate-800">
                Google AdSense 자동 광고 슬롯
              </p>
              <p className="text-[11px] font-mono-tabular text-slate-500">
                {adSlot.adsenseClientId || 'ca-pub-미입력'} · Slot{' '}
                {adSlot.adsenseSlotId || '미입력'}
              </p>
            </div>
          ) : (
            <div className="w-full text-center">
              <ins
                className="adsbygoogle"
                style={{ display: 'block' }}
                data-ad-client={adSlot.adsenseClientId}
                data-ad-slot={adSlot.adsenseSlotId}
                data-ad-format="auto"
                data-full-width-responsive="true"
              />
            </div>
          )}
        </div>
      )}

      {/* Mode: Kakao AdFit */}
      {adSlot.mode === 'adfit' && (
        <div className="p-3 sm:p-4 bg-slate-50/40 min-h-[104px] flex items-center justify-center">
          {previewMode ? (
            <div className="text-center space-y-1">
              <p className="text-xs font-bold text-slate-800">
                카카오 애드핏 (Kakao AdFit) 광고 슬롯
              </p>
              <p className="text-[11px] font-mono-tabular text-slate-500">
                광고 단위 ID: {adSlot.adfitUnitId || 'DAN-미입력'}
              </p>
            </div>
          ) : (
            <div className="w-full flex justify-center overflow-hidden">
              <ins
                className="kakao_ad_area"
                style={{ display: 'none' }}
                data-ad-unit={adSlot.adfitUnitId}
                data-ad-width="320"
                data-ad-height="100"
              />
            </div>
          )}
        </div>
      )}

      {/* Mode: Inquiry / Default Placeholder Slot */}
      {adSlot.mode === 'inquiry' && (
        <div className="p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-teal-800 shrink-0">
              <Megaphone className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 break-words">
                {adSlot.headline || '이 자리에 외부 광고 및 제휴 배너를 게재할 수 있습니다'}
              </p>
              {adSlot.description && (
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                  {adSlot.description}
                </p>
              )}
              {adSlot.contactInfo && (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {adSlot.contactInfo}
                </p>
              )}
            </div>
          </div>

          {hasValidLink ? (
            <a
              href={adSlot.linkUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="self-start sm:self-center min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{adSlot.ctaLabel || '자세히 보기'}</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : (
            onOpenAdmin &&
            !previewMode && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="self-start sm:self-center min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>외부 광고 등록</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

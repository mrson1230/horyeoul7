import { useCallback, useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import type { WorkLog } from '../types';

export interface SlideshowItem {
  id: string;
  url: string;
  workDate: string;
  location: string;
  workerName: string;
  workerRole: string;
  content: string;
}

interface PhotoSlideshowModalProps {
  items: SlideshowItem[];
  initialIndex: number;
  onClose: () => void;
}

export function buildSlideshowItems(logs: WorkLog[]): SlideshowItem[] {
  return logs
    .filter((log): log is WorkLog & { photoUrl: string } => Boolean(log.photoUrl))
    .map((log) => ({
      id: log.id,
      url: log.photoUrl,
      workDate: log.workDate,
      location: log.location,
      workerName: log.workerName,
      workerRole: log.workerRole,
      content: log.content,
    }));
}

export function PhotoSlideshowModal({
  items,
  initialIndex,
  onClose,
}: PhotoSlideshowModalProps) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, items.length - 1))
  );
  const [showChrome, setShowChrome] = useState(true);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});

  const touchStartRef = useRef<{ x: number; y: number; axis: 'x' | 'y' | null }>({
    x: 0,
    y: 0,
    axis: null,
  });
  const thumbStripRef = useRef<HTMLDivElement | null>(null);

  const total = items.length;
  const currentItem = items[currentIndex];

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : prev));
  }, [total]);

  // Lock background body scroll while full-screen modal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === 'ArrowRight') {
        goNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onClose]);

  // Scroll active thumbnail into center view
  useEffect(() => {
    const container = thumbStripRef.current;
    if (!container) return;
    const activeEl = container.children[currentIndex] as HTMLElement | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [currentIndex]);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, axis: null };
    setIsDragging(true);
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (!touchStartRef.current.axis) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        touchStartRef.current.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      } else {
        return;
      }
    }

    if (touchStartRef.current.axis === 'x') {
      // Apply gentle resistance at first/last slide edges
      const atStartEdge = currentIndex === 0 && dx > 0;
      const atEndEdge = currentIndex === total - 1 && dx < 0;
      setDragOffsetX(atStartEdge || atEndEdge ? dx * 0.25 : dx);
      setDragOffsetY(0);
    } else if (touchStartRef.current.axis === 'y' && dy > 0) {
      setDragOffsetY(dy);
      setDragOffsetX(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (touchStartRef.current.axis === 'x') {
      if (dragOffsetX <= -55 && currentIndex < total - 1) {
        goNext();
      } else if (dragOffsetX >= 55 && currentIndex > 0) {
        goPrev();
      }
    } else if (touchStartRef.current.axis === 'y' && dragOffsetY >= 100) {
      onClose();
    }

    setDragOffsetX(0);
    setDragOffsetY(0);
    touchStartRef.current.axis = null;
  };

  if (!currentItem) return null;

  const isFailed = Boolean(failedIds[currentItem.id]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black text-white flex flex-col select-none"
      role="dialog"
      aria-modal="true"
      aria-label="작업 완료 사진 전체 화면 슬라이드쇼"
    >
      {/* Top Overlay Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-20 px-4 pt-3 pb-6 bg-gradient-to-b from-black/85 via-black/50 to-transparent transition-opacity duration-200 ${
          showChrome ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="font-mono-tabular font-semibold text-white">
                {currentIndex + 1} / {total}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">{currentItem.workDate}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{currentItem.workerName}</span>
            </div>
            <p className="mt-0.5 text-sm sm:text-base font-bold text-white truncate">
              {currentItem.location}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="슬라이드쇼 닫기"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Interactive Slide Stage */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => setShowChrome((prev) => !prev)}
      >
        <div
          className="w-full h-full flex items-center justify-center p-2 sm:p-10"
          style={{
            transform: `translate3d(${dragOffsetX}px, ${dragOffsetY}px, 0)`,
            opacity: dragOffsetY > 0 ? Math.max(0.45, 1 - dragOffsetY / 350) : 1,
            transition: isDragging
              ? 'none'
              : 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease',
          }}
        >
          {isFailed ? (
            <div className="w-full max-w-md h-64 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-400 gap-2 p-6 text-center">
              <ImageIcon className="w-8 h-8" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-300">
                사진을 불러올 수 없습니다.
              </p>
              <p className="text-xs text-slate-500">{currentItem.location}</p>
            </div>
          ) : (
            <img
              key={currentItem.id}
              src={currentItem.url}
              alt={`${currentItem.location} 작업 완료 사진`}
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() =>
                setFailedIds((prev) => ({ ...prev, [currentItem.id]: true }))
              }
              className="max-h-[82vh] max-w-full w-auto object-contain rounded-lg"
            />
          )}
        </div>

        {/* Left / Right Navigation Arrows */}
        {total > 1 && (
          <>
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="이전 사진"
              className={`fixed left-2 sm:left-5 top-1/2 -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/55 hover:bg-black/80 border border-white/20 text-white transition-all disabled:opacity-25 disabled:pointer-events-none ${
                showChrome ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <button
              type="button"
              disabled={currentIndex === total - 1}
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="다음 사진"
              className={`fixed right-2 sm:right-5 top-1/2 -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/55 hover:bg-black/80 border border-white/20 text-white transition-all disabled:opacity-25 disabled:pointer-events-none ${
                showChrome ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Bottom Caption & Thumbnail Strip */}
      <footer
        className={`fixed bottom-0 left-0 right-0 z-20 px-4 pt-8 pb-4 pb-safe bg-gradient-to-t from-black/90 via-black/65 to-transparent transition-opacity duration-200 ${
          showChrome ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-4xl mx-auto space-y-3">
          <p className="text-xs sm:text-sm text-slate-100 leading-relaxed line-clamp-2 text-center sm:text-left">
            {currentItem.content}
          </p>

          {total > 1 && (
            <div
              ref={thumbStripRef}
              className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto no-scrollbar py-1"
            >
              {items.map((item, idx) => {
                const active = idx === currentIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`${idx + 1}번째 사진 보기: ${item.location}`}
                    className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                      active
                        ? 'border-white scale-105 opacity-100'
                        : 'border-transparent opacity-55 hover:opacity-85'
                    }`}
                  >
                    <img
                      src={item.url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

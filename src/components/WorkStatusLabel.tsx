import { CheckCircle2, Clock, Siren, Wrench } from 'lucide-react';
import type { WorkStatus } from '../types';

export const WORK_STATUS_OPTIONS: Array<{
  value: WorkStatus;
  label: string;
  textClass: string;
  activeButtonClass: string;
}> = [
  {
    value: 'urgent',
    label: '긴급',
    textClass: 'text-rose-700',
    activeButtonClass: 'bg-rose-600 text-white border-rose-600',
  },
  {
    value: 'pending',
    label: '대기',
    textClass: 'text-amber-700',
    activeButtonClass: 'bg-amber-600 text-white border-amber-600',
  },
  {
    value: 'in_progress',
    label: '진행 중',
    textClass: 'text-blue-700',
    activeButtonClass: 'bg-blue-600 text-white border-blue-600',
  },
  {
    value: 'completed',
    label: '완료',
    textClass: 'text-emerald-700',
    activeButtonClass: 'bg-emerald-700 text-white border-emerald-700',
  },
];

export function getWorkStatusLabel(status: WorkStatus): string {
  const found = WORK_STATUS_OPTIONS.find((opt) => opt.value === status);
  return found ? found.label : '완료';
}

export function WorkStatusLabel({ status }: { status?: WorkStatus }) {
  const safeStatus: WorkStatus = status || 'completed';

  if (safeStatus === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-rose-700 whitespace-nowrap">
        <Siren className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>긴급</span>
      </span>
    );
  }

  if (safeStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>대기</span>
      </span>
    );
  }

  if (safeStatus === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-blue-700 whitespace-nowrap">
        <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>진행 중</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>완료</span>
    </span>
  );
}

export function WorkStatusSelector({
  value,
  onChange,
}: {
  value: WorkStatus;
  onChange: (next: WorkStatus) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 gap-2"
      role="radiogroup"
      aria-label="작업 진행 상태"
    >
      {WORK_STATUS_OPTIONS.map((option) => {
        const active = value === option.value;
        const Icon =
          option.value === 'urgent'
            ? Siren
            : option.value === 'pending'
              ? Clock
              : option.value === 'in_progress'
                ? Wrench
                : CheckCircle2;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap active:scale-[0.98] ${
              active
                ? option.activeButtonClass
                : `bg-slate-50 border-slate-200 ${option.textClass} hover:bg-slate-100`
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

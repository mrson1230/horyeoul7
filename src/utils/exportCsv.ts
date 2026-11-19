import type { WorkLog, WorkStatus } from '../types';
import { getTodayKoreaDate } from './api';

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function formatKoreanTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getStatusLabel(status?: WorkStatus): string {
  if (status === 'urgent') return '긴급';
  if (status === 'pending') return '대기';
  if (status === 'in_progress') return '진행 중';
  return '완료';
}

export function exportWorkLogsToCsv(
  logs: WorkLog[],
  options: {
    apartmentName?: string;
    filterDate?: string;
  } = {}
): void {
  const aptName = (options.apartmentName || '관리사무소').trim() || '관리사무소';
  const headers = [
    '번호',
    '단지명',
    '진행상태',
    '작업날짜',
    '작성자',
    '직책',
    '작업장소',
    '처리내용',
    '사진첨부',
    '최초등록시각',
    '최종수정시각',
  ];

  const rows = logs.map((log, index) => [
    String(index + 1),
    aptName,
    getStatusLabel(log.status),
    log.workDate,
    log.workerName,
    log.workerRole || '직원',
    log.location,
    log.content,
    log.photoUrl ? '첨부됨' : '미첨부',
    formatKoreanTimestamp(log.createdAt),
    formatKoreanTimestamp(log.updatedAt),
  ]);

  const csvBody = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvBody], {
    type: 'text/csv;charset=utf-8;',
  });

  const dateSuffix = options.filterDate || getTodayKoreaDate();
  const safeAptName = aptName.replace(/[\s/\\:*?"<>|]+/g, '');
  const filename = `${safeAptName || '공동작업일지'}_작업일지_${dateSuffix}.csv`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

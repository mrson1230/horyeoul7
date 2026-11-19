import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import {
  ArrowDown,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  ExternalLink,
  ImagePlus,
  MessageCircle,
  Reply,
  Send,
  ShieldAlert,
  Siren,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, compressImageToBase64 } from '../utils/api';
import type { BrowserNotificationState } from '../utils/notifications';
import type {
  ChatMessage,
  ChatOnlineUser,
  ChatRealtimePacket,
  ChatRoomId,
  Worker,
  WorkLog,
} from '../types';

interface StaffChatViewProps {
  apartmentName: string;
  workers: Worker[];
  selectedWorkerId: string;
  isAdmin: boolean;
  wsConnected: boolean;
  onlineUsers: ChatOnlineUser[];
  typingByRoom: Record<ChatRoomId, string | null>;
  urgentLogs: WorkLog[];
  requestedRoom?: { roomId: ChatRoomId; seq: number } | null;
  notificationPermission: BrowserNotificationState;
  onSelectWorker: (workerId: string) => void;
  onMarkRead?: () => void;
  onEmitTyping: (roomId: ChatRoomId) => void;
  subscribeChatEvents: (
    listener: (packet: ChatRealtimePacket) => void
  ) => () => void;
  onOnlineUsersSync: (users: ChatOnlineUser[]) => void;
  onRequestNotificationPermission: () => Promise<void>;
  onQuickCompleteUrgentLog: (log: WorkLog) => Promise<void>;
  onViewUrgentFeed: () => void;
}

const ROOM_META: Record<
  ChatRoomId,
  { label: string; description: string }
> = {
  general: {
    label: '전체 소통방',
    description: '관리사무소 전 직원 일상·업무 공유',
  },
  urgent: {
    label: '긴급·시설 공유방',
    description: '민원·설비 장애·긴급 작업일지 실시간 전파',
  },
};

function formatChatDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

function getKoreaDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const seoul = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return seoul.toISOString().slice(0, 10);
}

function formatChatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getAvatarTint(name: string): string {
  const palette = [
    'bg-teal-700 text-white',
    'bg-sky-700 text-white',
    'bg-amber-700 text-white',
    'bg-indigo-700 text-white',
    'bg-emerald-700 text-white',
    'bg-rose-700 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

export function StaffChatView({
  apartmentName,
  workers,
  selectedWorkerId,
  isAdmin,
  wsConnected,
  onlineUsers,
  typingByRoom,
  urgentLogs,
  requestedRoom,
  notificationPermission,
  onSelectWorker,
  onMarkRead,
  onEmitTyping,
  subscribeChatEvents,
  onOnlineUsersSync,
  onRequestNotificationPermission,
  onQuickCompleteUrgentLog,
  onViewUrgentFeed,
}: StaffChatViewProps) {
  const [roomId, setRoomId] = useState<ChatRoomId>(
    requestedRoom?.roomId || 'general'
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const [draft, setDraft] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const [urgentExpanded, setUrgentExpanded] = useState(false);
  const [urgentMinimized, setUrgentMinimized] = useState(false);
  const [completingLogId, setCompletingLogId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const roomIdRef = useRef<ChatRoomId>(roomId);
  roomIdRef.current = roomId;

  const selectedWorker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId) || null,
    [workers, selectedWorkerId]
  );

  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;

  const onOnlineUsersSyncRef = useRef(onOnlineUsersSync);
  onOnlineUsersSyncRef.current = onOnlineUsersSync;

  useEffect(() => {
    if (requestedRoom?.roomId) {
      setRoomId(requestedRoom.roomId);
      setUrgentMinimized(false);
    }
  }, [requestedRoom]);

  const prevUrgentCountRef = useRef<number>(urgentLogs.length);
  useEffect(() => {
    if (urgentLogs.length > prevUrgentCountRef.current) {
      setUrgentMinimized(false);
    }
    prevUrgentCountRef.current = urgentLogs.length;
  }, [urgentLogs.length]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setShowScrollButton(false);
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const fetchMessages = useCallback(
    async (targetRoom: ChatRoomId, showLoader = false) => {
      if (showLoader) setLoading(true);
      try {
        const res = await apiFetch<{
          messages: ChatMessage[];
          onlineUsers: ChatOnlineUser[];
        }>(`/api/chat/messages?roomId=${targetRoom}`);
        setMessages(res.messages);
        if (Array.isArray(res.onlineUsers)) {
          onOnlineUsersSyncRef.current(res.onlineUsers);
        }
        onMarkReadRef.current?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : '채팅 내역을 불러오지 못했습니다.'
        );
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchMessages(roomId, true).then(() => {
      setTimeout(() => scrollToBottom(false), 30);
    });
  }, [roomId, fetchMessages, scrollToBottom]);

  useEffect(() => {
    const unsubscribe = subscribeChatEvents((payload) => {
      if (payload.type === 'chat:message' && payload.message) {
        const incoming = payload.message;
        if (incoming.roomId === roomIdRef.current) {
          const shouldScroll = isNearBottom();
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          onMarkReadRef.current?.();
          if (shouldScroll) {
            setTimeout(() => scrollToBottom(true), 20);
          } else {
            setShowScrollButton(true);
          }
        }
      } else if (payload.type === 'chat:deleted' && payload.id) {
        setMessages((prev) => prev.filter((m) => m.id !== payload.id));
      } else if (payload.type === 'worklog:urgent' && payload.chatMessage) {
        const incoming = payload.chatMessage;
        setUrgentMinimized(false);
        if (incoming.roomId === roomIdRef.current) {
          const shouldScroll = isNearBottom();
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          onMarkReadRef.current?.();
          if (shouldScroll) {
            setTimeout(() => scrollToBottom(true), 20);
          } else {
            setShowScrollButton(true);
          }
        }
      }
    });
    return unsubscribe;
  }, [subscribeChatEvents, isNearBottom, scrollToBottom]);

  useEffect(() => {
    if (wsConnected) {
      void fetchMessages(roomIdRef.current, false);
    }
  }, [wsConnected, fetchMessages]);

  useEffect(() => {
    if (wsConnected) return;
    const interval = setInterval(() => {
      void fetchMessages(roomIdRef.current, false);
      if (selectedWorkerId) {
        void apiFetch<{ onlineUsers: ChatOnlineUser[] }>('/api/chat/presence', {
          method: 'POST',
          body: JSON.stringify({ workerId: selectedWorkerId }),
        })
          .then((res) => onOnlineUsersSyncRef.current(res.onlineUsers || []))
          .catch(() => {});
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [wsConnected, fetchMessages, selectedWorkerId]);

  const handlePhotoSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressImageToBase64(file);
      setImageBase64(compressed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '사진을 불러오지 못했습니다.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleEmitTyping = () => {
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < 1500) return;
    if (!selectedWorker) return;
    lastTypingSentAtRef.current = now;
    onEmitTyping(roomId);
  };

  const sendMessage = async () => {
    if (sending) return;
    if (!selectedWorkerId) {
      setError('채팅을 보내려면 먼저 상단에서 본인 이름을 선택해 주세요.');
      return;
    }
    if (!draft.trim() && !imageBase64) return;

    setError(null);
    setSending(true);
    const messageText = draft.trim();
    const photoPayload = imageBase64;
    const replyPayload = replyTarget;

    try {
      const res = await apiFetch<{ message: ChatMessage }>('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          workerId: selectedWorkerId,
          message: messageText,
          imageBase64: photoPayload,
          replyToId: replyPayload?.id || null,
          replyToSender: replyPayload?.workerName || null,
          replyToText:
            replyPayload?.message || (replyPayload?.imageUrl ? '[사진]' : null),
        }),
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      setDraft('');
      setImageBase64(null);
      setReplyTarget(null);
      onMarkReadRef.current?.();
      setTimeout(() => scrollToBottom(true), 20);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '메시지 전송에 실패했습니다.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    setError(null);
    try {
      const qs = selectedWorkerId
        ? `?actingWorkerId=${encodeURIComponent(selectedWorkerId)}`
        : '';
      await apiFetch(`/api/chat/messages/${msgId}${qs}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '메시지 삭제에 실패했습니다.'
      );
    }
  };

  const handleCompleteUrgentFromChat = async (log: WorkLog) => {
    setError(null);
    setCompletingLogId(log.id);
    try {
      await onQuickCompleteUrgentLog(log);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '긴급 작업 완료 처리에 실패했습니다.'
      );
    } finally {
      setCompletingLogId(null);
    }
  };

  const typingUser = typingByRoom[roomId] || null;
  const primaryUrgent = urgentLogs[0] || null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[calc(100vh-14.5rem)] min-h-[520px] max-h-[820px]">
      {/* KakaoTalk-inspired Top Chat Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 sm:px-5 border-b border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#FEE500] text-slate-900 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold truncate">
                {apartmentName} {ROOM_META[roomId].label}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      wsConnected ? 'bg-emerald-400' : 'bg-amber-300'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{wsConnected ? '실시간 연결됨' : '자동 동기화 중'}</span>
                </span>
                {onlineUsers.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-teal-300 font-medium">
                      <Users className="w-3 h-3" aria-hidden="true" />
                      <span>
                        참여 {onlineUsers.length}명 (
                        {onlineUsers
                          .slice(0, 3)
                          .map((u) => u.workerName)
                          .join(', ')}
                        {onlineUsers.length > 3
                          ? ` 외 ${onlineUsers.length - 3}명`
                          : ''}
                        )
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {notificationPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={() => void onRequestNotificationPermission()}
                disabled={notificationPermission === 'granted'}
                title={
                  notificationPermission === 'granted'
                    ? '긴급 작업 발생 시 브라우저 푸시 알림을 받습니다.'
                    : notificationPermission === 'denied'
                      ? '브라우저 사이트 설정에서 알림 권한을 허용해 주세요.'
                      : '긴급 작업 발생 시 실시간 브라우저 푸시 알림을 받으려면 클릭하세요.'
                }
                className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                  notificationPermission === 'granted'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 cursor-default'
                    : notificationPermission === 'denied'
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {notificationPermission === 'granted' ? (
                  <BellRing className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : notificationPermission === 'denied' ? (
                  <BellOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {notificationPermission === 'granted'
                    ? '긴급 알림 ON'
                    : notificationPermission === 'denied'
                      ? '알림 차단됨'
                      : '푸시 알림 켜기'}
                </span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setRoomId('general')}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  roomId === 'general'
                    ? 'bg-[#FEE500] text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                전체 소통방
              </button>
              <button
                type="button"
                onClick={() => setRoomId('urgent')}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap relative ${
                  roomId === 'urgent'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                <span>긴급·시설</span>
                {urgentLogs.length > 0 && roomId !== 'urgent' && (
                  <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {urgentLogs.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Sender Selector Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <label
              htmlFor="chat-worker-select"
              className="text-xs font-semibold text-slate-300 whitespace-nowrap shrink-0"
            >
              내 이름:
            </label>
            <select
              id="chat-worker-select"
              value={selectedWorkerId}
              onChange={(e) => onSelectWorker(e.target.value)}
              className="min-h-[38px] max-w-[230px] w-full px-2.5 py-1 text-xs sm:text-sm bg-slate-800 border border-slate-700 rounded-lg text-white font-medium focus:outline-none focus:border-[#FEE500]"
            >
              <option value="">작업자(본인)를 선택하세요</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.role})
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            {ROOM_META[roomId].description}
          </p>
        </div>
      </div>

      {/* Pinned Top Highlight Alert Banner for Active Urgent Work Logs */}
      {primaryUrgent && (
        <div
          role="region"
          aria-label="긴급 작업 상단 강조 알림"
          className="bg-gradient-to-r from-rose-50 via-rose-50/95 to-amber-50 border-b-2 border-rose-300 px-3.5 py-2.5 sm:px-5"
        >
          {urgentMinimized ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setUrgentMinimized(false)}
                className="flex items-center gap-2 text-xs font-bold text-rose-800 hover:text-rose-950 min-w-0"
              >
                <Siren
                  className="w-4 h-4 text-rose-600 shrink-0 animate-pulse"
                  aria-hidden="true"
                />
                <span className="truncate">
                  진행 중인 긴급 작업 {urgentLogs.length}건 — {primaryUrgent.location}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setUrgentMinimized(false)}
                className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 whitespace-nowrap shrink-0 flex items-center gap-0.5"
              >
                <span>펼치기</span>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <Siren className="w-4 h-4 animate-pulse" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold tracking-wide">
                        긴급 작업 알림
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-rose-950 truncate">
                        {primaryUrgent.location}
                      </span>
                      <span className="text-[11px] font-medium text-rose-700 whitespace-nowrap">
                        · {primaryUrgent.workerName} ({primaryUrgent.workDate})
                      </span>
                      {urgentLogs.length > 1 && (
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-md tabular-nums">
                          총 {urgentLogs.length}건
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-800 line-clamp-2 leading-snug">
                      {primaryUrgent.content}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {roomId !== 'urgent' && (
                    <button
                      type="button"
                      onClick={() => setRoomId('urgent')}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors whitespace-nowrap"
                    >
                      긴급방 이동
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onViewUrgentFeed}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white hover:bg-rose-100 border border-rose-200 text-rose-800 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    <span>내역 확인</span>
                  </button>
                  {(isAdmin ||
                    (selectedWorkerId &&
                      primaryUrgent.workerId === selectedWorkerId)) && (
                    <button
                      type="button"
                      disabled={completingLogId === primaryUrgent.id}
                      onClick={() =>
                        void handleCompleteUrgentFromChat(primaryUrgent)
                      }
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                      <span>
                        {completingLogId === primaryUrgent.id
                          ? '처리 중...'
                          : '조치완료'}
                      </span>
                    </button>
                  )}
                  {urgentLogs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setUrgentExpanded((prev) => !prev)}
                      className="min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-800 hover:bg-rose-100 inline-flex items-center gap-0.5 whitespace-nowrap"
                    >
                      <span>{urgentExpanded ? '접기' : `+${urgentLogs.length - 1}건`}</span>
                      {urgentExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setUrgentMinimized(true)}
                    aria-label="긴급 알림 접기"
                    title="접기"
                    className="p-1.5 text-rose-500 hover:text-rose-800 hover:bg-rose-100 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {urgentExpanded && urgentLogs.length > 1 && (
                <div className="pt-2 border-t border-rose-200/80 space-y-1.5 max-h-32 overflow-y-auto">
                  {urgentLogs.slice(1).map((extra) => (
                    <div
                      key={extra.id}
                      className="flex items-center justify-between gap-2 text-xs bg-white/80 border border-rose-200 rounded-lg px-2.5 py-1.5"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-bold text-rose-900">
                          {extra.location}
                        </span>
                        <span className="text-slate-500">
                          {' '}
                          · {extra.workerName} ·{' '}
                        </span>
                        <span className="text-slate-700">{extra.content}</span>
                      </div>
                      {(isAdmin ||
                        (selectedWorkerId &&
                          extra.workerId === selectedWorkerId)) && (
                        <button
                          type="button"
                          disabled={completingLogId === extra.id}
                          onClick={() => void handleCompleteUrgentFromChat(extra)}
                          className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold shrink-0"
                        >
                          완료
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chat Message Canvas (KakaoTalk Classic Blue-Slate Canvas) */}
      <div className="relative flex-1 bg-[#d6e2ec] overflow-hidden flex flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={() => setShowScrollButton(!isNearBottom())}
          className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-2.5"
        >
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs font-medium text-slate-600 bg-white/80 px-4 py-2 rounded-full">
                대화 내용을 불러오는 중입니다...
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-white/80 text-slate-600 flex items-center justify-center mb-3 shadow-xs">
                <MessageCircle className="w-6 h-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                {ROOM_META[roomId].label}의 첫 대화를 시작해 보세요
              </p>
              <p className="mt-1 text-xs text-slate-600 max-w-xs leading-relaxed">
                현장 사진 공유, 교대 인계 확인, 긴급 작업일지 연동 알림을 직원들과 실시간으로 나눌 수 있습니다.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const prev = idx > 0 ? messages[idx - 1] : null;
              const isMine = Boolean(
                selectedWorkerId && msg.workerId === selectedWorkerId
              );
              const isUrgentSystemLink = Boolean(
                msg.replyToSender?.includes('긴급 작업일지 연동') ||
                  msg.message.startsWith('[긴급 작업')
              );
              const showDateDivider =
                !prev ||
                getKoreaDayKey(prev.createdAt) !== getKoreaDayKey(msg.createdAt);
              const sameSenderAsPrev =
                !showDateDivider &&
                prev?.workerId === msg.workerId &&
                formatChatTime(prev.createdAt) === formatChatTime(msg.createdAt);
              const canDelete = isMine || isAdmin;

              return (
                <div key={msg.id} className="space-y-2">
                  {showDateDivider && (
                    <div className="flex justify-center my-2">
                      <span className="px-3 py-1 rounded-full bg-slate-800/35 text-white text-[11px] font-medium">
                        {formatChatDayLabel(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  <div
                    className={`flex items-end gap-2 ${
                      isMine ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {!isMine && (
                      <div className="w-9 shrink-0 self-start">
                        {!sameSenderAsPrev && (
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shadow-xs ${getAvatarTint(
                              msg.workerName
                            )}`}
                          >
                            {msg.workerName.slice(0, 1)}
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      className={`max-w-[78%] sm:max-w-[68%] flex flex-col ${
                        isMine ? 'items-end' : 'items-start'
                      }`}
                    >
                      {!isMine && !sameSenderAsPrev && (
                        <div className="mb-1 px-0.5 flex items-center gap-1.5 text-xs">
                          <span className="font-bold text-slate-800">
                            {msg.workerName}
                          </span>
                          <span className="text-[11px] text-slate-600">
                            {msg.workerRole}
                          </span>
                        </div>
                      )}

                      <div
                        className={`group flex items-end gap-1.5 ${
                          isMine ? 'flex-row-reverse' : 'flex-row'
                        }`}
                      >
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 shadow-xs break-words ${
                            isUrgentSystemLink
                              ? 'bg-rose-50 border-2 border-rose-400 text-slate-900'
                              : isMine
                                ? 'bg-[#FEE500] text-slate-900 rounded-tr-sm'
                                : 'bg-white text-slate-900 rounded-tl-sm'
                          }`}
                        >
                          {isUrgentSystemLink && (
                            <div className="mb-1.5 pb-1.5 border-b border-rose-200 flex items-center gap-1.5 text-[11px] font-bold text-rose-700">
                              <Siren
                                className="w-3.5 h-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              <span>긴급 작업일지 자동 알림</span>
                            </div>
                          )}

                          {msg.replyToSender && !isUrgentSystemLink && (
                            <div
                              className={`mb-2 pb-1.5 border-b text-[11px] ${
                                isMine
                                  ? 'border-slate-900/15 text-slate-700'
                                  : 'border-slate-200 text-slate-500'
                              }`}
                            >
                              <div className="flex items-center gap-1 font-semibold">
                                <CornerDownRight className="w-3 h-3 shrink-0" />
                                <span>{msg.replyToSender}님에게 답장</span>
                              </div>
                              {msg.replyToText && (
                                <p className="mt-0.5 line-clamp-1 opacity-85">
                                  {msg.replyToText}
                                </p>
                              )}
                            </div>
                          )}

                          {msg.imageUrl && (
                            <button
                              type="button"
                              onClick={() => setZoomedImageUrl(msg.imageUrl)}
                              className="block mb-1.5 rounded-xl overflow-hidden border border-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                            >
                              <img
                                src={msg.imageUrl}
                                alt="채팅 첨부 사진"
                                className="max-h-56 w-auto object-cover"
                              />
                            </button>
                          )}

                          {msg.message && (
                            <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
                              {msg.message}
                            </p>
                          )}
                        </div>

                        <div
                          className={`flex flex-col gap-0.5 shrink-0 ${
                            isMine ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setReplyTarget(msg)}
                              aria-label="답장하기"
                              title="답장"
                              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white/70 rounded"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteMessage(msg.id)}
                                aria-label="메시지 삭제"
                                title="삭제"
                                className="p-1 text-slate-500 hover:text-red-600 hover:bg-white/70 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-600 tabular-nums whitespace-nowrap">
                            {formatChatTime(msg.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {typingUser && (
          <div className="px-4 py-1 bg-[#d6e2ec]/90 text-[11px] font-medium text-slate-700">
            {typingUser}님이 입력 중...
          </div>
        )}

        {showScrollButton && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-slate-900/85 hover:bg-slate-900 text-white text-xs font-semibold shadow-md flex items-center gap-1"
          >
            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>최신 대화</span>
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-2 bg-red-50 border-t border-red-200 text-xs text-red-700 font-medium flex items-center justify-between gap-2"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {(replyTarget || imageBase64) && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {replyTarget && (
            <div className="min-w-0 flex-1 flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-teal-800">
                  {replyTarget.workerName}님에게 답장
                </p>
                <p className="text-xs text-slate-600 truncate">
                  {replyTarget.message || '[사진]'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                aria-label="답장 취소"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {imageBase64 && (
            <div className="relative inline-flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1.5">
              <img
                src={imageBase64}
                alt="전송할 사진 미리보기"
                className="w-12 h-12 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => setImageBase64(null)}
                aria-label="첨부 사진 제거"
                className="p-1 text-slate-500 hover:text-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border-t border-slate-200 p-2.5 sm:p-3 flex items-end gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="사진 첨부"
          title="사진 첨부"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors shrink-0"
        >
          <ImagePlus className="w-5 h-5" aria-hidden="true" />
        </button>

        <textarea
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            handleEmitTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedWorker
              ? `${selectedWorker.name}님으로 메시지 입력 (Enter 전송)`
              : '상단에서 본인 이름을 먼저 선택해 주세요'
          }
          className="flex-1 min-h-[44px] max-h-28 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:bg-white focus:border-teal-700"
        />

        <button
          type="submit"
          disabled={sending || (!draft.trim() && !imageBase64)}
          className="min-h-[44px] px-4 py-2 bg-[#FEE500] hover:bg-[#f5dc00] disabled:bg-slate-200 disabled:text-slate-400 text-slate-900 text-sm font-bold rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">전송</span>
        </button>
      </form>

      {zoomedImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomedImageUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setZoomedImageUrl(null)}
            aria-label="닫기"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={zoomedImageUrl}
            alt="확대 사진"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}

const TOKEN_KEY = 'horyeoul7_session_token';
const WORKER_KEY = 'horyeoul7_selected_worker_id';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getStoredWorkerId(): string {
  try {
    return localStorage.getItem(WORKER_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredWorkerId(workerId: string): void {
  try {
    if (workerId) {
      localStorage.setItem(WORKER_KEY, workerId);
    } else {
      localStorage.removeItem(WORKER_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getKoreaDateOffset(offsetDays = 0): string {
  const now = new Date();
  const seoulOffsetMs = 9 * 60 * 60 * 1000;
  const seoulDate = new Date(
    now.getTime() + seoulOffsetMs + offsetDays * 24 * 60 * 60 * 1000
  );
  return seoulDate.toISOString().slice(0, 10);
}

export function getTodayKoreaDate(): string {
  return getKoreaDateOffset(0);
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let message = `요청 처리 중 오류가 발생했습니다. (HTTP ${res.status})`;
    if (contentType.includes('application/json')) {
      try {
        const data = (await res.json()) as {
          error?: string;
          code?: string;
        };
        console.error('[apiFetch] JSON Error Response:', {
          method: options.method || 'GET',
          url,
          status: res.status,
          code: data.code,
          error: data.error,
        });
        if (data.error) {
          message = data.code ? `${data.error} [${data.code}]` : data.error;
        }
      } catch {
        console.error('[apiFetch] Failed to parse error JSON:', {
          method: options.method || 'GET',
          url,
          status: res.status,
        });
      }
    } else {
      const rawSnippet = await res
        .text()
        .then((txt) => txt.slice(0, 200))
        .catch(() => '');
      console.error('[apiFetch] Non-JSON Error Response:', {
        method: options.method || 'GET',
        url,
        status: res.status,
        contentType,
        bodySnippet: rawSnippet,
      });
    }
    throw new Error(message);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  if (contentType.includes('text/html')) {
    console.error('[apiFetch] Unexpected HTML response for API endpoint:', {
      method: options.method || 'GET',
      url,
      status: res.status,
      contentType,
    });
    throw new Error(
      'API 서버 응답을 받지 못했습니다. 배포 환경의 API 경로 설정을 확인해 주세요.'
    );
  }
  return {} as T;
}

export async function compressImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('사진 파일을 읽을 수 없습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('올바른 이미지 파일이 아닙니다.'));
      img.onload = () => {
        const maxWidth = 1400;
        const maxHeight = 1400;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('이미지 처리에 실패했습니다.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        resolve(compressed);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function formatKoreanDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
